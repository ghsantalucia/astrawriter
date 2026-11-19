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
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
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