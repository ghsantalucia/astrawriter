# Guia de Instalação e Release — Astra Writer

Como gerar o instalador do Windows e como o app se comporta depois de instalado.

## 1. Gerar o instalador

Na raiz do projeto:

```bash
npm run release
```

O comando faz três coisas (ver `scripts/release.js`):

1. empacota o app com o Electron Forge (pasta `out/`);
2. remove do pacote qualquer pasta `books/` (assim o instalador sempre leva `books/` **vazia**);
3. gera o instalador com o electron-builder.

O resultado é **`release/Astra Writer Setup 1.0.0.exe`** (~135 MB). Esse é o arquivo que você instala ou distribui.

> A primeira execução baixa as ferramentas do instalador (NSIS) e demora mais. **Feche o app empacotado antes** de gerar de novo
> (se `out/draftweaver-v2-win32-x64/` estiver em uso, o Windows trava a pasta). Para gerar em outra pasta: `FORGE_OUT_DIR=out-release npm run release`.

Só o app sem instalador (para uma olhada rápida): `npm run package` → `out/draftweaver-v2-win32-x64/Astra Writer.exe`.

## 2. O que o instalador faz

- Abre um **assistente** que pergunta **onde instalar** (padrão: `%LOCALAPPDATA%\Programs\Astra Writer`; instala só para o usuário atual, sem pedir administrador).
- Cria o atalho **"Astra Writer" na área de trabalho** e no menu Iniciar. É por ele que você abre o app, como o `npm start` faz em desenvolvimento.
- Cria a pasta **`books/` vazia** dentro da pasta de instalação.
- Cria o desinstalador (Configurações do Windows → Aplicativos).
- **Não precisa instalar mais nada:** o Electron já leva dentro dele o Chromium, o Node e todas as dependências do app (incluindo os dicionários da correção ortográfica).

## 3. Onde ficam os dados

| O quê | Onde (app instalado) | Em desenvolvimento (`npm start`) |
| --- | --- | --- |
| **Livros** | `<pasta de instalação>\books\` | `books/` na raiz do projeto |
| **Modelo de livro** | `<pasta de instalação>\resources\templates\` | `templates/` na raiz do projeto |
| **Chave de IA, dicionário pessoal, log de erros da IA** | `%APPDATA%\draftweaver-v2\` | o mesmo |

- **Desinstalar ou atualizar não apaga os livros:** o desinstalador remove tudo da pasta de instalação **menos** `books/` (se houver livros, a pasta de instalação permanece só com ela).
  Para apagar os livros de vez, exclua essa pasta manualmente.
- **Instale em uma pasta onde você tem permissão de escrita** (o padrão serve). Em `C:\Program Files`, por exemplo, o Windows impede o app de gravar livros.
- Faça **backup** copiando a pasta `books/`.

## 4. Testar na sua máquina

1. Feche o app em desenvolvimento e qualquer cópia de `out/` que esteja aberta.
2. Rode `npm run release`.
3. Execute `release\Astra Writer Setup 1.0.0.exe`, escolha a pasta e conclua.
4. Abra o atalho da área de trabalho: o app inicia com a lista de livros vazia. Crie um livro em **"Criar novo livro"**.

O Windows pode mostrar o aviso do **SmartScreen** ("editor desconhecido") porque o instalador não é assinado digitalmente. Clique em **Mais informações → Executar assim mesmo**.

## 5. Detalhes técnicos

- `forge.config.js`: `executableName` (`Astra Writer.exe`), `icon` (`public/icon`), `extraResource` (`templates` e `public/icon.ico`) e `ignore` (só entram `.vite/`, `node_modules/` e
  `package.json`: o processo principal usa `require` em tempo de execução).
- `electron-builder.yml`: opções do instalador NSIS (assistente, escolha da pasta, atalhos). `build/installer.nsh`: cria `books/` e impede que a desinstalação a apague.
- `src/main/paths.ts`: único lugar que decide as pastas (`books/` ao lado do executável quando instalado, raiz do projeto em desenvolvimento).
- O nome da pasta de dados do usuário (`draftweaver-v2`) vem do `productName` do `package.json`. Não o altere sem migrar esses dados (chave de IA e dicionário pessoal).
