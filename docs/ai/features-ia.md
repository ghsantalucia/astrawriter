# Features feitas por IA

> Aqui ficam **só** as funcionalidades em que a IA faz o trabalho: skills, pipelines e o fluxo de cada uma. O que é do editor e do
> sistema (sem IA) fica em [`../features/index.md`](../features/index.md), que apenas marca essas features como "feito por IA" e
> aponta para cá. Regras gerais: [`modos-da-ia.md`](modos-da-ia.md), [`perfis-de-uso-da-ia.md`](perfis-de-uso-da-ia.md) e
> [`fluxos-da-ia.md`](fluxos-da-ia.md). Tools: [`ai-tools.md`](ai-tools.md).

## 1. Como uma feature de IA funciona (pipeline comum)

1. **Gatilho:** o autor (botão, "Executar agora"), um evento do app (skill recorrente) ou a IA (`run_skill`).
2. **Checagens:** perfil (não roda em "apenas conversa"), **modo do livro** (skills com `modes`), **campos de entrada** (janela de perguntas),
   **hash** (gatilho com arquivo só roda se o arquivo mudou) e **permissão** (janela com tools e estimativa de tokens).
3. **Pedido à IA:** instruções da skill (otimizadas ou não) + contexto + **mapa do livro** com `(inalterado desde a última execução)` +
   informações do autor. Só as tools que a skill declara.
4. **Resultado:** edições viram **rascunho** (ou gravação direta no modo autônomo), dicas vão para a **Central de Revisões**,
   estatística de tokens e hash dos arquivos lidos.

## 2. Skills nativas (já instaladas, não removíveis, editáveis com aviso)

| Skill | Tipo / gatilho | Modos | O que faz | Resultado |
| --- | --- | --- | --- | --- |
| Criar fichas de personagens / ambientes / conceitos citados | recorrente · `chapter-sync` | co-autor, autônomo (assistente: sob demanda) | acha o que é citado e não tem ficha, cria a ficha só com fatos do texto e liga a 1ª citação | fichas novas + links |
| Encontrar eventos no manuscrito | recorrente · `chapter-sync` | todos | acha acontecimentos sem ficha de evento | dicas "Ficha ausente" |
| Ligar o evento criado ao texto | recorrente · `created:event` | todos | acha referências ao evento e as liga | links |
| Situar o evento no tempo e checar contradições | recorrente · `created:event` (depois da anterior) | todos | reúne citações + variáveis, deduz o momento, lê o arquivo inteiro ao menor sinal de contradição, registra erro se certeza e preenche só variáveis vazias | erros na Central + variáveis |
| Remover um item da história com naturalidade | recorrente · `deleted:character/place/element/event` | todos | usa links quebrados + busca pelo nome para achar cada citação e sugere reescritas que tiram o item sem "buraco" | dicas com reescrita |
| Rascunho do próximo capítulo (pela Sinopse) | uso único | autônomo (demais: sob demanda) | planeja e escreve o próximo capítulo com Sinopse + capítulos anteriores | capítulo novo (rascunho) |
| Escrever o capítulo a partir do esboço | uso único · pergunta o capítulo | co-autor, autônomo | transforma o Esboço em Manuscrito | manuscrito |
| Conectar o livro (wiki) | uso único | todos | cria fichas que faltam e liga manuscritos e fichas | fichas + links |
| Corrigir pendências da Central de Revisões | uso único · botão "Corrigir tudo" | todos | avalia cada issue e escolhe a solução (ver 3) | correções em rascunho + relatório |

*Skills de modo (coluna Modos) só disparam sozinhas nesses modos; execução manual ou pedida pela IA vale sempre.*
**Não implementada:** "Digest" como skill (hoje é função interna da análise).

## 3. "Corrigir tudo" (Central de Revisões)

- **Onde:** botão na visão geral (todas as categorias) e em cada aba de categoria.
- **Fluxo:** botão → `SkillRunner.request(corrigir-pendencias, { extra: "Categoria a corrigir: <cat>" })` → janela de permissão com estimativa →
  a IA chama `list_issues`, avalia cada issue e decide: link quebrado (remove o link, mantém o texto) · digitação/gramática (aplica o
  `replacement` se claramente correto) · contradição/linha do tempo (prevalece ficha > Sinopse > capítulo mais antigo > mais recente; se
  não for claro, deixa) · dicas (só com `replacement` seguro) → `replace_in_file` + `resolve_issues` → relatório com corrigidos e deixados.
- **Garantias:** só altera arquivos com `aiWrite`; tudo vira rascunho (ou direto no autônomo) e entra no changelog.

## 4. Skills da Loja (sob demanda)

| Skill | Resultado |
| --- | --- |
| Encontrar trechos prolixos | dicas `verbose-tip` com sugestão enxuta |
| Avaliar o ritmo da história | dicas `pacing-tip` |
| Sugerir fichas que faltam (fora dos manuscritos) | dicas `missing-entity-tip` |
| Revisar e padronizar a escrita (tom + amostras da Sinopse) | reescrita em rascunho (otimização desligada) |
| Reescrever no estilo de um autor (pede nome, amostras e capítulo) | reescrita em rascunho (otimização desligada) |
| Grounding: conferir fatos, datas e épocas | dicas `grounding-tip` (sempre amarelas); **pesquisa na internet** (opção `web`) |

## 4.1 Pesquisa na internet (opção por skill)

Cada skill tem a opção **"Permitir pesquisa na internet"** (`web: true` no arquivo; também no formulário e na página da skill). Quando ligada, o app **liga a busca nativa do provedor no pedido**:
**Claude** (ferramenta `web_search`, até 6 buscas, roda do lado da Anthropic junto com as tools do app) e **Gemini** (Google Search; se o modelo não aceitar a busca junto com as tools do app, o app tenta sem ela e avisa no chat). Nos demais provedores a skill roda só com o conhecimento do modelo e um aviso aparece no chat. Gasta mais tokens. Usam a opção: **Grounding** e **Reescrever no estilo de um autor** (que pesquisa quem é o autor e o estilo dele antes de reescrever, cruzando com as amostras).

## 5. Criar skills com a IA

Tool `propose_skill`: a IA **entrevista** o autor (objetivo, quando roda, exemplos), preenche o formulário completo (título, descrição,
instruções, tipo, gatilhos, tools, tags, entradas, otimização) e **abre a tela de criação já preenchida**. O autor revisa e aperta
**Criar skill**: a IA nunca cria sozinha.

## 6. Importar livro por arquivo (extração sem IA; criação guiada)

Word (`.docx`, mammoth), LibreOffice (`.odt`), PDF (`pdf-parse`), `.txt` e `.md` → título e capítulos por heurística (títulos "Capítulo N" ou o
nível de título que se repete) → **tela de revisão** (renomear, juntar com o anterior, remover) → assistente de livro com o título preenchido →
capítulos gravados no livro novo. *Hoje a extração é por regras, sem IA; uma etapa opcional de IA para melhorar a divisão é possível.*

## 7. Análise do livro (digest)

Função interna (não é skill): resume cada arquivo alterado, extrai fatos e eventos, confere contradições. Controlada pelo **perfil de uso**
(`onSync`, `autoAnalyze`, `facts`, `verify`, `timeline`, `tone`, `synopsis`, orçamento). Detalhes em `perfis-de-uso-da-ia.md` e `fluxos-da-ia.md`.

## 8. Pendente

Busca web para provedores além de Claude e Gemini; modo autônomo como laço contínuo; modo forçando perfil; etapa de IA na importação.
