---
name: criar-fichas-de-conceitos
title: "Criar fichas de conceitos e sistemas citados"
description: "Encontra conceitos e sistemas citados no manuscrito que ainda não têm ficha, cria a ficha de cada um e liga o texto à ficha com um link."
author: Astra Writer
version: 1.0.0
kind: recurring
triggers: [chapter-sync]
modes: [coauthor, autonomous]
tools: [list_files, read_file, get_file_digest, start_creation, complete_creation, replace_in_file, list_issues]
tags: [wiki, fichas, nativa]
native: true
details: |
  Depois que você sincroniza o manuscrito de um capítulo, a skill procura conceitos e sistemas citados que **não têm ficha**, cria a ficha de cada um (só com o que o texto já diz) e coloca um **link** da primeira citação para a ficha.
  
  É uma skill **nativa**: nos modos **Co-autor** e **Autônomo** ela roda sozinha a cada sincronização de capítulo; no modo **Assistente** você ou a IA a executam sob demanda.
---

# Criar fichas de conceitos e sistemas citados

O manuscrito a analisar é o indicado em "Arquivo:" no começo do pedido (o capítulo recém-sincronizado). Se não houver, use o manuscrito aberto no editor (`2_draft.md`).

## Passo a passo

1. Leia o manuscrito com `read_file`. Chame `list_files` e anote as fichas que **já existem** em `assets/elements` (título e apelidos). Não crie ficha duplicada: confira também por variações do nome (apelidos, diminutivos, nomes com título).
2. Liste os conceitos e sistemas citados no capítulo que **não têm ficha**. Considere conceito/sistema as regras do universo: magias, tecnologias, religiões, leis, instituições, línguas, objetos lendários. Ignore termos comuns da língua.
3. Para cada um (no máximo 8 por execução), crie a ficha:
   - chame `start_creation` (kind `entity`, folder `assets/elements`) e depois `complete_creation` com **somente o que o texto estabelece**: nome, nomes alternativos, como funciona e seus limites só se o texto disser. Campos sem informação ficam em branco: **nunca invente fatos**.
   - se a tool disser que o valor "não aparece na conversa", use exatamente o nome como está no manuscrito.
4. Ligue o texto à ficha: com `list_files` descubra o caminho da ficha recém-criada e use `replace_in_file` para transformar **a primeira citação** no capítulo em link Markdown `[Nome](/assets/elements/arquivo.md)`. Troque um trecho curto e exato (o próprio nome, com a frase em volta se for preciso para ser único).
5. Se alguma tool recusar (permissão da pasta, rascunhos pendentes), pare, **não insista** e explique ao autor o que faltou.

## Relatório

Diga ao autor: quais fichas criou (pelo título), quais citações linkou e o que deixou de fora por não merecer ficha. Nunca mostre caminhos de arquivo.

## Regras

- Só crie ficha para o que tem papel na história ou aparece mais de uma vez; descarte citações de passagem e termos comuns.
- Não altere nada além dos links. Nunca apague texto do autor.
