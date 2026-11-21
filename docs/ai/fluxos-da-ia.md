# Fluxos da IA: gatilho → perfil → modo → cadeia de ações

> Mapa de **quando a IA (ou uma rotina com IA) é acionada**. Cada linha: o que dispara, o que o **perfil de uso** muda, o que o **modo do
> livro** muda e a cadeia de ações. Perfis em `perfis-de-uso-da-ia.md`; modos em `modos-da-ia.md`.
> Legenda de perfil: **M**ínimo, **E**conômico, **Eq**uilibrado, **C**ompleto, **U**ltra. Modo: **As**sistente, **Co**-autor, **Au**tônomo.

## 1. Conversa no chat

| Gatilho | Se perfil… | Se modo… | Cadeia de ações |
| --- | --- | --- | --- |
| O autor envia uma mensagem | histórico enviado: M 6 · E 12 · Eq 30 · C 40 · U 50. "Apenas conversa" liga: sem tools | frase do modo entra no prompt | 1. grava a mensagem no log → 2. carrega o histórico → 3. `aiService.sendMessage` → 4. `processPrompt`: resolve perfil, monta o prompt (normal ou enxuto) + **contexto** (livro, arquivo aberto, modo, **mapa do livro**, skills, perfil) + sumário de tools → 5. tenta o provedor ativo; em erro de limite/instabilidade e **sem tools já executadas**, tenta o próximo do **fallback** → 6. laço de tools (máx. **10 rodadas**) → 7. grava a resposta |
| Provedor é o **Assistente Astra** (embutido) | irrelevante (não usa tools reais além dos comandos) | irrelevante | 1ª mensagem do dia: citação + apresentação + botões (conectar IA / ver o que sabe); depois, só comandos (`/ajuda`, `/listar`…) |
| O autor clica em **Parar** | — | — | `AbortController` cancela a chamada em curso; aviso discreto no chat; sem erro no log |
| A IA pede uma tool | M: só `read_file`, `show_buttons`. E: + `get_tool_specs`, `replace_in_file`, `append_to_file`. Eq: 13 completas + sumário. C/U: todas | — | `ToolView.execute` → tool **não liberada** devolve erro orientando a chamar `get_tool_specs` → senão `toolRegistry.execute` (confere **permissões** `aiRead`/`aiWrite`/`aiDelete`) |
| A IA tenta **editar** um arquivo | — | — | `beginEdit`: exige **sincronizar todos os rascunhos pendentes** (modal); trava `ai_lock`; grava como **rascunho** `.md.temp`; `recordEdit` guarda o arquivo; changelog atribui à IA |
| A IA pede algo que o perfil não permite | todos | todos | o prompt traz o **perfil atual**; a IA deve explicar, dizer onde mudar e mostrar o botão que abre Central de IA → Perfil e análises |

## 2. Fim de uma resposta

| Gatilho | Se perfil… | Se modo… | Cadeia de ações |
| --- | --- | --- | --- |
| `ai:edit-finished` (a IA gravou rascunhos) | — | **As/Co:** abre a **janela de revisão** (lado a lado); o autor aprova ou descarta cada arquivo. **Au:** `autoApplyAiEdits` grava direto e marca os arquivos com a **bolinha** | destrava `ai_lock` → encerra a sessão do changelog → (revisão **ou** gravação direta) |
| `ai:turn-finished` | — | — | skills que a IA pediu (`run_skill`) entram na **fila de execução** (cada uma com sua permissão) |

## 3. Sincronizar

| Gatilho | Se perfil… | Se modo… | Cadeia de ações |
| --- | --- | --- | --- |
| O autor sincroniza rascunhos (`sync:completed`) | **onSync** desligado (M): nada. **onSync** ligado, **autoAnalyze** desligado (E, Eq): abre modal "Analisar agora?" com custo estimado. **autoAnalyze** ligado (C, U): analisa sozinho | — | 1. cada arquivo vira oficial (versão no histórico) → 2. índices/linha do tempo atualizados **sem IA** (`syncTimelineFile`) → 3. análise (se acima) → 4. gatilhos de skill: `sync`, `updated:<tipo>`, `chapter-sync` (só manuscrito de capítulo) |
| Análise roda | `facts`, `verify`, `timeline`, `tone`, `synopsis` ligam etapas (ver perfis); **orçamento** limita (para e continua depois) | — | digest por arquivo alterado (arquivos inalterados nunca são reanalisados) → verificação de candidatos (**verify**) → tom (**tone**) → alinhamento com a Sinopse (**synopsis**) → issues na Central de Revisões → gatilho de skill `analysis-done` |

## 4. Rotinas do app que disparam skills

| Gatilho | Evento interno | Observações |
| --- | --- | --- |
| Abrir o app | `app-start` | depois da rotina de inicialização (atualização, backup) |
| Abrir um livro | `book:changed` → `book-open` | — |
| Abrir um arquivo | `file:opened` → `file-open` | — |
| Salvar o rascunho (autosave) | `temp-file:saved` → `file-save` | no máx. 1 aviso por arquivo a cada 60 s |
| Sincronizar | `sync:completed` → `sync` | — |
| **Sincronizar o manuscrito de um capítulo** | `temp-file:synced` de `chapter_NNN/2_draft.md` → `chapter-sync` | gatilho **específico** (esboço e análise do capítulo não disparam) |
| Criar / atualizar / excluir ficha, capítulo, anotação | `file:created`, `chapter:created`, `temp-file:synced`, `file:deleted`, `chapter:deleted` → `created:<tipo>`, `updated:<tipo>`, `deleted:<tipo>` (e `…:file`) | índices, timelines e `.system/` não disparam |
| Exportar | `export:file` → `export` | — |
| Análise concluída | `analysis:changed` → `analysis-done` | — |

## 5. Execução de uma skill

| Etapa | Regra |
| --- | --- |
| Quem pode pedir | o autor ("Executar agora"), um gatilho (skill **recorrente** e **ativa**) ou a IA (`run_skill`) |
| Controle de alterações | **gatilho com arquivo**: só roda se o arquivo mudou desde a última execução bem-sucedida da skill nele (hash SHA-1 em `.system/skills-state.json`) **ou** se as diretrizes mudaram (texto/versão da skill ou **Sinopse**). Execução manual ignora o hash |
| Permissão | por skill ("pedir permissão antes de ativar", padrão ligado) **ou** global ("todas pedem", **forçado em M e E**). A janela mostra tools permitidas, aviso de edição e **estimativa de tokens** |
| Instruções | enxutas (`compactInstructions`) quando o perfil pede **e** a skill não está marcada "não otimizar" (skills com amostras de escrita) |
| Tools | só as que a skill declara (mais as do chat); o perfil não amplia nem reduz esse conjunto |
| Fila e trava | uma por vez; uma skill nunca dispara outra nem a si mesma; **4 s** de carência depois de cada execução |
| Resultado | notificação no chat, estatística (execuções, tokens, sucesso/falha) e, se houve gatilho com arquivo, hash guardado |

## 6. Outras rotinas com IA

| Rotina | Quando | Perfil | Modo |
| --- | --- | --- | --- |
| Criação guiada (`start_creation` / `complete_creation`) | a IA cria capítulo, ficha ou anotação **no livro aberto** (nunca livro) | precisa das tools (Eq+; no E por `get_tool_specs`) | iguais; permissão `aiWrite` da pasta de destino |
| Correção ortográfica | sempre, **sem IA** (sublinhado do Chromium no editor + contagem de palavras desconhecidas por Hunspell no processo principal) | — | — |
| Issues determinísticos (links, palavras repetidas, ordem de eventos) | ao escrever/sincronizar, **sem IA** | — | — |
| Backup, atualização | ao abrir o app, **sem IA** | — | — |

## 7. Lacunas conhecidas (não implementado)

- O **modo** não altera tools, perfil nem skills (só prompt, templates e revisão).
- Não há **skills nativas** ligadas a modos; não há laço de trabalho autônomo.
- "Corrigir tudo" na Central de Revisões, importação de livro por arquivo (Word/PDF…), skills com **campo de entrada** e a lista de skills
  nativas estão **propostos** em `docs/features/index.md` (seção Pendências), aguardando aprovação.
