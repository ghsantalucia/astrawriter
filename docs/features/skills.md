# Skills

> **Status:** implementada (base) · **Desde:** 1.0.0 · **Doc do usuário:** seção "Skills" do `guia-do-usuario.md`
> **Pendências aprovadas/propostas:** campo de entrada, skills nativas, criação por IA, loja online (ver `index.md`, seção 7).

## O que faz (alto nível)

Uma **skill** é um pacote de instruções (texto + metadados) que a IA executa usando as tools do app. Vive numa **biblioteca do usuário
compartilhada entre todos os livros**. Pode ser de **uso único** (roda quando o autor manda) ou **recorrente** (roda sozinha em
**gatilhos**). A **Loja** é o catálogo de skills que vem com o app (offline por enquanto); o produto não traz skills "de exemplo" na
biblioteca.

## Como o usuário usa

Central de IA → **Skills**: *Minhas skills* e *Loja*, busca, cartão (cor, ativa/inativa), página da skill (descrição, texto completo,
gatilhos, tools permitidas, estimativa de tokens, execuções), **Executar agora**, **Editar**, **Criar skill**. Opções por skill:
pedir permissão antes de ativar, ativa/inativa (recorrentes), cor, **otimizar instruções** e gatilhos/tools ajustáveis.

## Como foi implementada

- **Formato:** arquivo `.md` com frontmatter (`name`, `title`, `description`, `details`, `author`, `version`, `kind`, `triggers`, `tools`,
  `tags`, `compact`, `tokens`) e o corpo = instruções. Parser em `ai/skills/index.ts` (`parseSkill`).
- **Fontes:** `ai/skills/*.md` (instaladas com o app; hoje **nenhuma**), `ai/skills/market/*.md` (a Loja) e a pasta do usuário
  (`<dados do app>/skills/`, gravada por `main/skills-store.ts`). Editar uma skill do app/loja cria uma **cópia "editada"** com outro id;
  "restaurar" volta ao original.
- **Preferências do usuário** (`skills.prefs` no `appSettings`): gatilhos, tools, `askBefore`, `enabled`, `color`, `compact`.
- **Execução:** `services/skillRunnerService.ts` (fila, permissão, estimativa de tokens, chamada `aiService.sendMessage` com
  `allowedTools`). **Gatilhos:** `TRIGGER_GROUPS` em `services/skillService.ts`; ligação com os eventos do app em `SkillRunnerService.init()`.
- **Controle de alterações (hash):** para gatilhos com arquivo, o runner guarda em `.system/skills-state.json` (por livro) o SHA-1 do
  arquivo processado por cada skill e o hash das **diretrizes** (versão + texto da skill + Sinopse). Só roda de novo se o arquivo mudou
  ou as diretrizes mudaram. Execução manual ignora o hash.
- **Otimizar:** `ai/compact.ts` (`compactInstructions`) é aplicado ao texto da skill nos perfis Mínimo/Econômico, **exceto** se a skill tiver
  `compact: false` (use quando há amostras de escrita ou exemplos de estilo: otimizar poderia alterar o estilo).
- **IA e skills:** tools `list_skills` e `run_skill` (`ai/tools/skillTools.ts`); a skill só roda com a autorização do autor.

## Gatilhos disponíveis

App/livro: abrir o app, abrir um livro. Escrita: sincronizar, **sincronizar o manuscrito de um capítulo (`chapter-sync`)**, abrir arquivo,
salvar arquivo, exportar, depois da análise. Por tipo de ficha (capítulo, personagem, ambiente, conceito, evento, anotação, qualquer
arquivo): criado, atualizado (sincronizado), excluído.

## Arquivos fundamentais

| Arquivo | Papel |
| --- | --- |
| `src/renderer/ai/skills/index.ts` | parser, skills do app e da Loja, cor automática |
| `src/renderer/services/skillService.ts` | biblioteca, gatilhos, preferências, estatísticas, estimativa |
| `src/renderer/services/skillRunnerService.ts` | execução, fila, permissão, hash por arquivo |
| `src/renderer/components/Central/panels/system/skillsTab.ts` | telas (biblioteca, Loja, página, formulário) |
| `src/main/skills-store.ts` | leitura/gravação dos arquivos do usuário |
| `src/renderer/ai/tools/skillTools.ts` | tools da IA |

## Loja atual (4 skills)

| Skill | O que faz | Resultado |
| --- | --- | --- |
| Encontrar trechos prolixos | aponta trechos enrolados do manuscrito | dicas `verbose-tip` |
| Avaliar o ritmo da história | avalia lentidão/pressa/descrição em excesso | dicas `pacing-tip` |
| Sugerir fichas que faltam | nomes citados fora do manuscrito sem ficha | dicas `missing-entity-tip` |
| Revisar e padronizar a escrita | reescreve conforme tom e amostras da Sinopse | alterações em rascunho (`compact: false`) |

## Limitações e pendências

Sem campo de entrada na execução, sem skills nativas, sem criação por IA, loja só offline. Detalhes em `index.md`, seção 7.
