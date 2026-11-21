---
name: reescrever-no-estilo-de-um-autor
title: "Reescrever no estilo de um autor"
description: "Reescreve um capítulo imitando o estilo de um autor, a partir do nome dele e de amostras de escrita que você fornece."
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_files, read_file, replace_in_file]
tags: [estilo, reescrita, revisão]
web: true
compact: false
inputs:
  - "Nome do autor cujo estilo imitar"
  - "Cole aqui amostras da escrita desse autor (de 2 a 5 trechos de alguns parágrafos)"
  - "Qual capítulo reescrever? (número, ex.: 2)"
details: |
  Reescreve um capítulo no **estilo de um autor** que você escolher. Antes de executar, abre uma janela pedindo **o nome do autor**, **amostras da escrita dele** (a skill estuda o ritmo, o vocabulário, a pontuação e as figuras de linguagem) e **qual capítulo** reescrever.
  
  A skill **altera o texto** (as mudanças viram rascunho para a sua revisão e ficam no changelog) e preserva os fatos, os acontecimentos e as falas. Vem com a otimização de instruções **desligada**, para não distorcer as amostras.
---

# Reescrever no estilo de um autor

As informações do autor-modelo e as **amostras** vêm em "Informações fornecidas pelo autor". As **amostras** são a fonte principal do estilo; a pesquisa sobre o autor complementa (não confie só na memória).

## Passo a passo

1. **Pesquise o autor.** Use a **busca na internet** (se o seu provedor a oferecer) para confirmar **quem é o autor** informado e levantar o que se sabe sobre o **estilo de escrita dele**: período e escola literária, narrador e tempo verbal típicos, vocabulário, estrutura das frases, recursos e temas recorrentes, e o que a crítica destaca. Anote as fontes. Se não tiver acesso à internet, diga isso ao autor e siga só com as amostras e o que você sabe com segurança. Se não conseguir identificar o autor pelo nome, **pare e pergunte** (pode haver homônimos).
2. **Estude as amostras.** Cruze o que a pesquisa trouxe com as amostras (elas valem mais que qualquer resumo). Descreva para si (sem mostrar): tamanho médio das frases e dos parágrafos, vocabulário (formal, coloquial, arcaico), pontuação típica, tempo verbal e pessoa do narrador, uso de diálogo, figuras de linguagem, humor ou tom emocional, o que o autor **evita**.
3. Localize e leia o capítulo indicado (`list_files`, `read_file` do manuscrito `2_draft.md`). Se houver dúvida sobre qual é, pergunte.
4. **Reescreva trecho a trecho** com `replace_in_file` (nunca o arquivo inteiro de uma vez): aplique o estilo do autor mantendo **todos os fatos, nomes, acontecimentos, a ordem dos eventos e o sentido das falas**. Não copie frases das amostras; imite a maneira, não o conteúdo.
5. Mantenha a extensão aproximada do capítulo.
6. Se uma edição for negada, explique ao autor e pare.

## Relatório

Diga quem é o autor (confirmando a identificação), o que a pesquisa trouxe (com as fontes) e descreva em poucas linhas os traços do estilo que você aplicou e o que deixou como estava. Lembre que as mudanças estão como rascunho para aprovação.

## Regras

- Não altere outros arquivos. Nunca diga que alterou algo sem a tool confirmar.
