---
humanRead: true
humanWrite: true
aiRead: true
aiWrite: true
userDelete: false
advanced: false
title: Sinopse

data:
  book_title:
    placeholder: "Título do Livro"
    required: true
    content: ""
  ai_mode:
    placeholder: "Modo da IA"
    required: true
    type: select # uma lista de opções vira uma caixa de seleção
    options:
      - { value: assistant, label: "Assistente de escrita: você escreve e a IA ajuda quando pedida" }
      - { value: coauthor, label: "Co-autor: a IA propõe e escreve junto com você, passo a passo" }
      - { value: autonomous, label: "Autônomo: a IA escreve a partir de um briefing seu" }
    content: "assistant" # valor padrão
  genres:
    placeholder: "Gêneros literários"
    required: false
    content: ""
---

# SINOPSE

## Resumo da ideia central

> Escreva resumidamente o que você já pensou para esta história.

## Objetivo final

> ...

## Tom de escrita

> ...
