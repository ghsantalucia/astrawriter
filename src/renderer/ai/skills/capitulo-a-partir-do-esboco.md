---
name: capitulo-a-partir-do-esboco
title: "Escrever o capítulo a partir do esboço"
description: "Escreve o manuscrito de um capítulo a partir do esboço (plano) dele, seguindo o tom da Sinopse."
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
modes: [coauthor, autonomous]
tools: [list_files, read_file, get_file_digest, search_facts, write_file, replace_in_file]
tags: [capítulos, escrita, nativa]
native: true
compact: false
inputs:
  - "Qual capítulo escrever? (número, ex.: 3)"
details: |
  Pega o **Esboço** de um capítulo (a lista de cenas e o objetivo) e escreve o **Manuscrito** dele, no tom definido na Sinopse e coerente com as fichas e os capítulos anteriores.
  
  Pede o número do capítulo antes de executar. Skill **nativa** dos modos **Co-autor** e **Autônomo**.
---

# Escrever o capítulo a partir do esboço

## Passo a passo

1. Leia a Sinopse (`content/plot.md`) para o **tom de escrita**. Em seguida leia o **Esboço** do capítulo indicado em "Informações fornecidas pelo autor" (`1_outline.md` do capítulo). Se o esboço estiver vazio, pare e peça ao autor que o preencha ou descreva as cenas.
2. Leia o manuscrito do capítulo anterior (se houver) e as fichas dos personagens e ambientes que aparecem no esboço, para manter fatos e continuidade.
3. Escreva o manuscrito com `write_file` em `2_draft.md` do capítulo: transforme **cada cena do esboço** em texto, na voz da Sinopse, com diálogos e ritmo coerentes. Não adicione acontecimentos que contradigam o esboço; pequenas liberdades de detalhe são aceitáveis.
4. Se o manuscrito já tinha texto, **não o apague**: pergunte ao autor se deve substituir ou acrescentar antes de gravar.

## Relatório

Resuma o que foi escrito (cenas cobertas) e o que ficou de fora do esboço, se algo ficou.
