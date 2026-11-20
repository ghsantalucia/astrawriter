/**
 * @file scripts/release.js
 * @description Gera as duas versões do app para Windows, já auditadas:
 *   1. regenera o livro padrão "Manual de Uso" (a partir do guia do usuário);
 *   2. `electron-forge make`: empacota e gera o INSTALADOR (Setup.exe + nupkg + RELEASES, usados na atualização automática) e
 *      o ZIP PORTÁTIL (descompacte e execute "Astra Writer.exe");
 *   3. audita o pacote (nenhuma chave de API, nenhum livro, nenhum dado de teste, nenhum caminho do computador de quem gerou);
 *   4. copia o resultado para `release/` com nomes limpos.
 * Uso: npm run release      (feche o app antes: ele trava a pasta `out/`)
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, process.env.FORGE_OUT_DIR || 'out');
const version = require(path.join(root, 'package.json')).version;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\n❌ Falhou: ${command} ${args.join(' ')}`);
    process.exit(result.status || 1);
  }
}

if (!process.env.SKIP_MAKE) {
console.log('\n📖 1/4 Gerando o livro padrão "Manual de Uso"...');
run('node', ['scripts/build-manual.js']);

console.log('\n📦 2/4 Empacotando e gerando instalador + versão portátil (Electron Forge)...');
fs.rmSync(path.join(outDir, 'make'), { recursive: true, force: true });
run('npx', ['electron-forge', 'make']);
}

console.log('\n🔎 3/4 Auditando o pacote (vazamento de dados)...');
run('node', ['scripts/audit-package.js']);

console.log('\n📁 4/4 Copiando para release/ ...');
const releaseDir = path.join(root, 'release');
fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });
const make = path.join(outDir, 'make');
const squirrel = path.join(make, 'squirrel.windows', 'x64');
const copies = [];
if (fs.existsSync(squirrel)) {
  for (const name of fs.readdirSync(squirrel)) {
    // Setup.exe (instalador), .nupkg e RELEASES (atualização automática)
    if (/\.(exe|nupkg)$/i.test(name) || name === 'RELEASES') copies.push([path.join(squirrel, name), name]);
  }
}
const zipDir = path.join(make, 'zip', 'win32', 'x64');
if (fs.existsSync(zipDir)) {
  for (const name of fs.readdirSync(zipDir)) {
    if (name.endsWith('.zip')) copies.push([path.join(zipDir, name), `AstraWriter-portable-${version}-win-x64.zip`]);
  }
}
for (const [from, name] of copies) {
  fs.copyFileSync(from, path.join(releaseDir, name));
  console.log(`   ${name}  (${(fs.statSync(from).size / 1048576).toFixed(0)} MB)`);
}
console.log('\n✅ Pronto! Os arquivos estão em release/. Instale o Setup.exe numa máquina limpa para testar.');
