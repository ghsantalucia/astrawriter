---
name: revisar-dialogos
title: Revisar diálogos
description: Confere se cada fala combina com o jeito de falar do personagem, usando as amostras da ficha dele.
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_files, read_file]
tags: [diálogos, personagens, revisão]
details: |
  Lê um capítulo e confere se cada personagem **fala como ele mesmo**: vocabulário, tamanho das frases e tom, comparando com
  as amostras de diálogo e o "jeito de falar" da ficha.

  Apenas aponta as falas que destoam e sugere ajustes; **não altera nenhum arquivo**.
tokens:
  bookTokens: 20000
  spent: 4000
---

# Revisar diálogos

1. Leia o capítulo indicado pelo autor (ou o arquivo aberto no editor).
2. Para cada personagem que fala, leia a ficha dele em `assets/characters/` e anote o jeito de falar e as amostras de diálogo.
3. Liste as falas que destoam: cite a fala, explique o que destoa e sugira uma versão mais fiel.
4. Não altere nenhum arquivo. Termine com um resumo: quantas falas destoaram e de quais personagens.
