---
name: revisao-de-consistencia
title: Revisão de consistência
description: Revisa um trecho ou capítulo procurando contradições com personagens, lugares, linha do tempo e regras do universo.
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_files, read_file, replace_in_file, get_file_digest, search_facts]
tags: [revisão, consistência]
details: |
  Procura **contradições** entre o texto que você está escrevendo e o que já foi estabelecido no livro: traços de
  personagens, descrições de lugares, regras dos sistemas e a ordem dos eventos.

  A skill lê o arquivo, cruza com as fichas citadas nele e lista cada problema encontrado, citando o trecho e a ficha de
  referência. Ela **não altera nada** sem você pedir.
tokens:
  bookTokens: 20000
  spent: 7000
---

# Revisão de consistência

1. Leia o arquivo a ser revisado.
2. Use `list_files` para localizar os arquivos relevantes em `assets/` (personagens, lugares, elementos e `timeline.md`) e leia apenas os que são citados no texto.
3. Compare o texto com esses arquivos e liste cada contradição encontrada, citando o trecho do texto e o arquivo de referência.
4. Não altere nada sem o autor pedir. Se ele pedir correções, aplique-as com `replace_in_file`.
5. Termine com um resumo curto: quantas inconsistências foram encontradas e quais são mais graves.
