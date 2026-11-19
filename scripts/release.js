/**
 * @file scripts/release.js
 * @description Gera o instalador do Windows (NSIS) do app:
 *   1. empacota o app com o Electron Forge (pasta `out/` ou a de FORGE_OUT_DIR);
 *   2. remove a pasta `books/` do pacote (se alguém abriu o app empacotado antes, ela existiria com livros de teste);
 *   3. gera o instalador com o electron-builder em `release/`.
 * Uso: npm run release
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = process.env.FORGE_OUT_DIR || 'out';
const packaged = path.join(root, outDir, 'draftweaver-v2-win32-x64');

/**
 * Executa um comando mostrando a saída e interrompe tudo se ele falhar.
 * @param {string} command - Comando.
 * @param {string[]} args - Argumentos.
 * @returns {void}
 */
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\n❌ Falhou: ${command} ${args.join(' ')}`);
    process.exit(result.status || 1);
  }
}

console.log('\n📦 1/3 Empacotando o app (Electron Forge)...');
run('npx', ['electron-forge', 'package']);

console.log('\n🧹 2/3 Garantindo que o pacote não leve livros de teste...');
fs.rmSync(path.join(packaged, 'books'), { recursive: true, force: true });

console.log('\n🛠️  3/3 Gerando o instalador (electron-builder)...');
run('npx', ['electron-builder', '--prepackaged', `"${path.join(outDir, 'draftweaver-v2-win32-x64')}"`, '--win', 'nsis']);

console.log('\n✅ Pronto! O instalador está na pasta release/ ("Astra Writer Setup 1.0.0.exe").');
