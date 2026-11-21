# Perfis de uso da IA

> O **perfil de uso** controla **quanto custa** e **o quanto a IA pode fazer**. É uma configuração **global do app** (vale para
> todos os livros), em **Central de IA → Perfil e análises**. Não confundir com o *modo da IA* do livro (ver `modos-da-ia.md`).

Código: `ai/profiles.ts` (perfis e opções), `ai/toolTiers.ts` (envio das tools), `ai/aiGateway.ts` (montagem do pedido),
`ai/compact.ts` e `ai/prompts/` (instruções enxutas), `services/analysisService.ts` (análise do livro).

## 1. Os cinco perfis

Mexer em qualquer opção à mão leva ao perfil **Personalizado**.

| Opção | Mínimo | Econômico | Equilibrado (padrão) | Completo | Ultra |
| --- | :---: | :---: | :---: | :---: | :---: |
| **Tools enviadas** | só leitura + botões | edição pontual + sumário | mais usadas + sumário | todas (51) | todas (51) |
| Otimizar instruções | **sim** | **sim** | não | não | não |
| Analisar ao sincronizar (`onSync`) | não | sim (pergunta) | sim (pergunta) | sim | sim |
| Analisar sem pedir autorização (`autoAnalyze`) | não | não | não | **sim** | **sim** |
| Extrair fatos (`facts`) | sim | sim | sim | sim | sim |
| Conferir contradições com a IA (`verify`) | não | não | sim | sim | sim |
| Coerência temporal (`timeline`) | não | não | sim | sim | sim |
| Tom e forma de escrita (`tone`) | não | não | não | sim | sim |
| Comparar capítulos com a Sinopse (`synopsis`) | não | não | não | não | **sim** |
| Orçamento por análise (`budgetTokens`) | 20 mil | 40 mil | 80 mil | 150 mil | 300 mil |
| Histórico enviado (mensagens) | 6 | 12 | 30 | 40 | 50 |
| Skills pedem permissão sempre | **forçado** | **forçado** | opcional | opcional | opcional |

Há ainda a chave **"Modo apenas conversa"** (`chatOnly`): nenhuma tool é enviada (só os botões do chat). Ao ligar, as demais opções
de tools ficam bloqueadas.

## 2. O que cada opção aciona

| Opção | O que liga no sistema |
| --- | --- |
| **Tools: mínimo** | A IA recebe `read_file` e `show_buttons`. **Não** recebe `get_tool_specs`: não consegue pedir outras tools. O prompt avisa que ela só lê e manda oferecer o botão de trocar o perfil. |
| **Tools: sumário** | Recebe `show_buttons`, `get_tool_specs`, `replace_in_file` e `append_to_file` completas; as demais aparecem numa lista de 1 linha por tool. Para usar uma, chama `get_tool_specs` (a tool fica liberada pelo resto da sessão do livro). |
| **Tools: mais usadas** | 15 tools completas (listar, ler, escrever, anexar, substituir, carregar/listar/executar skills, issues, digest, fatos, variáveis, abrir arquivo, abrir central, buscar) + sumário das outras. |
| **Tools: todas** | As 51 tools, completas. |
| **Otimizar instruções** | Troca o prompt de sistema por uma versão reescrita (≈ metade do tamanho), encurta as descrições das tools (2 frases) e das skills (exceto as marcadas "não otimizar") e acrescenta o pedido de respostas curtas. Nunca mexe no texto do livro. |
| **Analisar ao sincronizar** | Depois de **sincronizar**, o app calcula o custo e **pergunta** se quer analisar (resumo/digest de cada arquivo alterado). Desligado: só na Central de Revisões, manualmente. |
| **Analisar em segundo plano** | Faz a análise **sem perguntar** logo após sincronizar. |
| **Fatos** | O digest inclui fatos (traços, idades, parentescos, regras). Sem isso não há contradições entre arquivos. |
| **Conferir contradições** | O sistema acha candidatos sem IA; a IA só confirma os duvidosos. |
| **Coerência temporal** | O digest extrai eventos/datas para a linha do tempo e achar incoerências. |
| **Tom e forma** | Registra narrador, tempo verbal e tom por capítulo e avisa quando um foge do padrão. |
| **Comparar com a Sinopse** | Uma conferência extra: resumos dos capítulos contra a Sinopse. |
| **Orçamento** | Teto estimado de tokens por análise; ao estourar, a análise para e continua na próxima. |
| **Histórico** | Quantas mensagens anteriores vão a cada pedido. |

## 3. O que vai em **cada mensagem** do chat (e quanto pesa)

Como as APIs não guardam estado, **tudo vai em todo pedido**. Medido no código (1 token ≈ 4 caracteres):

| Parte | Mínimo | Econômico | Equilibrado | Completo/Ultra |
| --- | ---: | ---: | ---: | ---: |
| Prompt de sistema (base) | 5,2 mil car. | 5,2 mil | 10,4 mil | 10,4 mil |
| Contexto (livro, arquivo aberto, modo, **mapa do livro**, skills, perfil) | ≈ 1 mil | ≈ 1 mil | ≈ 1 mil | ≈ 1 mil |
| Definições das tools | 1,5 mil | 2,6 mil | 8,6 mil | 26,8 mil |
| Sumário de tools no prompt | 0,5 mil | 6,0 mil | 4,8 mil | 0 |
| **Total (caracteres)** | ≈ 8,2 mil | ≈ 14,8 mil | ≈ 24,8 mil | ≈ 38,2 mil |
| **≈ tokens de entrada (sem histórico)** | **≈ 2 mil** | **≈ 3,7 mil** | **≈ 6,2 mil** | **≈ 9,5 mil** |

Some a isso: o **histórico** (6 a 50 mensagens), os **resultados das tools** (ex.: `read_file` de um capítulo) e a **resposta**. Cada
rodada de tools repete o pedido inteiro (máx. 10 rodadas por mensagem), então uma tarefa com 5 rodadas custa ≈ 5× a entrada base.

### Previsão de gasto (ordem de grandeza)

| Situação | Mínimo | Econômico | Equilibrado | Completo/Ultra |
| --- | ---: | ---: | ---: | ---: |
| "Oi" (1 rodada, sem histórico) | ≈ 2 mil | ≈ 3,7 mil | ≈ 6,2 mil | ≈ 9,5 mil |
| Editar um trecho (≈ 4 rodadas, lendo 1 capítulo de 3 mil tokens) | — (não edita) | ≈ 20 mil | ≈ 35 mil | ≈ 55 mil |
| Análise após sincronizar (por arquivo de 3 mil tokens) | ≈ 4,2 mil | ≈ 4,2 mil | ≈ 4,2 mil + verificação | ≈ 4,2 mil + verificação + tom |

*Os números de edição são estimativas; o consumo real aparece no contador de tokens do chat e em Central de IA → Uso por modelo.*

## 4. Quando usar cada um

| Perfil | Use quando… | Limites |
| --- | --- | --- |
| Mínimo | o provedor tem limite baixo (ex.: Groq grátis, 7 mil tokens por minuto) ou você só quer perguntar sobre o livro | **não escreve**; não analisa sozinho |
| Econômico | quer que a IA edite pequenos trechos gastando pouco | outras tools exigem um passo extra (`get_tool_specs`) |
| Equilibrado | uso do dia a dia | análise sempre pergunta antes de gastar |
| Completo | livro grande, provedor generoso, quer análise automática | gasta bastante |
| Ultra | revisão profunda | o mais caro; confere até o alinhamento com a Sinopse |

## 5. Como a IA "sabe" o perfil

O prompt de cada mensagem traz a seção **"Perfil de uso da IA"** (nome e descrição do perfil). Se o autor pedir algo que o perfil não
permite, a IA deve explicar o motivo, dizer onde mudar (Central de IA → Perfil e análises) e oferecer um botão que abre essa página.
No Mínimo há ainda a seção "Modo de uso mínimo" (só lê, não finge).
