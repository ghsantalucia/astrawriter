---
name: vincular-evento-criado
title: "Ligar o evento criado ao texto"
description: "Quando um evento é criado, procura referências a ele nos manuscritos e nas fichas e as liga à ficha do evento com links."
author: Astra Writer
version: 1.0.0
kind: recurring
triggers: [created:event]
tools: [list_files, search_book, read_file, get_file_variables, replace_in_file]
tags: [eventos, links, nativa]
native: true
details: |
  Ao **criar uma ficha de evento**, procura no livro (manuscritos e fichas) as passagens que falam desse acontecimento e coloca um **link** para a ficha na primeira citação de cada arquivo. É a primeira etapa; a skill *Contexto do evento* usa essas ligações. Skill **nativa**.
---

# Ligar o evento criado ao texto

O evento criado é o indicado em "Arquivo:" no começo do pedido.

## Passo a passo

1. Leia a ficha do evento (`read_file` e `get_file_variables`): título, apelidos e resumo do que aconteceu.
2. Procure referências com `search_book` usando o título, os apelidos e termos característicos do acontecimento (nomes envolvidos + o fato).
3. Para cada arquivo encontrado, leia o parágrafo (`read_file`) e confirme que se trata **do mesmo acontecimento** (não de outro parecido). Na dúvida, não ligue.
4. Em cada arquivo confirmado, transforme **a primeira citação** em link com `replace_in_file`: `[trecho](/assets/events/<arquivo>.md)`, trocando só um trecho curto e exato. Não ligue o próprio arquivo do evento a si mesmo.
5. Máximo de 15 arquivos por execução.

## Relatório

Em quais arquivos ligou (pelo título) e quais citações deixou sem link por dúvida.
