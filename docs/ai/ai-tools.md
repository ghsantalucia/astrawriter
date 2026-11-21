# Tools da IA — referência e guia de uso

> **Regra do projeto:** sempre que uma tool for criada, alterada ou removida, este arquivo deve ser atualizado no
> mesmo commit. As tools ficam em `src/renderer/ai/tools/` e são registradas em `src/renderer/ai/aiTools.js`.

As tools (_function calling_) são o único meio pelo qual a IA enxerga e altera o livro. Cada uma é definida em JSON
Schema (`{ name, description, parameters, execute }`), independente de provedor: cada provedor (Gemini, Claude, Mock)
apenas traduz essa definição para o seu formato. Erros nunca derrubam a conversa: viram `isError` e a IA reage a eles.

## Visão geral

| Tool | Arquivo | O que faz | Escreve em disco? |
| --- | --- | --- | --- |
| `list_files` | `bookTools.js` | Lista os arquivos `.md` que a IA pode ler | Não |
| `read_file` | `bookTools.js` | Lê o corpo de um arquivo | Não |
| `write_file` | `bookTools.js` | Substitui o corpo de um arquivo | Rascunho `.md.temp` |
| `append_to_file` | `bookTools.js` | Acrescenta texto ao final de um arquivo | Rascunho `.md.temp` |
| `replace_in_file` | `bookTools.js` | Troca um trecho exato por outro | Rascunho `.md.temp` |
| `start_creation` | `creationTools.js` | Descreve os campos para criar capítulo/ficha/anotação no livro aberto (a IA **não** cria livros) | Não |
| `complete_creation` | `creationTools.js` | Cria o item com as respostas do autor | **Sim** (arquivos oficiais) |
| `show_buttons` | `chatTools.js` | Anexa botões clicáveis à resposta no chat | Não |
| `load_skill` | `skillTools.js` | Carrega as instruções de uma skill sob demanda | Não |
| `open_central` | `systemTools.ts` | Abre uma central (Revisões, Livro, IA, Sistema) em uma aba | Não |
| `open_settings` | `systemTools.ts` | Abre a gaveta de configurações | Não |
| `open_file_in_editor` | `systemTools.ts` | Abre um arquivo do livro no editor | Não |
| `open_file_history` | `systemTools.ts` | Abre a janela de histórico do arquivo aberto | Não |
| `request_sync` | `systemTools.ts` | Abre a janela de sincronização para o autor aprovar | Não |
| `list_settings` | `systemTools.ts` | Lista todas as configurações (valor, onde ficam, classe a/b/c) | Não |
| `set_setting` | `systemTools.ts` | Altera uma configuração (a: direto; b: com permissão; c: só orienta) | Configuração do app |
| `guide_user` | `systemTools.ts` | Orienta e abre a tela de ações delicadas (classe c) | Não |
| `get_usage_by_model` | `systemTools.ts` | Uso de tokens por modelo | Não |
| `get_fallback_info` | `systemTools.ts` | Configuração do fallback entre contas | Não |
| `get_productivity` | `systemTools.ts` | Cronômetro de produtividade | Não |
| `search_book` | `systemTools.ts` | Busca texto nos arquivos legíveis do livro | Não |
| `get_app_help` | `systemTools.ts` | Consulta o guia do usuário | Não |
| `auto_link_book` | `systemTools.ts` | Link automático em todos os arquivos (com permissão) | Rascunho |
| `run_analysis` | `systemTools.ts` | Roda a análise do livro (com permissão e estimativa de tokens) | `.system` |
| `set_review_options` | `systemTools.ts` | Liga/desliga revisões e correção ortográfica (com permissão) | Configuração |
| `backup_now` | `systemTools.ts` | Backup dos livros agora (com permissão) | Pasta de backup |
| `propose_skill` | `skillTools.ts` | Prepara uma skill e abre o formulário de criação já preenchido (o autor revisa e cria; a IA nunca cria sozinha) | Não |
| `list_skills` | `systemTools.ts` | Lista a biblioteca de skills | Não |
| `run_skill` | `systemTools.ts` | Pede a execução de uma skill (sempre com autorização do autor) | Conforme a skill |
| `get_tool_specs` | `toolTiers.ts` | Entrega a especificação completa de tools do sumário e as libera (só nos modos Sumário e Mais usadas) | Não |
| `create_folder` | `structureTools.js` | Cria uma pasta em Anotações ou numa categoria do Mundo | **Sim** (pasta + `folder.yml`) |
| `move_file` | `structureTools.js` | Move um arquivo para outra pasta da mesma categoria | **Sim** (arquivo oficial) |
| `move_folder` | `structureTools.js` | Move uma pasta do usuário (com o conteúdo) para outra da mesma categoria | **Sim** |
| `delete_file` | `structureTools.js` | Exclui um arquivo (exige `aiDelete: true`) | **Sim** |
| `delete_folder` | `structureTools.js` | Exclui uma pasta do usuário com o conteúdo (exige `aiDelete: true` no `folder.yml`) | **Sim** |
| `get_file_variables` | `variableTools.js` | Lista as variáveis (dados) de uma ficha | Não |
| `set_file_variables` | `variableTools.js` | Altera as variáveis de uma ficha | Rascunho `.md.temp` |
| `auto_link_file` | `variableTools.js` | Cria os links automáticos (nomes/apelidos das fichas) em um arquivo | Rascunho `.md.temp` |
| `list_file_history` | `historyTools.js` | Lista as versões do histórico de um arquivo | Não |
| `read_file_version` | `historyTools.js` | Lê o conteúdo de uma versão do histórico | Não |
| `restore_file_version` | `historyTools.js` | Restaura uma versão (**o autor confirma** numa janela) | **Sim** (arquivo oficial, após confirmação) |
| `read_changelog` | `historyTools.js` | Consulta o changelog do livro (só metadados) | Não |
| `read_ai_error_log` | `historyTools.js` | Consulta o log de erros da IA (sem chaves de API) | Não |
| `toggle_advanced_files` | `projectTools.js` | Mostra/oculta os arquivos avançados no explorer | `config.json` (preferência de exibição) |
| `get_book_config` | `projectTools.js` | Lê o `config.json` do livro aberto (só ele) | Não |
| `list_ai_models` | `projectTools.js` | Lista as contas de IA do autor (apelido, provedor, modelo, ativa) e o catálogo de modelos (sem chaves) | Não |
| `register_issues` | `issueTools.js` | Registra na Central de Revisões contradições, problemas temporais, gramática e dicas | Não (só `.system/review/`) |
| `list_issues` | `issueTools.js` | Lista as pendências da Central de Revisões (inclui as do sistema) | Não |
| `resolve_issues` | `issueTools.js` | Marca como resolvidas pendências que a IA registrou e corrigiu | Não (só `.system/review/`) |
| `get_timeline_suggestion` | `eventTools.js` | Ordem de eventos calculada pelo sistema (sem IA) e os problemas encontrados | Não |
| `update_timeline` | `eventTools.js` | Escreve a linha do tempo (`assets/events/timeline.md`) na ordem informada | Rascunho `.md.temp` |
| `get_file_digest` | `digestTools.js` | Digest (resumo, fatos, eventos) de um arquivo; muito mais barato que `read_file` | Não |
| `search_facts` | `digestTools.js` | Fatos dos digests por entidade e/ou atributo | Não |

As tools de exclusão (`delete_file`, `delete_folder`) seguem `canDeleteFile(metadata, caminho, "ai")` de
`src/renderer/utils/deletePermission.js` (ver [Permissões](#permissões)). Qualquer tool nova que remova algo deve usar a mesma regra.

## Permissões

> **Herança:** o que o arquivo ou a pasta não define (`aiRead`, `aiWrite`, `humanRead`, `humanWrite`) é herdado da pasta-mãe, depois da avó, até a raiz do livro. Em `notes/`, só o
> `folder.yml` de `notes` define `aiWrite` (botão de cadeado do explorer).

As permissões vivem no **frontmatter de cada arquivo** `.md` (o disco é a fonte da verdade; a árvore é relida a cada
chamada). A flag do próprio arquivo é a que vale; o `folder.yml` descreve a pasta, não restringe os arquivos dela.

| Campo | Significado |
| --- | --- |
| `aiRead` | A IA pode ler o arquivo (`list_files` só mostra arquivos com `aiRead: true`) |
| `aiWrite` | A IA pode alterar o arquivo (via rascunho) |
| `humanRead` / `humanWrite` | Idem, para o usuário |
| `userDelete` | `false` bloqueia a exclusão pelo usuário; `true` libera. Ausente: segue `humanWrite` |
| `aiDelete` | `true` permite a exclusão pela IA. Ausente: a IA **não** exclui |

Regras de exclusão (`utils/deletePermission.js`): arquivos de `content/` nunca são excluídos individualmente (só a
pasta do capítulo inteira, pelo usuário); `index.md` e `template.md` nunca são excluídos; quem não pode editar um
arquivo também não pode excluí-lo.

### Permissões de pasta (`folder.yml`)

As tools de estrutura conferem também o `folder.yml` da pasta envolvida (`aiWrite` / `aiDelete`; `userDelete` e `userRename`
identificam pastas criadas pelo usuário, as únicas que podem ser movidas ou excluídas):

| Ação | O que é exigido |
| --- | --- |
| `create_folder` | `aiWrite: true` na pasta pai (que precisa ser `notes`, uma categoria do Mundo ou uma pasta do usuário dentro delas) |
| `move_file` | `aiWrite: true` no arquivo e na pasta de destino; mesma categoria |
| `move_folder` | `aiWrite: true` na pasta, em todos os arquivos dentro dela e na pasta de destino; `userRename: true`; mesma categoria |
| `delete_file` | `aiWrite: true` e `aiDelete: true` no arquivo; nunca `content/`, `index.md` ou `template.md` |
| `delete_folder` | `userDelete: true`, `aiWrite: true` e `aiDelete: true` no `folder.yml`; todos os arquivos dentro com `aiWrite: true` e sem `aiDelete: false` |

Por padrão (`aiDelete` ausente) a IA **não** exclui nada: o autor precisa liberar com `aiDelete: true`.

Se a tool negar acesso, a IA deve respeitar a decisão e explicar ao autor o que não foi possível fazer.

## Fluxo de edição (tools que escrevem em arquivos)

1. Na primeira tool de escrita da resposta, o app exige que **todos os rascunhos pendentes estejam sincronizados**
   (abre o modal de sincronização). Se o autor recusar, a tool retorna erro e nada é alterado.
2. O projeto é **travado** (`ai_lock` no `config.json` do livro) enquanto a IA edita.
3. Cada escrita vai para o rascunho (`arquivo.md.temp`), preservando o frontmatter. O oficial nunca é sobrescrito.
4. Ao final da resposta, o projeto é liberado e o app abre a **comparação lado a lado** dos arquivos alterados: o autor
   mantém a versão nova (podendo editá-la) ou descarta.
5. Cada edição entra no changelog do livro; ao ser aprovada, a alteração é atribuída ao autor **IA** (provedor + modelo).
6. Um aviso "system" aparece no chat: `"Título" - Alterado pela IA (aguardando revisão)` (uma vez por arquivo por resposta).

Todas as leituras (`read_file`, `list_files`) também são registradas no changelog (autor IA).

As tools de estrutura e `restore_file_version` também chamam `beginEdit` (exigem tudo sincronizado e travam o projeto), são
registradas no changelog com o autor **IA**, mostram um aviso "system" no chat e avisam a interface pelo evento
`book:structure-changed` (explorer e editor se atualizam). Alterar **só os dados** (variáveis) de uma ficha também vai para
a revisão: a tela mostra a lista das variáveis alteradas (`Idade: 31 → 33`).

## Índices (`index.md`)

Os índices são mantidos automaticamente, tanto para o usuário quanto para a IA (`services/indexService.js`):

- criar um personagem, local ou conceito/sistema acrescenta `- [Título](assets/<categoria>/arquivo.md)` ao `index.md` da
  categoria (os capítulos já entravam em `content/index.md`);
- excluir um arquivo, uma pasta ou um capítulo remove as linhas correspondentes do índice;
- as alterações entram no changelog (criação: autor de quem criou; remoção: "Sistema").

A IA **não** deve editar índices à mão.

---

## Tools de arquivos do livro (`bookTools.js`)

Todos os caminhos são **relativos à raiz do livro** (ex.: `content/chapter_001/2_draft.md`). Só arquivos `.md`; caminhos
com `..` ou pastas ocultas são recusados. A IA nunca deve mostrar caminhos ao autor: ao conversar, usa o **título**.

### `list_files`

Lista os arquivos `.md` do livro atual com `aiRead: true` (os modelos `template.md` ficam de fora).

- **Parâmetros:** nenhum.
- **Retorno:** lista de `{ title, path, canWrite, hasPendingDraft }`.
- **Erros:** nenhum livro selecionado; falha ao ler a estrutura.
- **Changelog:** leitura da IA sobre o livro inteiro (`(livro inteiro)`).

### `read_file`

Lê o corpo Markdown (sem frontmatter) de um arquivo. Se houver rascunho (`.temp`), lê o rascunho.

- **Parâmetros:** `path` (string, obrigatório).
- **Retorno:** o corpo; arquivos com mais de 60.000 caracteres são truncados (com aviso no final).
- **Requer:** `aiRead`.
- **Changelog:** leitura do arquivo pela IA.

### `write_file`

Substitui **todo** o corpo de um arquivo existente, mantendo o frontmatter. Salva como rascunho.

- **Parâmetros:** `path` (obrigatório), `content` (string, obrigatório — corpo completo em Markdown).
- **Requer:** `aiWrite`. Segue o [fluxo de edição](#fluxo-de-edição-tools-que-escrevem-em-arquivos).
- **Prefira** `replace_in_file` ou `append_to_file` para edições pontuais.

### `append_to_file`

Acrescenta texto ao final de um arquivo existente. Salva como rascunho.

- **Parâmetros:** `path` (obrigatório), `text` (string, obrigatório).
- **Requer:** `aiWrite`.

### `replace_in_file`

Troca um trecho exato do corpo por outro.

- **Parâmetros:** `path` (obrigatório), `old_text` (obrigatório, não vazio), `new_text` (obrigatório),
  `replace_all` (boolean, padrão `false`).
- **Erros:** trecho não encontrado; trecho repetido sem `replace_all` (a IA deve dar mais contexto).
- **Requer:** `aiWrite`.

---

## Tools de criação guiada (`creationTools.js`)

Usam o mesmo `CreationService` do assistente (wizard) da interface, então o resultado é idêntico ao de criar pela tela.
Tipos (`kind`): `chapter` (capítulo), `entity` (ficha de personagem/ambiente/sistema — exige `folder`) e
`note` (anotação). **A IA nunca cria livros** (nem abre o assistente de novo livro): ela trabalha só dentro do livro aberto, e `kind: book` é recusado. Criar livros é só do autor, pela interface.

### `start_creation`

Descreve os campos a preencher. **Não cria nada.**

- **Parâmetros:** `kind` (obrigatório); `folder` (só para `entity`, ex.: `assets/characters`; se omitido, o erro lista as
  pastas disponíveis).
- **Retorno:** `{ kind, folder, title, alreadyStarted, instructions, steps[{ step, title, description, fields[{ id, label, required, type, placeholder, default }] }] }`.
- **Requer:** `aiWrite` na pasta de destino (`content`, `notes` ou a pasta da ficha).

### `complete_creation`

Cria o item (arquivos oficiais, com o autor **IA** no changelog) e avisa o autor.

- **Parâmetros:** `kind` (obrigatório), `folder` (só `entity`), `answers` (obrigatório): lista de
  `{ field, value }` com os ids retornados por `start_creation`. Campos não informados usam o valor padrão.
- **Validação anti-invenção:** cada campo **obrigatório** preenchido precisa ser o valor padrão **ou aparecer nas
  mensagens recentes da conversa** (ignorando maiúsculas/acentos). Se a IA inventar um título que o autor nunca
  escreveu, a tool devolve erro mandando perguntar ao autor.
- **Sem confirmação redundante:** se o autor já informou os dados (ex.: "crie um capítulo chamado X"), a IA chama
  `start_creation` e `complete_creation` **na mesma resposta**. Só pergunta o que faltar, uma única vez.
- **Efeitos:** capítulo cria `content/chapter_NNN/` (copiando o modelo) e atualiza `content/index.md`; ficha cria
  `<pasta>/<prefixo>_NNN.md` com `# Nome` no corpo; anotação cria `notes/note_NNN.md` (fichas: `character_`, `place_` e `element_` + número); livro clona o template.
- **Aviso no chat:** `Capítulo "X" - Criado` (mensagem "system").

---

## Tool de botões (`chatTools.js`)

### `show_buttons`

Anexa botões clicáveis (grade de 2 por linha, **máximo 8**) abaixo da resposta. Depois de chamá-la, a IA escreve a
resposta normalmente.

- **Parâmetros:** `buttons` — lista de objetos:
  - `label` (obrigatório): texto curto do botão.
  - **Resposta pronta:** `reply` (opcional; padrão = `label`) — enviado como se o autor o tivesse digitado.
  - **Ação do app:** `action` (uma das abaixo) + parâmetros próprios.
- **Ações** (lista de permissão em `utils/chatActions.js`; a IA nunca dispara eventos fora dela):

| `action` | Efeito | Parâmetro |
| --- | --- | --- |
| `open-file` | Abre um arquivo do livro no editor | `path` |
| `open-sync` | Abre a sincronização de rascunhos | — |
| `open-settings` | Abre as configurações | — |
| `edit-variables` | Abre as variáveis do arquivo aberto | — |
| `new-chapter` | Abre o assistente de capítulo | — |
| `new-note` | Abre a criação de anotação | — |
| `new-entity` | Abre o assistente de ficha | `folder` |

## Quantas tools vão à IA (perfil de uso, `toolTiers.ts`)

As definições das tools pesam em todo pedido (e no limite de tokens por minuto dos provedores), então o perfil de uso (Central de IA → Perfil e análises) define `toolsMode`:

| Modo | Perfil | O que vai ao modelo |
| --- | --- | --- |
| `minimal` | Mínimo | **Só leitura:** `show_buttons` e `read_file` (respeita a permissão de leitura de cada arquivo). Sem `get_tool_specs` e sem edição; o prompt avisa a IA disso e manda oferecer um botão para trocar o perfil |
| `summary` | Econômico | `show_buttons`, `get_tool_specs`, e `replace_in_file` e `append_to_file` completas (edição pontual); o prompt traz 1 linha por tool para as demais |
| `popular` | Equilibrado | As tools mais usadas completas, mais o sumário das outras |
| `all` | Completo e Ultra | Todas as tools |

O modo "Apenas conversa" envia só `show_buttons`. Uma tool fora do que foi oferecido é recusada na execução.

### `get_tool_specs`

Devolve a descrição e os parâmetros completos de tools do sumário e **as libera**: elas passam a ser declaradas nos pedidos seguintes até o livro aberto mudar.

- **Parâmetros:** `names` (array de strings, obrigatório).
- **Retorno:** `{ liberadas: [...definições], desconhecidas: [...nomes] }`.
- Como as APIs não guardam estado entre pedidos, o sumário e as tools liberadas vão em **todo** pedido (não só no primeiro da sessão).

---

## Tool de skills (`skillTools.js`)

### `load_skill`

Carrega, sob demanda, as instruções completas de uma skill (`src/renderer/ai/skills/*.md`, listadas no contexto).

- **Parâmetros:** `name` (string, obrigatório).
- **Erros:** skill inexistente (a mensagem lista as disponíveis).
- **Skills:** a Loja traz `reduzir-trechos-prolixos`, `avaliar-ritmo-da-historia`, `sugerir-fichas-ausentes` e `revisar-e-padronizar-escrita`; o app não instala skills por padrão.

---

## Tools de estrutura (`structureTools.js`)

Fazem o que o usuário faz no explorer, com os mesmos serviços (`FolderService`, `DeletionService`) e as permissões da seção
[Permissões de pasta](#permissões-de-pasta-folderyml). Caminhos relativos ao livro (ex.: `notes/ideias`).

### `create_folder`

- **Parâmetros:** `parent` (pasta pai), `name` (nome exibido).
- Só em `notes` e nas categorias do Mundo (`assets/characters`, `assets/places`, `assets/elements`), inclusive dentro de pastas do usuário.
- Retorno: caminho da pasta criada (o nome vira um "slug").

### `move_file`

- **Parâmetros:** `path` (arquivo), `destination` (pasta).
- Só dentro da **mesma categoria**. Os links internos que apontavam para o arquivo são corrigidos no livro todo (autor "Sistema").

### `move_folder`

- **Parâmetros:** `path` (pasta do usuário), `destination` (pasta). Mesma categoria; nunca para dentro dela mesma.

### `delete_file`

- **Parâmetros:** `path`. Exclui o arquivo e o rascunho; remove o link do índice; registra o conteúdo no changelog.

### `delete_folder`

- **Parâmetros:** `path`. Exclui a pasta do usuário com tudo; remove dos índices os links dos arquivos.
- Não exclui pastas das categorias nem estruturais.

## Tools de dados e links (`variableTools.js`)

### `get_file_variables`

- **Parâmetros:** `path`. **Retorno:** `{ title, canWrite, tags[], variables[{ id, label, required, value }] }`. Requer `aiRead`.

### `set_file_variables`

- **Parâmetros:** `path`, `values` (lista de `{ id, value }`) e/ou `tags` (lista COMPLETA de tags do arquivo; `[]` remove todas; normalizadas como no editor). Ids desconhecidos geram erro.
- Alterar o nome (`title`) atualiza também o título do arquivo e o H1 do corpo. Salva como rascunho (revisão do autor). Requer `aiWrite`.

### `auto_link_file`

- **Parâmetros:** `path`. Faz o mesmo que o botão "Auto-link": links `[termo](/assets/...md#auto)` para nome e apelidos das fichas.
- A IA só linka fichas que ela mesma pode ler (`aiRead`). Não mexe em títulos, blocos de código, código inline, imagens nem textos já linkados. Requer `aiWrite` no arquivo.

## Tools de histórico e logs (`historyTools.js`)

### `list_file_history` / `read_file_version`

- `list_file_history(path)`: `{ title, versions[{ id, time, action, author, summary, isCurrent, canRestore }] }`.
- `read_file_version(path, entry_id)`: corpo Markdown da versão (truncado em 60.000 caracteres). Ambas exigem `aiRead`.

### `restore_file_version`

- **Parâmetros:** `path`, `entry_id`. Requer `aiWrite`.
- Abre uma janela com a **comparação lado a lado** e só restaura se o autor clicar em "Restaurar esta versão"; se ele recusar
  (ou fechar a janela) a tool retorna que nada foi alterado. Restaurar apaga o conteúdo das versões posteriores (como na interface).

### `read_changelog`

- **Parâmetros (todos opcionais):** `file` (valor `older` da chamada anterior), `path` (filtro), `limit` (padrão 30, máximo 100).
- Só metadados dos registros (sem conteúdo dos arquivos); registros de arquivos sem `aiRead` são omitidos.

### `read_ai_error_log`

- **Parâmetros:** `limit` (opcional). Erros recentes (provedor, modelo, status, mensagem). Chaves de API são ocultadas da mensagem.

## Tools de projeto (`projectTools.js`)

### `toggle_advanced_files`

- **Parâmetros:** `enabled` (boolean, opcional; sem ele alterna). É só a preferência de exibição do autor (`explorer_state.advanced_mode` no `config.json`).

### `get_book_config`

- **Parâmetros:** nenhum. Lê só o livro aberto: a IA não tem acesso a outros livros. Somente leitura.

### `list_ai_models`

- Sem parâmetros. Para cada provedor: `configured` (tem chave ou não precisa), `active`, `selectedModel` e `models`. **A chave de API nunca é retornada.**

---

## Tools da Central de Revisões (`issueTools.js`)

A Central de Revisões guarda tudo dentro do livro, em `.system/review/` (`state.json` cache da varredura, `registered.json` issues da IA, `dismissed.json` dispensados e `dictionary.json`). Um **issue** tem categoria (`links`, `spelling`, `timeline`, `contradictions`, `tips`), **tipo** (a tag: `grammar`, `synonym`, `timeline-conflict`, `fact-conflict`, `possible-conflict`, `style-tip`, `clarity-tip`, `verbose-tip` (trecho prolixo), `pacing-tip` (ritmo), `missing-entity-tip` (ficha ausente) e `grounding-tip` (época/mundo real) podem ser registrados pela IA), severidade (`error` vermelho confirmado; `warning` amarelo possível/sugestão; dicas são sempre amarelas), arquivo, trecho exato, mensagem e, se houver, `replacement` (habilita "Corrigir").

### `register_issues`

- **Parâmetros:** `issues` (até 30), cada um com `type`, `file`, `message` e opcionalmente `excerpt` (trecho EXATO do arquivo), `occurrence`, `severity`, `replacement` (`""` remove o trecho) e `related` (outros arquivos/trechos, ex.: o outro lado de uma contradição).
- Exige `aiRead` nos arquivos citados; não altera o livro. Tipos que o autor **dispensou** são recusados (a resposta diz quais). Issues já registrados ou dispensados são ignorados. Entra um registro `review` (agrupado) no changelog com o autor IA.

### `list_issues`

- **Parâmetros (todos opcionais):** `category`, `type`, `file`, `severity`, `limit` (padrão 40, máx. 100).
- Devolve totais, os tipos dispensados e itens compactos (`id`, tipo, arquivo, linha, trecho, mensagem, `fix`).

### `resolve_issues`

- **Parâmetros:** `ids` (de `list_issues`). Remove da central os issues **registrados pela IA**; os do sistema somem sozinhos quando o texto é corrigido e sincronizado.

## Tools de eventos e linha do tempo (`eventTools.js`)

Eventos são fichas em `assets/events/` (criadas pelas tools de criação com `folder: "assets/events"`) com as variáveis `when` (momento, texto livre), `after` e `before` (nomes de outros eventos) e `aliases`. O sistema ordena (topológico, desempate por ano) e detecta ordem circular, momento contraditório, referência inexistente e evento sem posição.

### `get_timeline_suggestion`

Devolve a ordem sugerida (`path`, `title`, `when`) e os problemas. Use antes de montar a linha do tempo.

### `update_timeline`

- **Parâmetros:** `order` (caminhos das fichas de eventos, do mais antigo ao mais recente).
- Requer `aiWrite` em `assets/events/timeline.md` (somente leitura para o autor) e segue o fluxo de edição (tudo sincronizado antes, rascunho, revisão).

## Tools de digests (`digestTools.js`)

Cada arquivo analisado tem um **digest** (arquivo-sombra) em `.system/digests/<caminho>.json`: resumo, entidades, fatos (`entity`, `attribute`, `value`, `quote`) e eventos. É criado pela análise da IA depois de sincronizar (com estimativa de tokens) e só é refeito se o arquivo mudar.

### `get_file_digest`

- **Parâmetros:** `path`. Exige `aiRead`. Se não houver digest, diz que não foi analisado.

### `search_facts`

- **Parâmetros:** `entity` e/ou `attribute` (trechos). Devolve até 60 fatos com arquivo e citação.

## Tools do app, centrais e configurações (`systemTools.ts`)

Cada ação tem uma **classe de risco**, que decide o que a IA pode fazer sozinha:

| Classe | Significado | Exemplos |
| --- | --- | --- |
| **a** | Sem risco ou com revisão posterior: a IA faz | abrir telas e arquivos, tema claro/escuro, tamanho da fonte, fontes do editor, modo noturno, narrador, buscar, consultar uso e cronômetro |
| **b** | Pode atrapalhar: **pede permissão** numa janela (Permitir/Negar) | atualização automática, backup, revisões e ortografia, análise (com estimativa de tokens), link automático em todo o livro, intervalo e cópias do backup |
| **c** | Delicado: a IA **não faz**, orienta e abre a tela | modo da IA do livro, permissões de arquivos, contas e chaves de API, excluir livro, desinstalar, pasta de backup |

As configurações vêm do **registro único** (`src/renderer/utils/appSettings.ts`, `SETTING_DEFS`), o mesmo que a Central do Sistema usa:
cada uma tem id, nome, ajuda, onde fica, tipo, limites e classe. Para uma configuração nova ficar visível à IA, basta
declará-la ali com a classe de risco.

### `open_central` / `open_settings`

- **`open_central`:** `central` (`issues`, `book`, `ai`, `system`) e `tab` opcional. Abas: issues (overview, links, spelling, timeline,
  contradictions, tips); book (data, overview, export, changelog, danger); ai (model, fallback, usage, analysis, debug,
  errors, skills); system (general, update, appearance, accessibility, editor, productivity, shortcuts, templates, backup).
- **`open_settings`:** abre a gaveta de configurações.

### `open_file_in_editor` / `open_file_history` / `request_sync`

- **`open_file_in_editor`:** `path` relativo ao livro. Combine com `open_file_history` (abre o histórico do arquivo aberto)
  para ver o histórico de um arquivo específico.
- **`request_sync`:** abre a janela de sincronização **se houver rascunhos pendentes**; sem rascunhos, devolve que não há nada a sincronizar (e a janela não abre), e uma segunda chamada na mesma resposta é recusada. A IA nunca sincroniza sozinha, e a sincronização não é pré-requisito para editar.

### `list_settings` / `set_setting` / `guide_user`

- **`list_settings`:** todas as configurações, com valor atual, onde ficam e a classe; inclui as que a IA não altera, para orientar.
- **`set_setting`:** `id` e `value`. Classe a: aplica; b: abre a janela de permissão; c: não altera e abre a tela.
- **`guide_user`:** `action` (`change-ai-mode`, `change-file-permissions`, `manage-api-keys`, `delete-book`, `uninstall`,
  `backup-folder`, `change-usage-profile`): abre a tela e devolve o passo a passo.

### Consultas e ações com permissão

- **`get_usage_by_model`** (`days`), **`get_fallback_info`**, **`get_productivity`**, **`search_book`** (`query`; só arquivos com `aiRead`) e
  **`get_app_help`** (`topic`; lê o guia do usuário sob demanda, sem pesar o prompt).
- **`auto_link_book`**, **`run_analysis`**, **`set_review_options`** (`reviews`, `spelling`) e **`backup_now`**: abrem uma janela de
  permissão; se o autor negar, nada é feito.

### Skills: `list_skills` / `run_skill`

- **`propose_skill`:** `title`, `name`, `description`, `instructions` (obrigatórios) e `details`, `kind`, `triggers`, `tools`, `tags`, `inputs` (perguntas ao autor antes de executar) e `optimize` (false para skills com amostras de escrita) e `web` (true para a skill poder pesquisar na internet). A descrição manda a IA **entrevistar** o autor e pedir exemplos antes de chamar. Abre o formulário em Central de IA → Skills; tools e gatilhos inexistentes são descartados.
- **`list_skills`:** biblioteca do autor, com **descrição** de cada skill (quando usar), identificador, tipo, gatilhos, modos, se é nativa, se está ativa, se **pede informações ao autor** (`asksAuthorForInfo`), se roda sozinha e quantas execuções. Entra entre as tools "mais usadas" (perfis Equilibrado+).
- **`run_skill`:** `name` (veja `list_skills`). Entra entre as tools "mais usadas". Se a skill pede informações, uma janela com os campos aparece para o autor (a IA não pergunta). A execução começa quando a IA termina a resposta e **depende da autorização do autor** (janela com
  as tools que a skill usa e a estimativa de tokens), exceto skills recorrentes que ele configurou para rodar sozinhas.
  Durante a execução a IA só tem as tools que a skill declara.

## Como criar uma nova tool

1. Crie (ou edite) um módulo em `src/renderer/ai/tools/` com `registerXTools(registry)` e registre a tool com
   `registry.register({ name, description, parameters, execute })`. Documente com JSDoc.
2. Chame `registerXTools` em `src/renderer/ai/aiTools.js`.
3. Valide permissões com `assertPermission` (`permissions.js`) e, para escrita, use `beginEdit` + `saveDraft` (rascunho).
4. Registre leituras/alterações no changelog (`ctx.changelog`) e use `ctx.notice(...)` para avisos "system" no chat.
5. **Atualize este arquivo** (tabela de visão geral e a seção da tool) e, se necessário, o prompt em
   `src/renderer/ai/prompts/systemPrompt.md`.
6. Teste com o provedor **Mock** (`/ajuda` lista os comandos de teste) antes de usar um modelo real.
   O Mock tem o comando genérico `/tool <nome> | <json>` que executa **qualquer** tool com argumentos reais, por exemplo
   `/tool move_file | {"path":"notes/note_001.md","destination":"notes/ideias"}`.

## Contexto enviado a cada conversa

Além do prompt de sistema, o contexto traz o **Mapa do livro**: caminho e título dos arquivos que a IA pode ler (`aiRead`), sem índices e modelos, até 80 arquivos (o resto vai por `list_files`), com `[só leitura]` nos que ela não pode alterar. O mapa é lido na hora de cada mensagem e só inclui o livro aberto. O prompt diz que a leitura dos arquivos do livro já está autorizada (dentro das permissões) e que a IA deve explorar antes de perguntar.

## Mapa de arquivos nas execuções de skill

Em execuções de skill, `list_files` devolve `status: "inalterado desde a última execução"` nos arquivos cujo hash (SHA-1) é o mesmo da última
execução bem-sucedida da skill, e o **Mapa do livro** do prompt traz o mesmo aviso. O pedido da skill inclui a instrução fixa de **não reler nem
reanalisar** arquivos inalterados, exceto se as instruções da skill disserem o contrário ou se for indispensável para atualizar outro arquivo.
Os hashes ficam em `.system/skills-state.json` do livro (por skill); mudar o texto/versão da skill ou a Sinopse invalida tudo.
