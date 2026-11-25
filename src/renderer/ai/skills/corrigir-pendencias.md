---
name: corrigir-pendencias
title: "Corrigir pendências da Central de Revisões"
description: "Avalia cada issue da Central de Revisões e escolhe a solução: aplica a correção segura, resolve a contradição ou explica por que deixou para o autor."
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_issues, read_file, get_file_digest, search_facts, replace_in_file, resolve_issues]
tags: [revisão, correção, nativa]
native: true
details: |
  É o que roda quando você clica em **Corrigir tudo** na Central de Revisões (por categoria ou geral). A IA **avalia cada pendência** e decide a solução: aplica a correção sugerida pelo sistema quando é segura, resolve contradições com base nas fichas, digests e na Sinopse, e **deixa para você** o que depende de decisão de autor.
  
  As alterações viram **rascunho para revisão** (ou são gravadas direto no modo autônomo) e ficam no changelog. Skill **nativa**: o botão depende dela.
---

# Corrigir pendências da Central de Revisões

O pedido indica a **categoria** (ou "todas"). Trabalhe só nela.

## Passo a passo

1. Chame `list_issues` (da categoria indicada). Ordene: links quebrados e erros de digitação primeiro, depois gramática, depois contradições e linha do tempo; **dicas (amarelas) por último e só as que tiverem `replacement`**.
2. Para cada issue, **avalie antes de agir**:
   - **Link quebrado:** se o alvo foi apagado, remova o link mantendo o texto (`replacement` = o texto do link).
   - **Digitação / gramática / palavra repetida / sinônimo:** aplique o `replacement` se for claramente correto no contexto; se houver dúvida de sentido, não aplique.
   - **Contradição ou linha do tempo:** leia o trecho e os arquivos envolvidos (`read_file`, `get_file_digest`, `search_facts`). Decida qual versão prevalece pela **fonte mais autoritativa**: a ficha > a Sinopse > o capítulo mais antigo > o mais recente. Se a prevalência for clara, ajuste o trecho **menos autoritativo**; se não for, **não mexa** e explique.
   - **Dicas de estilo/ritmo/prolixidade:** aplique só com `replacement` seguro que mantenha o sentido e a voz.
3. Aplique cada correção com `replace_in_file` (trecho exato, curto). Depois chame `resolve_issues` para marcar como resolvidos **apenas** os que você de fato corrigiu.
4. Se uma tool negar (permissão, rascunhos pendentes), pare esse item, anote e siga para o próximo.

## Relatório (obrigatório)

Uma lista curta: **corrigidos** (quantos e de que tipo), **deixados para o autor** (cada um com o motivo: ambíguo, decisão de enredo, sem fonte clara) e qualquer **erro de tool**. Seja honesto: só diga que corrigiu o que a tool confirmou.

## Regras

- Nunca invente fatos para "resolver" uma contradição. Em dúvida, deixe para o autor.
- Não reescreva além do trecho do issue.
