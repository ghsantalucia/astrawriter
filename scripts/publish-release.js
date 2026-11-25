/**
 * @file scripts/publish-release.js
 * @description Publica os arquivos de `release/` como uma release do GitHub (sem precisar do GitHub CLI), usando a credencial
 * que o Git já guarda neste computador (a mesma do `git push`).
 * Uso: [RECREATE=1] node scripts/publish-release.js [tag] [commit-ou-branch]     ex.: node scripts/publish-release.js v1.0.0 ai_integration
 * A tag padrão é `v<versão do package.json>`. Se a release da tag já existir, os arquivos dela são substituídos.
 */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const tag = process.argv[2] || `v${version}`;
const target = process.argv[3] || execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root }).toString().trim();
const repo = 'ghsantalucia/astrawriter';
const releaseDir = path.join(root, 'release');

/** Token guardado pelo Git (nunca é mostrado). */
function token() {
  const out = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' }).stdout;
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error('Não encontrei a credencial do GitHub no Git. Faça um `git push` uma vez para gravá-la.');
  return m[1].trim();
}

async function api(method, url, body, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'astra-writer-release', ...headers },
    body,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* sem JSON */ }
  if (!res.ok && res.status !== 404) throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 300)}`);
  return { status: res.status, json };
}

const TOKEN = token();

(async () => {
  const files = fs.existsSync(releaseDir) ? fs.readdirSync(releaseDir) : [];
  if (!files.length) throw new Error('A pasta release/ está vazia. Rode `npm run release` antes.');

  let rel = (await api('GET', `https://api.github.com/repos/${repo}/releases/tags/${tag}`)).json;
  // RECREATE=1: apaga a release e a tag existentes e recria (para a tag apontar para o commit novo)
  if (rel && rel.id && process.env.RECREATE) {
    console.log(`Apagando a release ${tag} para recriá-la...`);
    await api('DELETE', `https://api.github.com/repos/${repo}/releases/${rel.id}`);
    await api('DELETE', `https://api.github.com/repos/${repo}/git/refs/tags/${tag}`);
    rel = null;
  }
  if (!rel || !rel.id) {
    console.log(`Criando a release ${tag} (a partir de ${target})...`);
    rel = (await api('POST', `https://api.github.com/repos/${repo}/releases`, JSON.stringify({
      tag_name: tag,
      target_commitish: target,
      name: `Astra Writer ${version}`,
      body: process.env.RELEASE_NOTES || `Astra Writer ${version}.\n\n- **AstraWriter-Setup-${version}.exe**: instalador com assistente (escolha da pasta e dos atalhos).\n- **AstraWriter-portable-${version}-win-x64.zip**: versão portátil (descompacte e execute).\n- \`RELEASES\` e \`.nupkg\`: usados pela atualização automática (não precisa baixar).`,
      draft: false,
      prerelease: false,
    }), { 'content-type': 'application/json' })).json;
  } else {
    console.log(`A release ${tag} já existe: substituindo os arquivos.`);
  }

  const existing = (await api('GET', `https://api.github.com/repos/${repo}/releases/${rel.id}/assets?per_page=100`)).json || [];
  for (const name of files) {
    const old = existing.find((a) => a.name === name);
    if (old) await api('DELETE', `https://api.github.com/repos/${repo}/releases/assets/${old.id}`);
    const file = path.join(releaseDir, name);
    const size = fs.statSync(file).size;
    console.log(`Enviando ${name} (${(size / 1048576).toFixed(0)} MB)...`);
    // curl envia arquivos grandes em fluxo (sem carregar tudo na memória)
    const r = spawnSync('curl', ['-sS', '-X', 'POST', '-H', `Authorization: Bearer ${TOKEN}`, '-H', 'Content-Type: application/octet-stream', '-H', 'Accept: application/vnd.github+json', '--data-binary', `@${file}`, `https://uploads.github.com/repos/${repo}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`], { encoding: 'utf8' });
    if (r.status !== 0 || /"message"/.test(r.stdout || '')) throw new Error(`Falha ao enviar ${name}: ${(r.stdout || r.stderr || '').slice(0, 300)}`);
  }
  console.log(`\n✅ Release publicada: ${rel.html_url}`);
})().catch((e) => { console.error(`❌ ${e.message}`); process.exit(1); });
