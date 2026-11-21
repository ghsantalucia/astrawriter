---
name: contexto-do-evento
title: "Situar o evento no tempo e checar contradições"
description: "Recupera o contexto de todas as citações do evento e das variáveis, descobre quando ele ocorreu, aponta contradições de datas e preenche o que faltar na ficha."
author: Astra Writer
version: 1.0.0
kind: recurring
triggers: [created:event]
tools: [list_files, search_book, read_file, get_file_digest, search_facts, get_file_variables, set_file_variables, register_issues]
tags: [eventos, linha do tempo, nativa]
native: true
details: |
  Depois de **ligar o evento ao texto**, esta skill reúne o **parágrafo de cada citação** do evento (e as variáveis que você preencheu) para entender **quando** ele aconteceu e **como se relaciona** com os outros eventos.
  
  - Se achar **sinal de contradição** de datas, lê o **arquivo inteiro** onde está a dúvida para ter certeza; se tiver certeza, registra um **erro** na Central de Revisões.
  - Se estiver tudo coerente e ela descobrir o momento (absoluto ou relativo a outro evento), **preenche as variáveis** do evento que ainda estiverem vazias (nunca sobrescreve o que você escreveu).
  
  Skill **nativa**, encadeada depois de *Ligar o evento criado ao texto*.
---

# Situar o evento no tempo e checar contradições

O evento é o indicado em "Arquivo:" no começo do pedido.

## Passo a passo

1. Leia a ficha (`get_file_variables`): `when`, `after`, `before`. Anote o que o autor já preencheu: **isso nunca é sobrescrito**.
2. Reúna as citações: `search_book` pelo título e apelidos. Para cada arquivo, leia **só o parágrafo** da citação (e vizinhos, se preciso). Use `get_file_digest` e `search_facts` para datas e eventos já extraídos.
3. Monte a linha do tempo mental: quando o evento ocorreu (data absoluta, "no inverno do ano 5", "depois da guerra"…) e relação com outros eventos (antes/depois de quê).
4. **Contradições.** Procure sinais: duas citações com momentos incompatíveis; ordem impossível com outros eventos (A depois de B em um texto e antes em outro); idades ou datas que não fecham. **Ao menor sinal, leia o arquivo inteiro** (`read_file`) onde está a possível contradição antes de concluir.
   - Se, lido o arquivo, tiver **certeza**: registre com `register_issues` (`type` `timeline-conflict` ou `fact-conflict`, `severity` `error`, `excerpt` exato de cada lado em `file`/`related`, `message` explicando os dois lados).
   - Se **não** tiver certeza: registre como `possible-conflict` (`warning`) ou não registre.
5. **Preencher a ficha.** Se não há contradição e você descobriu o momento (`when`) ou a relação (`after`/`before`, usando o título de outros eventos existentes), grave com `set_file_variables` **apenas os campos vazios**. Se houver dúvida entre duas leituras, não preencha.

## Relatório

O que descobriu sobre quando o evento ocorreu, o que preencheu, e as contradições registradas (certas e possíveis).

## Regras

- Nunca sobrescreva variáveis preenchidas pelo autor. Nunca invente datas.
