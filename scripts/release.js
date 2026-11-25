/**
 * @file scripts/release.js
 * @description Gera as versões do app para Windows, já auditadas:
 *   1. regenera o livro padrão "Manual de Uso" (a partir do guia do usuário);
 *   2. `electron-forge make`: empacota o app, gera o ZIP PORTÁTIL e o pacote Squirrel (nupkg + RELEASES), que só serve para
 *      atualizar quem instalou a 1.0.0 pelo instalador antigo;
 *   3. audita o pacote (nenhuma chave de API, nenhum livro, nenhum dado de teste, nenhum caminho do computador de quem gerou);
 *   4. `electron-builder --prepackaged`: gera o INSTALADOR COM ASSISTENTE (NSIS: escolha da pasta e dos atalhos) mais o
 *      latest.yml e o blockmap (atualização automática do electron-updater);
 *   5. copia o resultado para `release/` com nomes limpos.
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
  console.log('\n📖 1/5 Gerando o livro padrão "Manual de Uso"...');
  run('node', ['scripts/build-manual.js']);

  console.log('\n📦 2/5 Empacotando (Electron Forge): versão portátil e pacote de atualização da 1.0.0...');
  fs.rmSync(path.join(outDir, 'make'), { recursive: true, force: true });
  run('npx', ['electron-forge', 'make']);
}

console.log('\n🔎 3/5 Auditando o pacote (vazamento de dados)...');
run('node', ['scripts/audit-package.js']);

console.log('\n🧙 4/5 Gerando o instalador com assistente (NSIS)...');
const builderOut = path.join(root, 'release-build');
fs.rmSync(builderOut, { recursive: true, force: true });
const packaged = fs.readdirSync(outDir).find((n) => /-win32-x64$/.test(n));
run('npx', ['electron-builder', '--win', 'nsis', '--x64', '--prepackaged', `"${path.join(outDir, packaged)}"`, '--publish', 'never']);

console.log('\n📁 5/5 Copiando para release/ ...');
const releaseDir = path.join(root, 'release');
fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });
const make = path.join(outDir, 'make');
const copies = [];
// Instalador com assistente + latest.yml e blockmap (electron-updater)
for (const name of fs.readdirSync(builderOut)) {
  if (/^AstraWriter-Setup-.*\.(exe|blockmap)$/i.test(name) || name === 'latest.yml') copies.push([path.join(builderOut, name), name]);
}
// Pacote Squirrel: só o .nupkg e o RELEASES (atualizam quem instalou a 1.0.0 pelo instalador antigo); o Setup.exe do Squirrel não é publicado
const squirrel = path.join(make, 'squirrel.windows', 'x64');
if (fs.existsSync(squirrel)) {
  for (const name of fs.readdirSync(squirrel)) {
    if (/\.nupkg$/i.test(name) || name === 'RELEASES') copies.push([path.join(squirrel, name), name]);
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
console.log(`\n✅ Pronto! Os arquivos estão em release/. Instale o AstraWriter-Setup-${version}.exe numa máquina limpa para testar.`);
