---
name: eventos-do-manuscrito
title: "Encontrar eventos no manuscrito"
description: "Procura no manuscrito sincronizado acontecimentos importantes que ainda não têm ficha de evento e os registra como sugestões na Central de Revisões."
author: Astra Writer
version: 1.0.0
kind: recurring
triggers: [chapter-sync]
tools: [list_files, read_file, get_file_digest, list_issues, register_issues]
tags: [eventos, linha do tempo, nativa]
native: true
details: |
  A cada sincronização do manuscrito de um capítulo, procura **acontecimentos marcantes** (batalhas, mortes, coroações, descobertas, viradas de trama) que ainda não têm uma **ficha de evento** e registra uma **dica amarela** (*Ficha ausente*) para cada um.
  
  Nada é criado nem alterado: você decide quais eventos viram ficha. Skill **nativa**: o sistema depende dela para alimentar a linha do tempo.
---

# Encontrar eventos no manuscrito

O manuscrito a analisar é o indicado em "Arquivo:" no começo do pedido (o capítulo recém-sincronizado). Se não houver, use o manuscrito aberto no editor (`2_draft.md`).

## Passo a passo

1. Leia o manuscrito com `read_file`. Chame `list_files` para ver as fichas de eventos já existentes (`assets/events/`) e `list_issues` para não repetir sugestões.
2. Identifique **acontecimentos** que mudam a situação da história e que o enredo vai precisar situar no tempo (o que, quando, quem). Descarte ações cotidianas e cenas sem consequência.
3. Para cada evento sem ficha, registre com `register_issues`:
   - `type`: `missing-entity-tip`; `severity`: `warning`;
   - `file` e `excerpt`: o trecho **exato** onde o evento acontece (curto);
   - `message`: "**Evento**: <resumo em uma linha>. Sugestão: criar uma ficha de evento. Momento: <quando, se o texto disser>. Relação: <antes/depois de quê, se o texto disser>".
   - sem `replacement`.
4. No máximo 6 sugestões por execução. Se não há nenhum evento novo, não registre nada.

## Regras

- Nunca crie arquivos nem altere o texto. Não invente datas: use só o que o texto diz.
