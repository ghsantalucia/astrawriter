---
name: ortografia-elfica-tolkien
title: Correção ortográfica da língua élfica
description: A cada sincronização, confere a grafia das palavras inventadas (élfico) segundo o glossário do livro.
author: Astra Writer
version: 1.0.0
kind: recurring
triggers: [sync]
tools: [list_files, read_file, replace_in_file]
tags: [idioma inventado, ortografia, tolkien]
details: |
  Para livros com uma **língua inventada** (como o élfico de Tolkien), mantém a grafia sempre igual à do glossário.

  Roda **sempre que você sincroniza**: procura nos arquivos alterados palavras que parecem da língua inventada, compara com
  o glossário (uma ficha de conceito chamada "Glossário") e corrige as grafias divergentes.

  Só corrige grafia; nunca muda o sentido do texto. Os arquivos alterados vão para rascunho.
tokens:
  bookTokens: 20000
  spent: 6000
---

# Correção ortográfica da língua élfica

1. Procure com `list_files` a ficha de conceito chamada "Glossário" (em `assets/elements/`) e leia-a: ela define a grafia correta de cada palavra da língua inventada.
2. Leia os arquivos de texto alterados recentemente (manuscritos dos capítulos).
3. Para cada palavra da língua inventada que aparecer com grafia diferente da do glossário (acentos, apóstrofos, letras trocadas), corrija com `replace_in_file`, trocando só a palavra.
4. Nunca traduza nem mude o sentido do texto. Se uma palavra não estiver no glossário, não altere: apenas liste ao final.
5. Termine com um resumo curto: quantas correções foram feitas e quais palavras não constam no glossário.
