---
name: conexoes-do-livro
title: "Conectar o livro (wiki)"
description: "Garante que a wiki corresponde ao conteúdo: cria fichas que faltam e liga manuscritos e fichas entre si com links."
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_files, read_file, get_file_digest, list_issues, start_creation, complete_creation, replace_in_file, auto_link_file]
tags: [wiki, links, nativa]
native: true
details: |
  Percorre o livro e deixa a **wiki** em dia com o texto: cria as fichas de personagens, ambientes, conceitos e eventos que são citados e não existem, e **liga** os manuscritos e as fichas entre si com links.
  
  Combina o que as skills "Criar fichas…" fazem, mas no livro inteiro. Skill **nativa**; use quando o livro já tem bastante texto ou depois de importar um livro.
---

# Conectar o livro (wiki)

## Passo a passo

1. `list_files` para mapear manuscritos, fichas (`assets/characters`, `places`, `elements`, `events`) e anotações. Anote títulos e apelidos das fichas.
2. Para cada capítulo (em ordem), leia o manuscrito. Se o mapa marcar "(inalterado desde a última execução)", **pule** o capítulo.
3. Liste o que é citado e não tem ficha (personagens, ambientes, conceitos/sistemas e eventos importantes). Descarte o irrelevante (citações de passagem, termos comuns).
4. Crie as fichas que faltam com `start_creation` + `complete_creation` (só com fatos que o texto estabelece; nunca invente). Máximo de 10 por execução.
5. Ligue as citações às fichas: use `auto_link_file` nos manuscritos que citam fichas (ele cria os links dos nomes e apelidos conhecidos). Para o que o auto-link não pega, use `replace_in_file` na **primeira citação** do capítulo.
6. Confira com `list_issues` se restaram links quebrados e informe.

## Relatório

Fichas criadas (por título), arquivos que receberam links, capítulos pulados por estarem inalterados, e o que ficou pendente (limite de 10 fichas, permissões).

## Regras

- Nunca altere o texto além de links. Respeite as permissões; se uma tool negar, explique e continue com o resto.
