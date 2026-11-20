---
humanRead: true
humanWrite: true
aiRead: true
aiWrite: true
userDelete: true
advanced: false
title: Novo evento

data:
  title:
    placeholder: "Nome do evento"
    required: true
    content: ""
  when:
    placeholder: "Quando ocorreu (ex.: ano 312, inverno do ano 5, durante a guerra)"
    required: false
    content: ""
  after:
    placeholder: "Aconteceu depois de (nomes de outros eventos, separados por vírgula)"
    type: events # lista de eventos: sugere os cadastrados e aceita nomes novos
    required: false
    content: ""
  before:
    placeholder: "Aconteceu antes de (nomes de outros eventos, separados por vírgula)"
    type: events # lista de eventos: sugere os cadastrados e aceita nomes novos
    required: false
    content: ""
  aliases:
    placeholder: "Nomes alternativos (separados por vírgula)"
    required: false
    content: ""
---

# FICHA DE EVENTO

## O que aconteceu

> Descreva o fato em poucas linhas: quem, onde e o que mudou na história.

## Consequências

> O que este evento causou ou tornou possível?
