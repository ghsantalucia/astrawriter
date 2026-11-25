# Astra Writer

<p align="left">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js"></a>
  <a href="https://www.electronjs.org"><img src="https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://vitejs.dev"><img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://vitest.dev"><img src="https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest"></a>
  <a href="https://playwright.dev"><img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white" alt="Playwright"></a>
  <a href="https://git-scm.com"><img src="https://img.shields.io/badge/Git-F05032?style=flat-square&logo=git&logoColor=white" alt="Git"></a>
</p>

> Editor de livros desktop assistido por inteligência artificial, estruturado para manter consistência e integridade em universos narrativos complexos.

## Visão Geral

O **Astra Writer** é uma aplicação desktop para Windows, em **português e inglês**, criada para resolver os desafios de organização e continuidade textual em grandes projetos literários. A ferramenta trabalha direto com arquivos no seu computador (_file-driven_), sem banco de dados, e se conecta a provedores de IA com a chave do próprio usuário (_Bring-Your-Key_). As chaves ficam só na máquina de quem usa.

### Modos de Operação

- **Auxílio de Escrita:** redação humana com suporte pontual da IA para revisão de consistência e tom.
- **Criação Guiada:** geração estruturada de capítulos, com validação e controle de prompts pelo usuário.
- **Criação Autônoma:** execução orientada por diretrizes estratégicas e metadados estruturados.

## Baixar e Usar

Para usar o aplicativo sem compilar nada, baixe a versão mais recente em [Releases](https://github.com/ghsantalucia/astrawriter/releases/latest):

- **Instalador** (`AstraWriter-Setup-<versão>.exe`): assistente com escolha da pasta e dos atalhos; o app se atualiza sozinho.
- **Portátil** (`AstraWriter-portable-<versão>-win-x64.zip`): descompacte e execute.

Na primeira abertura o app instala o livro **Manual de Uso**. Para aprender a usar, comece pelo [Guia do Usuário](docs/guia-do-usuario.md).

## Documentação

**Para quem escreve**

- [Guia do Usuário](docs/guia-do-usuario.md) ([English](docs/user-guide.en.md)): como usar o aplicativo, passo a passo (o mesmo conteúdo do livro Manual de Uso).
- [Guia de Instalação e Release](docs/guia-de-instalacao.md): como instalar, onde ficam seus dados e como gerar o instalador (`npm run release`).
- [Funcionalidades](docs/features/index.md) e [Skills](docs/features/skills.md): o que o app oferece e como estendê-lo.

**Inteligência artificial**

- [Tools da IA](docs/ai/ai-tools.md): o que a IA pode fazer e as regras de permissão.
- [Funcionalidades de IA](docs/ai/features-ia.md), [Fluxos](docs/ai/fluxos-da-ia.md), [Modos](docs/ai/modos-da-ia.md) e [Perfis de uso](docs/ai/perfis-de-uso-da-ia.md).

**Para quem desenvolve**

- [Memória de arquitetura](docs/project.md): decisões, padrões e histórico do projeto.
- [Componentes](docs/code/Component.md), [Eventos de UI](docs/code/Event%20UI.md) e [Padrão de Eventos](docs/code/Padr%C3%A3o%20de%20Eventos.md).

## Arquitetura e Decisões de Projeto

- **Separação de Processos (Electron):** isolamento entre o processo principal (_Main_), a ponte segura de comunicação (_Preload_, com _context isolation_) e a camada visual (_Renderer_).
- **TypeScript:** todo o código de `src/` é `.ts` e tipado; `npm run typecheck` roda sem erros.
- **Multi-idioma (i18n):** português e inglês, com o português como chave de tradução (`t("texto")`) e dicionários em `src/shared/i18n/en`. Veja [Tradução (i18n)](docs/i18n-glossario.md).
- **Eventos (Pub-Sub):** biblioteca `Mitt` em dois barramentos independentes: `domainBus` (regras de negócio e sistema de arquivos) e `uiBus` (intenções de interface e animações).
- **Componentes co-locados:** cada componente da interface encapsula sua lógica, template e estilos, e é instanciado de forma central (Inversão de Controle).
- **Monitoramento em tempo real:** `Chokidar` no processo principal observa o sistema de arquivos e propaga as mudanças ao frontend via IPC.
- **Qualidade:** testes unitários e de integração com Vitest, e testes ponta a ponta (E2E) com Playwright.

## Stack Tecnológica

- **Desktop:** Node.js, Electron e Electron Forge (empacotamento), TypeScript e Vite (compilação).
- **Interface:** Handlebars (templates), Toast-UI Editor (editor Markdown), GSAP (animações) e FontAwesome (ícones). O estilo é CSS próprio de cada componente.
- **Utilitários:** Chokidar (observador de arquivos) e Mitt (barramento de eventos).
- **Qualidade:** Vitest, Playwright e Prettier.

## Estrutura do Projeto

```text
.
├── docs/            # Guias do usuário, de instalação, da IA e do código
├── scripts/         # Release, geração do manual e mapas do projeto
├── src/
│   ├── main/        # Processo principal (Electron, Chokidar, IPC)
│   ├── preload/     # Ponte de segurança e isolamento de contexto
│   └── renderer/    # Camada visual (Components, Controllers, Events, Services, AI)
├── templates/       # Modelos de livro, perfis de template e o Manual de Uso
├── tests/           # unit, integration e e2e
└── forge.config.js
```

## Como Executar o Projeto

### Pré-requisitos

**Node.js** (versão 18 ou superior) instalado.

### Instalação e Execução

```bash
git clone https://github.com/ghsantalucia/astrawriter.git
cd astrawriter
npm install
npm start
```

Em desenvolvimento, os dados do app ficam em `%APPDATA%\Astra Writer Dev` e os livros na pasta `books/` do projeto.

### Comandos úteis

| Comando                | O que faz                                          |
| ---------------------- | -------------------------------------------------- |
| `npm start`            | Abre o app em modo de desenvolvimento              |
| `npm run typecheck`    | Verifica os tipos do TypeScript                    |
| `npm test`             | Testes unitários e de integração (Vitest)          |
| `npm run test:e2e`     | Testes de interface (Playwright, abre o app)       |
| `npm run release`      | Gera o instalador e a versão portátil em `release/` |

## Licença

Distribuído sob a licença ISC. Consulte o arquivo [LICENCE](LICENCE) para mais detalhes.
