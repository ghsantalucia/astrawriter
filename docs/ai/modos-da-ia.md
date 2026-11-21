# Modos da IA: Assistente, Co-autor e Autônomo

> Este documento descreve **o que cada modo realmente faz hoje no código** e o que **ainda não foi implementado**. Última
> conferência: versão 1.0.0 + ajustes em andamento.

O **modo da IA** é uma propriedade **do livro** (não do app): fica no `config.json` do livro (`ai_mode`) e na variável
"Modo da IA" da Sinopse (`content/plot.md`). Escolhe-se ao criar o livro (wizard) e muda-se depois em
**Central do Livro → Dados do livro**. Valores: `assistant`, `coauthor`, `autonomous` (padrão: `assistant`).

## 1. O que o modo faz hoje (implementado)

| # | Efeito | Assistente | Co-autor | Autônomo | Onde está no código |
| --- | --- | :---: | :---: | :---: | --- |
| 1 | **Linha de "Modo de trabalho" no prompt de sistema** (uma frase que orienta o comportamento da IA) | sim | sim | sim | `ai/prompts/index.ts` (`MODE_PROMPTS`) |
| 2 | **Conjunto de templates sugerido** ao criar o livro: o perfil de template acompanha o modo (corpo das fichas, esboço e análise) | `assistant` | `coauthor` | `autonomous` | `creationService.ts` (`follows`), `shared/templateKinds.ts` |
| 3 | **Revisão das alterações da IA**: no Assistente e no Co-autor aparece a janela de revisão (comparação lado a lado) | janela de revisão | janela de revisão | **gravação direta**, sem janela | `controllers/domainController.ts` (`ai:edit-finished`) |
| 4 | **Marcação de "alterado pela IA"** (bolinha no explorer e nas abas do capítulo, some 3 s depois de abrir o arquivo) | não | não | sim | `services/aiChangeService.ts` |
| 5 | **Changelog com rollback** das gravações da IA | sim | sim | sim | `services/changelogService.ts` |

### As três frases do prompt (item 1)

- **Assistente:** "O autor escreve; você ajuda quando pedido (sugestões, revisão, trechos redigidos para ele aprovar). Não crie nem
  reescreva conteúdo por iniciativa própria."
- **Co-autor:** "Você propõe e escreve capítulos e trechos junto com o autor, passo a passo, e pergunta antes de decisões grandes."
- **Autônomo:** "A partir do briefing do autor você planeja e escreve capítulo a capítulo sem pedir confirmação a cada passo, seguindo
  as permissões dos arquivos; tudo passa pela revisão do autor." *(Atenção: a frase diz "passa pela revisão", mas o código grava direto
  no modo autônomo e registra no changelog. Vale corrigir a frase.)*

### O que vale para **todos** os modos (não depende do modo)

- **Permissões** por arquivo/pasta (`aiRead`, `aiWrite`, `aiDelete`): a IA só lê e escreve o que o autor liberou.
- **Rascunho**: toda alteração da IA vira `.md.temp`; o autor precisa **sincronizar os rascunhos pendentes antes** de a IA editar
  (`requireFullSync`).
- **Trava do projeto** (`ai_lock`) enquanto a IA edita.
- **Escopo**: a IA só atua dentro do **livro aberto** (não cria, abre nem lê outros livros).

## 2. O que o modo **não** faz hoje (não implementado)

O nome sugere mais do que existe. Estas diferenças **não estão no código**:

| Ideia | Situação |
| --- | --- |
| Co-autor/Autônomo liberar **mais tools** que o Assistente | **Não.** As tools que a IA recebe dependem só do **perfil de uso** (Mínimo…Ultra), nunca do modo. |
| O modo escolher o **perfil de uso** (Assistente → Mínimo/Econômico; Autônomo → Completo) | **Não.** Perfil e modo são independentes; o autor escolhe cada um. |
| Co-autor **criar arquivos sozinho** a partir das diretrizes | **Não há fluxo automático.** O co-autor só tem a frase no prompt; para criar fichas/capítulos ele usa as mesmas tools de criação que o assistente, quando o autor pede. |
| Autônomo **planejar e escrever capítulo a capítulo** sozinho (laço de trabalho) | **Não.** Cada mensagem é uma resposta (até 10 rodadas de tools). Não existe um "agente" que continue sem o autor mandar a próxima mensagem. |
| **Skills nativas por modo** (ex.: "gerar capítulo a partir do esboço" só no autônomo/co-autor) | **Não existe o conceito de skill nativa.** Todas as skills são da biblioteca do autor, executadas manualmente, por gatilho ou a pedido da IA. |
| Gatilhos automáticos por modo (ex.: criar fichas de personagens citados a cada sincronização no co-autor) | **Não.** Gatilhos pertencem às skills, não ao modo. |

## 3. Proposta para o que falta (aguarda decisão)

Para os modos realmente diferirem, o desenho mais simples é um **"pacote do modo"** aplicado ao abrir o livro:

| Modo | Perfil de uso sugerido | Tools extras | Skills nativas ligadas | Revisão |
| --- | --- | --- | --- | --- |
| Assistente | o que o autor escolher (Mínimo/Econômico/Equilibrado) | só as do perfil | nenhuma automática | janela de revisão |
| Co-autor | Equilibrado ou acima (mínimo recomendado) | edição + criação de fichas/capítulos | fichas ausentes, esboço → capítulo (sob confirmação) | janela de revisão |
| Autônomo | Completo/Ultra | todas | fichas, conexões, rascunho de capítulo | gravação direta + marcação |

Isso depende de (a) o conceito de **skill nativa** (instalada com o app, ligada por modo) e (b) decidir se o modo **força** o perfil
ou apenas **recomenda** (aviso quando o perfil é fraco demais para o modo). Ver a lista de pendências em `docs/features/index.md`.
