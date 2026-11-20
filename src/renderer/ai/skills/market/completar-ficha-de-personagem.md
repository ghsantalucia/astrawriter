---
name: completar-ficha-de-personagem
title: Completar a ficha de um personagem novo
description: Quando uma ficha de personagem é criada, sugere o que falta preencher com base no que o livro já diz sobre ele.
author: Astra Writer
version: 1.0.0
kind: recurring
triggers: [created:character]
tools: [list_files, read_file, replace_in_file]
tags: [personagens, fichas]
details: |
  Sempre que você **cria uma ficha de personagem**, a skill procura nos capítulos e nas fichas o que já foi dito sobre o
  personagem e propõe o preenchimento das seções vazias.

  Só mexe na ficha recém-criada, em rascunho, e só escreve o que encontrar no livro (não inventa).
tokens:
  bookTokens: 20000
  spent: 5000
---

# Completar a ficha de um personagem novo

1. Descubra qual ficha de personagem acabou de ser criada (o gatilho informa o arquivo) e leia-a.
2. Use `list_files` e `read_file` para procurar, nos capítulos e nas outras fichas, menções ao personagem (nome e apelidos).
3. Para cada seção da ficha ainda vazia, escreva um texto curto com **somente** o que o livro já afirma sobre ele (aparência, personalidade, história, objetivos). Marque com “(a confirmar)” o que for dedução.
4. Não invente fatos. Se nada foi dito sobre uma seção, deixe-a como está.
5. Grave com `replace_in_file` apenas nas seções vazias e resuma o que foi preenchido.
