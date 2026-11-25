# Astra Writer: Memória de Arquitetura e Padrões de Projeto

Esta documentação serve como o nosso "manual de sobrevivência" e fonte única de verdade para o projeto. Escrevi este registro para consolidar o conhecimento técnico, as escolhas arquiteturais e os padrões que estamos adotando, garantindo que o contexto e a consistência do projeto se mantenham intactos independentemente dos limites de memória dos logs.

---

## 1. O Que é o Astra Writer?

O **Astra Writer** é um editor de livros assistido por IA, desenvolvido para manter a rigidez e a consistência em universos narrativos complexos. O aplicativo possui três modos de operação:

- **Auxílio de Escrita:** O usuário comanda a IA, que redige trechos sujeitos a revisão humana direta.
- **Criação Guiada:** A IA gera capítulo a capítulo com revisão e prompts do usuário.
- **Criação Autônoma:** A IA opera de forma autônoma do início ao fim a partir de um _prompt_ estruturado inicial.

- **Modelo "Bring-Your-Key":** A inteligência artificial não vem embutida; o usuário conecta suas próprias chaves de API. Inicialmente, focamos no **Gemini** (aproveitando seu suporte a cacheamento de contexto e _function calling_, além de tokens gratuitos de teste), mas preparamos a arquitetura para múltiplos _providers_, incluindo alternativas focadas em texto livre, como a _Puter_.
- O projeto também prioriza a eficiência de tokens e arquitetura **RAG (Retrieval-Augmented Generation)** para alimentar a IA apenas com o contexto estritamente necessário do livro.

---

## 2. Tecnologias e Ferramentas (Stack Tecnológica)

Para manter o projeto moderno e altamente profissional — visando inclusive o meu portfólio para o mercado de desenvolvimento —, adotamos a seguinte stack:

- **Node.js:** Ambiente de execução base para o ecossistema e manipulação do sistema de arquivos no processo principal.
- **Electron Forge & Electron (v44.2.0):** Framework para criar o aplicativo desktop nativo.
- **Vite:** _Bundler_ de altíssima performance usado para compilar tanto o processo principal quanto a interface (renderer).
- **Handlebars:** Motor de templates (template engine) utilizado para renderização dinâmica e modular das estruturas HTML dos componentes visuais.
- **Toast-UI Editor (v3.2.2):** O núcleo visual do editor Markdown integrado na interface.
- **Chokidar (v5.0.0):** Nosso observador (_file watcher_) de alta performance para monitorar alterações na pasta `/books` em tempo real.
- **Mitt (v3.0.1):** Biblioteca leve de _Pub-Sub_ utilizada para implementar nossos barramentos de eventos (`uiBus` e `domainBus`).
- **GSAP (v3.15.0):** Motor de animações profissional para transições fluidas e efeitos visuais na interface.
- **FontAwesome:** Biblioteca de ícones vetoriais.
- **Prettier:** Para garantir consistência visual e eliminar qualquer atrito de estilo entre os arquivos do projeto, adotamos o Prettier como formatador automático de código.

---

## 3. Arquitetura e Organização do Sistema

### Separação de Processos (Main, Preload, Renderer)

Diferente do modelo tradicional MVC monolítico, nossa aplicação opera sob o modelo de segurança e arquitetura do Electron:

- **Processo Main:** Controla o ciclo de vida da janela do app e integra o acesso direto ao sistema operacional e de arquivos (onde residem o Chokidar e os handlers IPC).
- **Processo Preload:** Atua como uma ponte segura e isolada (_context isolation_), expondo APIs estritas via IPC para o frontend sem expor o Node.js globalmente.
- **Processo Renderer:** A camada visual (frontend) onde rodam os componentes da interface.

### Arquitetura Orientada a Eventos (Pub-Sub)

Abandonamos chamadas diretas e acopladas entre funções. A comunicação do sistema flui por eventos desacoplados divididos em dois barramentos principais:

- **`domainBus`:** Gerencia fatos do sistema, dados e regras de negócio puras (ex: alterações de arquivos no disco via Chokidar).
- **`uiBus`:** Gerencia intenções do usuário, comandos visuais, animações e estados de componentes de tela.
- **Controllers e Handlers:** Atuam como intermediários inteligentes que escutam os barramentos, processam dados e despacham as ações correspondentes.

### Estrutura de Pastas baseada em Componentes e Modularidade JS

- Adotamos **ES6 Modules** nativos (`export async function ...`).
- A interface é construída seguindo o princípio de **co-locação**: cada elemento visual possui sua própria pasta isolada contendo sua classe em JS, arquivos de template HTML compilados via Handlebars, estilo em CSS isolado e estrutura própria, garantindo alta independência.
- Aplicamos o padrão de **Inversão de Controle (IoC)** que gerencia a criação de componentes em um único local em `appContainer.js`.
- O ecossistema utiliza importações diretas de CSS por componente. O CSS geral utiliza o padrão moderno com variáveis root globais (`variables.css`, `reset.css`, `global.css`).

### Persistência de Dados

- **Ausência de Banco de Dados (File-Driven):** O projeto não utiliza nenhum tipo de banco de dados tradicional. Toda a persistência de dados, estados e conteúdos é feita diretamente no sistema de arquivos local, utilizando arquivos estruturados em formato **JSON** (para configurações, metadados e árvore) e **Markdown (.md)** (para os capítulos e anotações literárias).
- **Comunicação IPC Segura:** Vale ressaltar que os eventos do Chokidar no Main chegam ao Renderer através do padrão `webContents.send` ➔ `preload.js` ➔ `ipcRenderer.on` ➔ `domainBus.emit()`, mantendo o isolamento de contexto exigido pelo Electron.

### Documentação e Padrões de Código (JSDoc)

- O projeto adota o padrão JSDoc para a documentação inline de funções, parâmetros e comportamentos em todo o código-fonte localizado na pasta /src. Essa padronização permite tanto a extração automatizada de metadados arquiteturais quanto a geração de portais web estáticos de referência de API, garantindo alta clareza na manutenção e legibilidade técnica.

---

## 4. Princípios de Engenharia Aplicados

- **Única Fonte da Verdade (Single Source of Truth):** O disco rígido (arquivos `.md` e `config.json` dentro da pasta `/books`) é a verdade absoluta do sistema. A interface apenas reflete o que o disco dita.
- **DRY (Don't Repeat Yourself):** Evitamos duplicação de código utilizando serviços utilitários reutilizáveis (como leituras padronizadas de arquivos JSON).

---

### Changelog e Rollback (`<livro>/.system/changelog`)

Tudo o que é criado, alterado, excluído, movido, restaurado, salvo automaticamente (e lido pela IA) é registrado por `ChangelogService` (renderer) e gravado por `src/main/changelog.js` (main), com o autor e a data/hora exatas. Há **três autores**: **Usuário**, **IA** (provedor + modelo) e **Sistema** (ajustes colaterais feitos pelo próprio app, como renumerar capítulos ou, no futuro, o fallback automático de modelo de IA).

- `logs/log_NNNN.jsonl`: informações (uma linha por registro). Rotaciona a cada 500 registros ou 256 KB.
- `contents/content_NNNN.jsonl`: conteúdo para rollback (diferenças por linha de uma edição, ou o texto integral de um arquivo excluído). Rotaciona a cada 200 conteúdos ou 1 MB.
- O registro aponta para o conteúdo como uma "chave estrangeira": `content: { file, index }`. Criações e leituras não têm conteúdo (`content: null`).
- Ações registradas: `create`, `update`, `delete`, `move` (renomear/renumerar), `restore`, `read` (IA), `autosave` e `setting` (ex.: troca de provedor/modelo de IA; nunca a chave de API).
- **Autosave:** há **um único registro por sessão de edição** de um arquivo (a sessão vai da abertura até trocar de arquivo, sincronizar, restaurar ou fechar o app). Cada novo salvamento do rascunho atualiza o mesmo registro (data/hora, diferenças e contagem de salvamentos).
- Hashes SHA-1 do antes/depois garantem que a restauração nunca seja aplicada sobre um arquivo diferente do esperado (edições feitas fora do app cancelam a restauração).
- **Restaurar nunca apaga registros.** Os registros posteriores à versão restaurada continuam no log, marcados com `purged: true`; apenas o **conteúdo** guardado deles é apagado (eles deixam de permitir rollback e o visualizador anota "conteúdo apagado · sem rollback"). A restauração gera um registro `restore`.
- **Histórico de um arquivo** (botão "Histórico"): lista só as versões com conteúdo. Logo após restaurar uma versão, ela passa a ser a versão atual e some da lista (assim como o registro `restore`), restando as anteriores. Antes de restaurar, uma tela compara lado a lado a versão atual e a escolhida (Markdown interpretado; trechos removidos em vermelho e incluídos em verde, sutis) com o aviso do que será perdido; "Cancelar" volta à lista.
- Arquivos que já existiam antes do changelog ganham a versão "original" (estado anterior ao primeiro registro).
- Renomear/mover arquivos (`move`) preserva o histórico: a consulta segue os movimentos para trás.
- O log de erros da IA fica fora do livro, em `<dados do usuário>/ai/errors.log` (limitado a ~256 KB: os registros mais antigos são descartados).

### Estrutura dos livros e exclusões

- Capítulos ficam em `content/chapter_NNN/` (antes `cap_NNN`). Livros antigos são migrados automaticamente ao listar os livros (`src/main/book-migrations.ts`): pastas renomeadas, referências em `content/index.md`, `config.json` e no changelog atualizadas. A migração 7 (`ensureChapterLayout`) deixa cada capítulo com só três arquivos — `1_outline.md` (Esboço, antigo `1_script.md`), `2_draft.md` e `3_analysis.md` (Análise, que absorve a pasta `backlog`: arquivos do modelo são descartados, os editados viram seções; `3_metadata.md` é removido; tudo registrado no changelog para rollback). No explorer o capítulo é um item único (`chapterNode.hbs`) e a toolbar mostra as guias Manuscrito/Esboço/Análise (`#chapter-tabs`).
- **Exclusão** (botão de lixeira ao passar o mouse no explorer): anotações e fichas do mundo, com modal de confirmação. Capítulos são excluídos pela **pasta inteira** (arquivos e subpastas) e os seguintes são **renumerados** sem deixar buracos; os ajustes colaterais (mover pastas, atualizar o índice e títulos padrão) entram no changelog com o autor **Sistema**.
- **Permissão de exclusão** no frontmatter: `userDelete` e `aiDelete` (ver `docs/ai/ai-tools.md` e `src/renderer/utils/deletePermission.js`). Arquivos da escrita (`content/`), índices (`index.md`) e modelos (`template.md`) nunca são excluídos individualmente; quem não pode editar um arquivo também não pode excluí-lo.
- Variáveis de apelido (`aliases`) em personagens, ambientes e sistemas alimentam o botão "Linkar termos" do editor.

### Editor (links, busca e rodapé)

- Links internos usam o caminho do arquivo a partir da raiz do livro, sempre com barra inicial (`/assets/places/reino.md`). Aparecem como "tag" com contorno; **rosa** quando criados por "Linkar termos" (marcados com `#auto` até a sincronização, quando passam a azul); **cinza** quando o arquivo foi excluído. Botão direito em um link interno oferece "Remover link". Links da web abrem no navegador padrão.
- Botões da toolbar do editor: link (arquivo do livro ou externo), procurar/substituir (`Ctrl+F`) e alternância entre texto formatado e Markdown.
- Rodapé: palavras, tempo de leitura, conexões wiki e o status do salvamento automático.

### Documentação das tools da IA

A lista de tools da IA e o guia de uso ficam em `docs/ai/ai-tools.md`. **Sempre que criar, alterar ou remover uma tool, atualize esse arquivo.**

---

## 5. Planejamento Futuro (Roadmap Técnico)

- **TypeScript:** o código de `src/` está em `.ts` e tipado (`npm run typecheck` sem erros, sem `@ts-nocheck`; ver "Migração para TypeScript" abaixo). Falta apertar os tipos `any` que restaram.
- **Testes Automatizados (prontos):** _Vitest_ (unitários e de integração, em `tests/unit` e `tests/integration`) e _Playwright_ (E2E de interface, em `tests/e2e`).

---

---

## 6. Design, tema e telas

- **Tokens de design** em `src/renderer/assets/css/base/variables.css`: raios (`--radius-sm/md/lg`, meio-termo entre arredondado e pontudo), fundos (`--bg-*`), superfícies (`--surface*`), texto (`--text*`), linhas (`--line*`), acento (`--accent*`) e cores semânticas (`--danger`, `--warning`, `--success`). O tema claro é o `:root` (acento roxo, combina com a nebulosa) e o escuro é `body.dark-theme` (acento azul). Componentes devem usar os tokens, nunca cores fixas.
- **Chat:** estrelas em viagem no tema escuro; no claro, a nebulosa animada (`components/Chat/nebula.js`, WebGL otimizado: resolução interna reduzida, 30 fps e pausa quando a gaveta está recolhida, fora da tela ou com a aba oculta).
- **Abertura** (`core/splash.js`): sequência em estágios (ver "Tools de estrutura/histórico, índices, explorer e abertura"); a barra de título permanece visível.
- **Editor:** toda instância nasce pelo `EditorKit` (barra personalizada, link, busca, bloqueio de edição). A caixa "Dados do arquivo" fica entre a barra e o texto; a guia do arquivo (toolbar) tem a caneta que a abre. Autosave é gravado ao trocar de arquivo/limpar o editor/fechar o app (`flushAutoSave`).
- **Pastas do usuário** (`FolderService`): criar/renomear/excluir só em Anotações e dentro das categorias do Mundo (`userDelete`/`userRename` no `folder.yml`; pastas estruturais têm `false`). Arquivos podem ser arrastados entre pastas da mesma categoria; os links internos para eles são corrigidos (autor Sistema).
- **Ortografia:** o sublinhado e o menu de sugestões (botão direito) vêm do corretor do Electron/Chromium; o contador do rodapé usa Hunspell próprio (ver "Ajustes seguintes"). Idioma e liga/desliga (`app_spell_language`, `app_spellcheck_enabled`) ficam nas configurações. A "gramática" é só a regra de palavras repetidas; não há correção gramatical offline completa.

### 6.x Correções de interface (rodada de ajustes)

- **Toolbar do editor:** os botões próprios (`dw-tb-btn`) zeram a margem padrão do Toast UI (`margin: 0 !important`), que os deixava 7px mais baixos. Os botões da direita ficam centralizados na faixa; só a guia do arquivo encosta na borda inferior.
- **Guia do arquivo:** o corpo trapezoidal usa `isolation: isolate` (o `z-index: -1` do pseudo-elemento o jogava atrás do fundo da toolbar). A caneta só aparece se o arquivo tem algo editável (`humanWrite` e `editableFields`), com opacidade reduzida até o hover.
- **Somente leitura:** `editor:unlock` (fim do bloqueio da IA) não libera mais arquivos somente leitura nem o estado "sem arquivo".
- **Rodapé:** os avisos de links inválidos e problemas ortográficos só aparecem quando > 0; o clique no aviso percorre os itens (seleciona, rola e foca o editor): links inválidos (`EditorKit.getBrokenLinks/selectRange`) e problemas de escrita (`EditorKit.getWritingProblems`, `components/Editor/writingProblems.js`: palavras desconhecidas e repetidas em sequência, em ordem de texto). O contador de ortografia usa Hunspell próprio (ver "Ajustes seguintes").
- **Chat no tema claro:** deixou de usar a paleta escura. Gaveta lilás, corpo rosa claro, nebulosa (canvas a 80%, fundo transparente, estrelas violeta, semente aleatória a cada montagem), balões e avisos opacos. No tema escuro as estrelas viajam na diagonal (canto inferior direito → superior esquerdo), com velocidade por profundidade; o paralaxe do mouse foi removido.
- **Explorer:** ações da pasta (novo item, nova pasta, renomear, excluir) agrupadas à direita (`.folder-actions`), visíveis no hover. Seleção de itens somente leitura mantém a cor dos demais. Novo token `--line-strong`.
- **Nebulosa (tema claro):** shader opaco e detalhado (como o original), canvas a 55% de opacidade sobre o rosa claro da div. A semente é sorteada em [1, 61) a cada montagem: sementes grandes (centenas) quebram a precisão do shader e geram tela preta.
- **Estrelas (tema escuro):** deslocamento lento da direita para a esquerda, levemente para cima (`TRAVEL_SPEED`, `TRAVEL_RISE` em `Chat/animations.js`); estrelas cadentes caem para baixo, para a esquerda.
- **Abertura:** o reset global fixa `font-family` em `*`, por isso cada linha do título sobrescreve a fonte também nos filhos (`.splash-per *`, `.splash-astra *`).
- **Pastas:** pastas do usuário também podem ser arrastadas para dentro de outras (`FolderService.moveFolder`, mesma regra de categoria; cada arquivo vira um "move" no changelog e os links são corrigidos).
- **Barra de título:** acompanha o tema. `--bg-header` é `#ece9f6` no claro e `#0e0f17` no escuro, e o `themeManager` chama `setNativeTheme` para o main recolorir os botões nativos (`update-titlebar-theme` em `ipc-handlers.js`: fundo e símbolos por tema). A tela de abertura é sempre `#0e0f17` (escuro) ou branca (claro).
- **Layout:** sidebar com 481px e `border-right`; botão Sincronizar com 120px.


## Tools de estrutura/histórico, índices, explorer e abertura (rodada atual)

- **Novas tools da IA** (`structureTools`, `variableTools`, `historyTools`, `projectTools`): ver `docs/ai/ai-tools.md`. Os serviços
  `FolderService`/`DeletionService`/`ChangelogService.restore` aceitam o autor (`actor`) para registrar a IA no changelog; a
  interface se atualiza pelo evento `book:structure-changed` (`deleteHandler.onStructureChanged`) e `explorer:advanced-changed`.
- **Revisão da IA:** alterações só nos dados (frontmatter) deixaram de ser descartadas como "sem alteração"; a tela lista as variáveis alteradas.
- **Índices:** `services/indexService.js` + `utils/bookIndex.js` — fichas criadas entram no `index.md` da categoria; arquivos/pastas/capítulos excluídos saem dos índices.
- **Explorer:** `#sidebar-container > .sidebar` e `#explorer-container` agora são colunas flex limitadas à altura visível; só a árvore rola e ela termina acima do botão do assistente.
- **Abertura:** a tela fica vazia até o app estar pronto (versão do app no rodapé); depois toca "Per Aspera Ad" → "Astra" + estrela cadente → pausa de 0,7 s → fade
  (`core/splash.js`, classes `.stage-per`/`.stage-astra`/`.leaving`; tempos em constantes no topo do arquivo). Tema claro: fundo `#ece9f6` (igual ao header) e letras chumbo `#23232b`; entrada simples (fade de cima para baixo). "Astra" usa a fonte Foglihten No07 (`assets/fonts/`, licença OFL junto) e "Per Aspera Ad" a fonte do sistema; ambas nas variáveis `--splash-font-per` e `--splash-font-astra` (`splash.css`).


## Busca tolerante, tags e correção ortográfica (rodada atual)

- **Busca:** `shared/looseText.js` (usada em `main/book-search.js` e no destaque do explorer) ignora maiúsculas, acentos, pontuação e
  artigos/conjunções/preposições: "vira lata" acha "vira-lata"; "grimório eldoria" acha "Grimório de Eldoria". Quando não há resultado,
  a mensagem aparece logo abaixo da barra (antes ficava no rodapé do explorer).
- **Tags:** variável especial `tags: [..]` no frontmatter (`shared/tags.js`: normalização `a-z`, acentos, `- _ / . 0-9`, hash FNV-1a → 40 cores
  em `assets/css/components/tags.css`, versões clara/escura). Editadas na caixa "Dados do arquivo" (`components/Editor/tagInput.js`: vírgula/Enter
  viram tag, sugestões das tags do livro com setas+Enter) e exibidas no cabeçalho da caixa. Na pesquisa, `#tag` (várias, todas precisam existir) lista
  os arquivos com a tag, mostrando-a no lugar do trecho. Salvar passa por `variablesHandler.onVariablesSave` (campo `__tags`); a IA usa `tags` em
  `get_file_variables`/`set_file_variables`.
- **Correção:** switch "Correção ortográfica e gramatical" nas Configurações (liga/desliga o corretor do Chromium e o contador do rodapé, que
  também conta palavras repetidas em sequência).

### Ajustes seguintes (tags, ortografia, intro)

- **Contador ortográfico:** o `webFrame.isWordMisspelled` não funciona com o corretor nativo do Windows, então o contador usa Hunspell em
  WebAssembly (`hunspell-asm`) no processo principal (`main/spellchecker.js`, IPC `spell-check`/`spell-suggest`/`spell-add-word`) com os dicionários `dictionary-pt` (pt-BR),
  `-en`, `-es`, `-fr`. (`nspell` foi descartado: expandir os afixos do dicionário português trava.) O sublinhado continua sendo do Chromium.
  Palavras adicionadas pelo menu de contexto não contam como erro.
- **Versão do app:** `app.getVersion()` (IPC `get-app-version`) = `version` do `package.json`; o Vite não tem versão própria do projeto.
  É exibida no rodapé da tela de intro.
- **Explorer/guia:** alterar nome/tags pelas variáveis atualiza o mapa do livro e redesenha o explorer (`file:variables-changed` →
  `tree:updated`); a guia do arquivo mostra o asterisco quando há rascunho (`ToolbarComponent.refreshTabDirty`).
- **Problemas de escrita (rodapé):** o IPC `spell-check` devolve a lista de palavras desconhecidas; o editor localiza cada ocorrência no documento
  (`findWritingProblemRanges`), junto das palavras repetidas, e o clique no aviso percorre todas em ordem. Uma palavra errada e repetida conta uma vez.
- **Guia do arquivo (toolbar):** a dica ao passar o mouse mostra o caminho relativo do arquivo real no disco (`file:opened.relativePath`).
- **CSS do botão "Salvar dados":** o Toast UI define `.toastui-editor-defaultUI button { color }` com especificidade maior que uma classe simples, por
  isso a regra usa `.file-data-box .file-data-save` (claro: letra `#f6f3ff`) e `body.dark-theme .file-data-box .file-data-save` (escuro: `#11111b`).
- **Dependências novas:** `hunspell-asm`, `dictionary-pt`/`-en`/`-es`/`-fr`, `@fontsource/cinzel-decorative` (hoje sem uso na abertura).

---

## Documentação para o usuário

O guia didático de uso do aplicativo fica em [`guia-do-usuario.md`](guia-do-usuario.md). **Ao criar ou mudar uma funcionalidade visível ao
autor, atualize também o guia.**

### Correção ortográfica própria, tooltips, fundos do chat e criação em pastas

- **Sublinhado próprio (o corretor do Chromium fica sempre desligado):** `session.setSpellCheckerEnabled(false)` em `main.js`; o Windows e o plugin
  davam resultados diferentes. O sublinhado é decoração do ProseMirror (`.writing-spell`/`.writing-repeated`) calculada por
  `findWritingProblemRanges` a partir das palavras que o Hunspell não reconhece. Botão direito num problema abre o menu próprio
  (`Editor/WritingMenu.js`): sugestões (`spell-suggest`), **Ignorar** (até fechar o app), **Adicionar ao dicionário** (`spell-add-word`, grava
  `spell-dictionary.json` na pasta de dados do usuário e vale para todos os livros) e, para repetições, remover/ignorar.
- **Dicionário do projeto:** títulos, nomes e apelidos (`data.aliases`) de **todas** as fichas do livro atual contam como palavras corretas
  (`EditorComponent.getProjectWords`); textos linkados, código, links e HTML nunca são conferidos (`writingProblems.blockText`).
- **Tooltips (`core/tooltip.js` + `assets/css/components/tooltip.css`):** qualquer `title`/`data-tooltip` vira uma dica estilizada com atraso de 140 ms;
  o `title` é trocado por `data-tooltip` no primeiro mouseover. Os botões do Toast UI usam o mesmo visual.
- **Criar dentro de pastas do usuário:** pastas do usuário em `assets/<categoria>/` ganham o "+" (ficha com o template da categoria; `loadEntityTemplate`
  sobe até a pasta-mãe que tem `template.md`) e as de `notes/` ganham "Nova anotação em..." (`getNoteSpec(folder)`, `createNote(values, source, folder)`).
- **Livro novo:** `createBook` grava `explorer_state.open_file = <livro>/content/plot.md`, então a Sinopse abre ao selecionar o livro.
- **Plano de fundo do chat:** preferência por tema (`utils/chatBackground.js`, `localStorage`: `chat_bg_<tema>`, `chat_bg_color_<tema>_<tipo>`) com 4 tipos:
  estrelas (padrão do escuro), nebulosa (padrão do claro), órbitas (`Chat/orbits.js`, SVG animado; presets em `ORBIT_PRESETS`) e cor sólida.
  A cor é escolhível em "estrelas" (sem escolha vale o degradê padrão do tema), "órbitas" (fundo) e "sólida". `ChatComponent.applyChatBackground` monta e desmonta o fundo (`chat-bg:apply`).

### Navegação por teclado no explorer e ajustes visuais

- **Teclado no explorer (`Explorer/keyboardNav.js`):** depois de um clique no explorer, ↑ ↓ percorrem as linhas visíveis da aba com o destaque do hover
  (classe `kb-focus`, sem selecionar nem abrir), ← → percorrem as opções do item (`kb-btn-focus`; arquivos: `.item-edit-btn`/`.item-delete-btn` do `<li>`;
  pastas: `.folder-act-btn`), Enter alterna a pasta, abre o arquivo ou aciona a opção escolhida, e ↓ no último item destaca a gaveta do chat (Enter
  dispara o mesmo clique do cabeçalho, que foca o campo de texto). O ponto de partida é o arquivo `.active` da aba (ou o primeiro item). As teclas só valem
  com o foco no corpo da página ou no explorer, sem modal aberto; clicar fora ou trocar de aba reinicia.
- **Sublinhado de problemas de escrita:** pontilhado de 1px com 70% de opacidade (`.writing-spell`, `.writing-repeated`), para não atrapalhar a leitura.
- **Gaveta do chat fechada (tema escuro):** o cabeçalho "acende" em azul (gradiente que avança da esquerda, `background-size`) no hover e no `kb-focus`.
- **Scroll das configurações:** barra fina de 8px com os tokens `--scrollbar-thumb(-hover)`.
- **Órbitas (claro):** preset `#c0c8e6` (fundo), `#e1e1e1` (órbitas), `#ededed` (planetas), `#ffffff` (luas e estrelas), `#d1d1d1` (asteroides).

### Exportar arquivo (Markdown, Word, PDF)

- Botão **Exportar** na toolbar (`Toolbar`, menu `#export-menu`; só ativo com um arquivo aberto). O renderer (`handlers/exportHandler.js`) pega o texto do editor
  (inclui o que ainda é rascunho), gera o HTML com `marked` + `DOMPurify` (links internos do livro viram texto simples) e chama o IPC `export-file`.
- `main/export.js` pergunta onde salvar (`dialog.showSaveDialog`) e grava: **.md** (texto do editor), **.docx** (`html-to-docx`, dependência nova) e **.pdf**
  (impressão `printToPDF` do Chromium numa janela invisível sem JavaScript, A4, fonte serifada). O nome sugerido é o título do arquivo.

### Pesquisa com vários termos e tags clicáveis

- **Vários termos:** a pesquisa aceita termos separados por vírgula e devolve os arquivos que casam com **qualquer** um (`parseQuery` em `main/book-search.js`).
  Cada termo é tolerante (acentos, pontuação, artigos). Termos com `#` pesquisam tags (várias tags no mesmo termo, separadas por espaço, exigem todas).
  Cada resultado guarda `matched` (índices dos termos que casaram). **Ordem** (`compareResults`): 1) mais termos encontrados; 2) empate: a ordem dos termos digitados; 3) empate: alfabética
  (vale também para um termo só: o título não tem mais prioridade sobre o texto). O tipo exibido segue título → trecho do texto → tags. O explorer mostra os arquivos de cada pasta nessa ordem
  (`data-rank`) e ordena as pastas pelo melhor resultado que contêm. O destaque (`highlightMatch`) marca todos os termos de texto.
- **Tags do cabeçalho da caixa de dados:** clicar numa tag não abre/fecha a caixa; ela coloca `#tag` no campo de pesquisa do explorer e dispara a busca
  (`EditorComponent.searchByTag`). Clicar fora das tags continua alternando a caixa.

- **Abrir/fechar todas as pastas:** botão na mini toolbar do explorer (`ExplorerComponent.toggleAllFolders`): abre todas as pastas da aba ou, se todas já estão abertas, fecha todas; cada pasta é alternada pelo próprio clique, então o estado vai para o `config.json`.

- **Nomes em disco em inglês e numerados:** pastas do usuário viram `folder_001`, `folder_002`... (o nome digitado fica só no `title` do `folder.yml`; o número é por pasta-mãe),
  anotações `note_001.md` e fichas `character_001.md`, `place_001.md`, `element_001.md` (`CreationService`, `FolderService.createFolder`). Itens antigos mantêm o nome que já tinham.

- **Overlays abaixo da barra de título:** `#modal-container` e `#settings-container` começam em `top: 30px` (altura de `#window-header`) e têm `height: calc(100vh - 30px)`, então o escurecimento/blur nunca cobre a barra de título (os botões nativos da janela ficam coerentes com o resto dela). Novos overlays de tela cheia devem seguir a mesma regra.


## Migração para TypeScript

- **Estado atual:** todo o código de `src/` (main, preload e renderer) foi renomeado de `.js` para `.ts` e continua funcionando igual. Onde os textos desta documentação citam um arquivo
  `.js` de `src/`, leia `.ts`. Ficaram em JavaScript apenas as ferramentas de projeto: `forge.config.js`, `vite.*.config.mjs` e `scripts/*.js`.
- **Tipado:** nenhum arquivo usa `// @ts-nocheck` e o `npm run typecheck` passa com 0 erros. O `tsconfig` não é estrito, e ainda há tipos `any` a apertar. As propriedades das classes são declaradas com `declare` (não emitem código), para não reiniciar valores definidos na classe base.
- **Configuração:** `tsconfig.json` (`strict: false`, `noEmit`, `verbatimModuleSyntax` para o esbuild nunca descartar imports), `src/types/global.d.ts` (módulos `?raw`, globais do Forge e `Window`).
  O Vite (esbuild) só remove os tipos, não os verifica; a verificação é o `npm run typecheck`.
- **Imports:** continuam escritos com `.js` (`./app.js`): o Vite os resolve para o `.ts` correspondente. A exceção são os imports dinâmicos por padrão de pasta (`aiGateway.ts` e
  `aiService.ts`), que usam `index.ts` porque o Vite procura os arquivos reais no disco.
- **Documentação gerada:** os mapas (`file-map`, `code-map`, `event-map`) leem `.ts`. O JSDoc (`docs:web`) só funciona enquanto os arquivos não tiverem sintaxe de tipos; ao tipar, trocar por TypeDoc.
- **Novos arquivos:** crie sempre `.ts` (o `scripts/create-component.js` já gera `.ts`).

## Empacotamento e instalador

Ver `docs/guia-de-instalacao.md`. Resumo: `npm run release` (`scripts/release.js`) empacota com o Forge e gera o instalador NSIS com o electron-builder (`electron-builder.yml`, `build/installer.nsh`) em `release/`.
No app instalado, `books/` fica ao lado do executável e `templates/` e o ícone em `resources/` (`src/main/paths.ts`); o desinstalador preserva `books/`. O pacote só leva `.vite/`, `node_modules/` e `package.json`.

## Herança de permissões, bloqueio da IA em Anotações e ajustes de interface

- **Herança de permissões (`humanRead`, `humanWrite`, `aiRead`, `aiWrite`):** o `get-tree` (`main/ipc-handlers.ts`, `withInherited`) preenche o que o arquivo/pasta não define com o valor da pasta-mãe,
  depois da avó e assim até a raiz do livro; o valor efetivo vai em `metadata` da árvore (usado pelo explorer e pelas tools da IA). `aiDelete`/`userDelete`/`userRename` **não** são herdados
  (valem só para o próprio item). Os metadados do `gray-matter` são cacheados por conteúdo, por isso o main trabalha em uma cópia (`{ ...data }`).
  O editor aplica o valor herdado ao arquivo aberto como propriedade **não enumerável** (`EditorComponent.applyInheritedPermissions`): vale para a interface, mas nunca é gravado no frontmatter.
- **Anotações:** só `notes/folder.yml` define `aiWrite`; arquivos e subpastas não o gravam (migração 5 em `book-migrations.ts`, `createNote` e `createFolder` já criam sem ele).
  O botão de cadeado na mini toolbar de Anotações (`#btn-notes-ai-lock`, `FolderService.setFlag`, `folderHandler.onToggleNotesAiWrite`) alterna o `aiWrite` desse `folder.yml`.
- **Gaveta de configurações:** é o único overlay que cobre a barra de título (altura total da janela, 481px de largura como a sidebar, fundo `--bg-header`); o cabeçalho "Configurações ✕" é `position: sticky`.
  Modais continuam abaixo da barra de título.
- **Botões nos dois temas:** o texto dos botões coloridos usa os tokens `--text-on-accent` e `--text-on-danger` (claro: branco; escuro: `#11111b`). Não escreva cores de texto fixas em botões com fundo colorido.
  Todo Toast UI Editor nasce já no tema atual (`toastui-editor-dark`), inclusive o da tela de revisão da IA.
- **Caneta da guia:** abrir a caixa de dados põe o foco (e seleciona) no campo do nome (`focusNameField`).
- **Esc no chat:** fecha a gaveta e devolve a navegação por setas ao explorer (`explorer:keyboard-restore` → `ExplorerKeyboard.restore`).
- **Auto-link:** passa a linkar também em títulos (só blocos de código e texto já linkado ficam de fora).
- **Intro:** primeira execução sem tema salvo usa o tema claro (igual ao themeManager); a estrela cadente cruza a tela na diagonal (de ~36% da largura, no alto, até embaixo à direita).
- **Nome do produto:** "Astra Writer" (um "t"). Em desenvolvimento os dados ficam em `%APPDATA%\Astra Writer Dev`; o app instalado usa `%APPDATA%\Astra Writer`.

## Centrais, Central de Revisões, eventos, digests e contas de IA

- **Centrais** (`components/Central/`): janela grande com abas laterais quadradas, cabeçalho com X e overlay que bloqueia o app (`#central-container`, z-index 150, abaixo dos modais). O `CentralComponent` é só o casco; as páginas (`panels/issuesPanel`, `bookPanel`, `aiPanel`) cumprem o contrato `title`, `getTabs()`, `getHeader(tab)`, `render(tab, el)`, `dispose?()`. Abre-se por `central:open` (`{ central: "issues"|"book"|"ai", tab? }`): botão do rodapé do editor, botões da gaveta de Configurações ou eventos. O contexto (`context.services`) dá acesso aos serviços.
- **Central de Revisões:** botão no rodapé do editor (verde "Tudo certo", amarelo ou vermelho + contagem). Resumo (números, mais graves, análise da IA, correção pela IA com aviso, tipos dispensados, dicionário), uma aba por categoria (cards com tag do tipo, arquivo/linha, trecho, solução, *ir para o trecho*, *corrigir*, *dispensar*, *adicionar ao dicionário*, *dispensar todos desse tipo*) e as opções de correção ortográfica (as mesmas das Configurações, sincronizadas por `spellcheck:changed`). Os ícones de pendências aparecem nos arquivos do explorer ao passar o mouse.
- **IssueService** (`services/issueService.ts`): varredura **incremental** (`main/book-scan.ts`, hash por arquivo; só o que mudou é relido) com os verificadores determinísticos de `review/issueCheckers.ts` (links quebrados, palavra repetida, erro de digitação com Hunspell, ignorando frontmatter, código e links). Cache e dados em `<livro>/.system/review/`. Atualiza por eventos (`temp-file:saved`, `file:created`, `book:structure-changed`...) com debounce e emite `issues:changed`. Corrigir grava no `.temp` com o autor Sistema; mudanças viram um registro `review` **agrupado** no changelog (um por arquivo/lote). Dispensar guarda o id (estável: arquivo + tipo + trecho + ocorrência).
- **Eventos e linha do tempo:** categoria `assets/events/` (fichas com `when`, `after`, `before`); `assets/timeline.md` foi movido para `assets/events/timeline.md` (migração 6, somente leitura para o autor). `review/timeline.ts` calcula a ordem sugerida e os issues da categoria "linha do tempo". O autor aprova a sugestão na central; a IA usa `update_timeline`.
- **Arquivos novos são rascunho:** fichas, anotações, eventos e capítulos criados nascem como `.md.temp` (`CreationService.writeNewFile` / `convertTreeToDrafts`) e só viram oficiais ao sincronizar (que registra a criação no changelog). Descartar um arquivo novo apaga tudo e tira o link do índice. A IA só analisa arquivos oficiais.
- **Digests e análise** (`services/analysisService.ts`, `review/digest.ts`): depois de sincronizar o app oferece (ou roda, se configurado) a análise: a IA lê cada arquivo **uma vez** e grava um digest em `.system/digests/`; candidatos a contradição são achados **sem IA** (mesmo atributo, valores diferentes) e só eles vão para a verificação da IA, que registra issues. Orçamento de tokens por análise, estimativa antes de gastar e verificações guardadas em `_state.json`. O `3_metadata.md` dos capítulos deixou de existir no modelo (o digest o substitui).
- **Central do Livro:** nome, modo da IA (`ai_mode` no `config.json`: assistente, co-autor, autônomo; entra no prompt), visão geral, changelog e exclusão (com confirmação digitando o nome da pasta).
- **Central de IA:** contas de IA (várias por provedor, com apelido e chave; `AiService.accounts()`), fallback de contas, uso por modelo (histórico de 30 dias), análise do livro, depuração (`ai/debugLog.ts`), log de erros e skills do livro (`.system/skills/`). A conta ativa é refletida em `state.aiProvider` e `state.aiSettings.providers[provedor]` (`materialize`), então o resto do app não muda. As Configurações mantêm só o seletor de conta/modelo (sincronizado pelo evento `ai-accounts:changed`).
- **Fallback e depuração** (`ai/aiGateway.ts`): se a conta ativa falha por limite de uso ou instabilidade (429/5xx) e nenhuma tool alterou arquivos naquela resposta, tenta a próxima conta da lista; a troca vai para o changelog (autor Sistema). `askModel` faz chamadas únicas (sem tools) para as análises.

## Internacionalização (i18n)

- **Idiomas:** português (Brasil, o padrão) e inglês. O idioma é escolhido em Central do Sistema → Geral e fica gravado em `language.json` na pasta de dados do app; na primeira abertura vale o idioma do sistema (`pt*` → português, o resto → inglês). Variável `ASTRA_LANG` força um idioma (os testes E2E usam). Trocar o idioma recarrega a janela.
- **Modelo:** o **português é a chave**. `t("Salvar")` (em `src/shared/i18n.ts`) devolve o texto em português ou, em inglês, a entrada do dicionário `src/shared/i18n/en/*.json` (um arquivo por área; formato `{ "texto em português": "text in English" }`). Sem entrada, aparece o português. Parâmetros: `t("Excluir {name}?", { name })`. Nos templates Handlebars: `{{t "Texto"}}` e `{{{t "Texto com <b>HTML</b>"}}}` (o helper é registrado em `core/i18nInit.ts`, o primeiro import do `app.ts`).
- **Processo principal:** `src/main/language.ts` decide o idioma, entrega ao preload (`electronAPI.language`, leitura síncrona) e recarrega a janela ao trocar (`electronAPI.setLanguage`). O `t()` funciona também no main.
- **Conteúdo por idioma:** modelos de livro e perfis de template em `templates/en/` (espelho de `templates/`); `templatesDir()` escolhe pelo idioma e os perfis e o Manual de Uso ficam ao lado. O Manual é gerado por `scripts/build-manual.js` (os dois idiomas) a partir de `docs/guia-do-usuario.md` e `docs/user-guide.en.md`. Prompts do sistema (`ai/prompts/*.en.md`) e skills (`ai/skills/en`, `ai/skills/market/en`) têm versão inglesa, escolhida por `getLanguage()`.
- **Texto gravado nos livros** (título de capítulo, índices, motivos do changelog) segue o idioma no momento da criação. O app reconhece o título padrão nos dois idiomas ao renumerar capítulos; o importador reconhece "Capítulo N" e "Chapter N".
- **Números, datas e ordenação** usam `intlLocale()`. O corretor ortográfico começa no idioma do app (o usuário pode trocá-lo).
- **Regras:** não traduzir comentários, `console.*`, ids, nomes de eventos/canais, nomes de arquivo e valores gravados em frontmatter/config. Texto que o código compara com um literal fica no valor original. O teste `tests/unit/shared/i18n-coverage.test.js` falha se algum `t("...")` ficar sem tradução em inglês. Glossário e regras: `docs/i18n-glossario.md`.
