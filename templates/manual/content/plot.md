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
    content: "Manual de Uso"
  ai_mode:
    placeholder: "Modo da IA"
    required: true
    type: select
    options:
      - { value: assistant, label: "Assistente de escrita: você escreve e a IA ajuda quando pedida" }
      - { value: coauthor, label: "Co-autor: a IA propõe e escreve junto com você, passo a passo" }
      - { value: autonomous, label: "Autônomo: a IA escreve a partir de um briefing seu" }
    content: "assistant"
  genres:
    placeholder: "Gêneros literários"
    required: false
    content: "Manual"
---

# SINOPSE

## Resumo da ideia central

Este livro é o **Manual de Uso** do Astra Writer: cada arquivo dele explica o que aquele tipo de arquivo é e para que serve. Explore o explorer (a barra da esquerda) abrindo os arquivos em qualquer ordem.

> A **Sinopse** é a "alma" do livro. Ela é o primeiro arquivo que a IA lê: é aqui que você resume a ideia central, o objetivo final e o tom de escrita da sua história. Quanto melhor a sinopse, mais a IA (e a Central de Revisões) entendem o que o seu livro quer ser.

## Objetivo final

> Aqui você descreve para onde a história caminha. A IA compara os capítulos com este objetivo para avisar se algo está fugindo do rumo.

## Tom de escrita

> Narrador, tempo verbal, clima da história. A IA usa isto para escrever e revisar no seu estilo.

Os campos que aparecem acima do texto (clique em **Dados do arquivo**) são o título do livro, o **modo da IA** (assistente, co-autor ou autônomo; dá para mudar também na [Central do Livro](app:central/book/data)) e os gêneros. Quando terminar de explorar, crie o seu livro em **Novo livro** (no seletor de livros, no topo da barra lateral) e apague este, se quiser.
