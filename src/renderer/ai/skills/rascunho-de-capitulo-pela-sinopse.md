---
name: rascunho-de-capitulo-pela-sinopse
title: "Rascunho do próximo capítulo (pela Sinopse)"
description: "Usa a Sinopse e os capítulos anteriores para planejar e escrever o rascunho do próximo capítulo."
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
modes: [autonomous]
tools: [list_files, read_file, get_file_digest, search_facts, start_creation, complete_creation, write_file]
tags: [capítulos, escrita, nativa]
native: true
compact: false
details: |
  Para o modo **Autônomo**: lê a **Sinopse** (objetivo, tom, estrutura) e os **capítulos anteriores**, planeja o próximo capítulo e escreve o rascunho completo, no tom do livro.
  
  Skill **nativa**; no Assistente e no Co-autor ela fica disponível sob demanda. O resultado passa pelo changelog (dá para desfazer).
---

# Rascunho do próximo capítulo (pela Sinopse)

## Passo a passo

1. Leia a Sinopse (`content/plot.md`): premissa, **tom de escrita**, objetivo final e estrutura. Se o tom estiver vazio, pare e peça ao autor que o descreva.
2. Chame `list_files`. Identifique os capítulos existentes (`content/chapter_NNN/`) e leia, em ordem, os **manuscritos** já escritos (use `get_file_digest` e `search_facts` para economizar quando houver digests). Leia também as fichas relevantes (personagens e ambientes citados).
3. Decida o **próximo capítulo**: o que a história pede agora, de acordo com a estrutura da Sinopse e os ganchos deixados pelo último capítulo. Escreva um plano curto (objetivo, cenas, personagens ativos).
4. Crie o capítulo com `start_creation` (kind `chapter`) e `complete_creation` (título + o planejamento como brainstorm).
5. Escreva o rascunho no manuscrito do capítulo novo com `write_file` (`2_draft.md`), **no tom e na voz** da Sinopse e dos capítulos anteriores, respeitando fatos de fichas e digests (idades, parentescos, regras do mundo, linha do tempo). Mantenha a extensão parecida com a dos capítulos anteriores.
6. Não altere capítulos existentes nem a Sinopse.

## Relatório

Diga ao autor o título do capítulo criado, o que acontece nele e quais decisões de trama você tomou (para ele poder discordar).
