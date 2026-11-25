/**
 * @file scripts/audit-package.js
 * @description Confere o app empacotado (`out/<nome>-win32-x64`) antes de distribuir: procura chaves de API, livros e arquivos
 * de teste, e qualquer menção ao computador de quem gerou o pacote. Falha (código 1) se encontrar algo.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, process.env.FORGE_OUT_DIR || 'out');
const dirs = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((n) => /-win32-x64$/.test(n)) : [];
if (dirs.length === 0) {
  console.error('Nenhum pacote *-win32-x64 em out/. Rode o empacotamento antes.');
  process.exit(1);
}
const pkg = path.join(outDir, dirs[0]);

const problems = [];
const bad = (text) => problems.push(text);

// 1. Pastas e arquivos que nunca devem ir no pacote
for (const rel of ['books', 'resources/books', '.system', 'resources/.system', 'debug.log', 'resources/app-update.yml']) {
  if (fs.existsSync(path.join(pkg, rel))) bad(`Existe no pacote: ${rel}`);
}

// 2. Extrai o app.asar e junta tudo o que vai ser lido
const asar = path.join(pkg, 'resources', 'app.asar');
const extracted = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-audit-'));
try {
  require('@electron/asar').extractAll(asar, extracted);
} catch (error) {
  bad(`Não consegui extrair o app.asar: ${error.message}`);
}

/** Termos que não podem aparecer (chaves de API e dados de quem gerou). */
const user = os.userInfo().username;
const patterns = [
  { name: 'chave Google (AIza...)', re: /AIza[0-9A-Za-z_-]{30,}/ },
  { name: 'chave OpenAI/Anthropic (sk-...)', re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{30,}/ },
  { name: 'chave Groq (gsk_...)', re: /\bgsk_[A-Za-z0-9]{30,}/ },
  { name: 'token do GitHub', re: /\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{30,}/ },
  { name: 'caminho do computador de quem gerou', re: new RegExp(`[A-Za-z]:\\\\\\\\?Users\\\\\\\\?${user}`, 'i') },
  { name: 'livro de teste (Eldoria)', re: /Segredo de Eldoria/i },
];

/** Percorre uma pasta procurando os padrões em arquivos de texto. */
function scan(dir, label) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue; // código de terceiros (sem dados do usuário)
      scan(file, label);
    } else if (/\.(js|json|md|yml|yaml|html|css|hbs|txt|map)$/i.test(entry.name) && fs.statSync(file).size < 20 * 1024 * 1024) {
      const text = fs.readFileSync(file, 'utf8');
      for (const p of patterns) if (p.re.test(text)) bad(`${p.name} em ${label}/${path.relative(dir === file ? path.dirname(file) : dir, file)}`);
    }
  }
}
if (fs.existsSync(extracted)) scan(extracted, 'app.asar');
const templates = path.join(pkg, 'resources', 'templates');
if (fs.existsSync(templates)) scan(templates, 'templates');
else bad('resources/templates não existe (o app precisa dos modelos).');
for (const must of ['templates/book/config.json', 'templates/manual/config.json', 'templates/profiles']) {
  if (!fs.existsSync(path.join(pkg, 'resources', must))) bad(`Falta no pacote: resources/${must}`);
}

// 3. O manual e os modelos não podem ter dados de teste
const manualConfig = path.join(templates, 'manual', 'config.json');
if (fs.existsSync(manualConfig)) {
  const cfg = JSON.parse(fs.readFileSync(manualConfig, 'utf8'));
  if (cfg.book_title !== 'Manual de Uso') bad('O livro padrão não é o "Manual de Uso".');
  if (/^[A-Za-z]:|^[\\/]/.test(String(cfg.explorer_state?.open_file || ''))) bad('O manual guarda um caminho absoluto de outro computador.');
}

fs.rmSync(extracted, { recursive: true, force: true });

if (problems.length) {
  console.error('\n❌ A auditoria encontrou problemas:');
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}
console.log(`✅ Pacote limpo: ${dirs[0]} (sem chaves, sem livros, sem dados de teste).`);
