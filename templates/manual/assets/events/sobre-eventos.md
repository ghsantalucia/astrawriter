---
humanRead: true
humanWrite: true
aiRead: true
aiWrite: true
userDelete: true
advanced: false
title: "Sobre eventos"
data:
  title:
    placeholder: "Nome do evento"
    required: true
    content: "Sobre eventos"
  when:
    placeholder: "Quando ocorreu (ex.: ano 312, inverno do ano 5, durante a guerra)"
    required: false
    content: ""
  after:
    placeholder: "Aconteceu depois de (nomes de outros eventos, separados por vírgula)"
    type: events
    required: false
    content: ""
  before:
    placeholder: "Aconteceu antes de (nomes de outros eventos, separados por vírgula)"
    type: events
    required: false
    content: ""
  aliases:
    placeholder: "Nomes alternativos (separados por vírgula)"
    required: false
    content: ""
---

# FICHA DE EVENTO

Em **Eventos** ficam os fatos da história, um por arquivo: a batalha, a coroação, a traição. O que importa é **quando** cada um aconteceu.

- Os campos **depois de** e **antes de** ligam este evento a outros (vários, separados por vírgula). A partir dessas ligações o sistema monta a [Linha do Tempo](/assets/events/timeline.md), sem usar IA.
- A **Linha do Tempo** é o índice desta categoria: lista o link de todos os eventos, em ordem cronológica quando o sistema consegue deduzi-la (os sem data conhecida ficam numa seção à parte). Você não a edita: ela se atualiza sozinha.
- Se houver uma ordem impossível (A antes de B e B antes de A), a [Central de Revisões](app:central/issues/timeline) avisa.
