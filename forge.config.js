const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  // Pasta de saída do empacotamento (padrão: out)
  outDir: process.env.FORGE_OUT_DIR || 'out',
  packagerConfig: {
    asar: true,
    // Nome do executável e ícone (public/icon.ico)
    executableName: 'Astra Writer',
    icon: 'public/icon',
    // Vão para a pasta resources/ do app instalado: o modelo de livro e o ícone da janela
    extraResource: ['templates', 'public/icon.ico'],
    // Empacota só o resultado do build (.vite) e as dependências de produção (o main usa require em runtime)
    ignore: (file) => {
      if (!file) return false;
      return !(/^\/\.vite/.test(file) || /^\/node_modules/.test(file) || file === '/package.json');
    },
  },
  // Enxuga o app empacotado: só os idiomas do Chromium que o app usa (pt-BR e en-US) e a lista de licenças (20 MB), que
  // já vai no LICENSE. Economiza ~70 MB sem afetar nada (o app só tem interface em português).
  hooks: {
    postPackage: async (_config, result) => {
      const fs = require('fs');
      const path = require('path');
      for (const dir of result.outputPaths) {
        const locales = path.join(dir, 'locales');
        if (fs.existsSync(locales)) {
          for (const name of fs.readdirSync(locales)) {
            if (!/^(pt-BR|en-US)\.pak$/.test(name)) fs.rmSync(path.join(locales, name), { force: true });
          }
        }
        fs.rmSync(path.join(dir, 'LICENSES.chromium.html'), { force: true });
      }
    },
  },
  rebuildConfig: {},
  // Publicação das versões nas releases do repositório público (npm run publish; precisa de GITHUB_TOKEN).
  // O app instalado consulta essas releases para se atualizar (update.electronjs.org).
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'ghsantalucia', name: 'astrawriter' },
        prerelease: false,
        draft: true,
      },
    },
  ],
  makers: [
    {
      // Instalador do Windows (Setup.exe: instala só para o usuário atual, sem administrador, e se atualiza pelas releases)
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'AstraWriter',
        exe: 'Astra Writer.exe',
        setupExe: 'AstraWriter-Setup.exe',
        setupIcon: 'public/icon.ico',
        authors: 'ghsantalucia',
        description: 'Astra Writer: editor de livros com assistente de IA',
      },
    },
    {
      // Zip: no Windows é a versão portátil (descompacte e execute "Astra Writer.exe"; não se atualiza sozinha)
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            // Aponta para o main.ts dentro de src/main/
            entry: 'src/main/main.ts',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            // Aponta para o preload.ts dentro de src/preload/
            entry: 'src/preload/preload.ts',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};