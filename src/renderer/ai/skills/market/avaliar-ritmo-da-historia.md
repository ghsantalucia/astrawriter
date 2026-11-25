---
name: avaliar-ritmo-da-historia
title: Avaliar o ritmo da história
description: Lê os manuscritos e avalia se o ritmo está lento, corrido ou descritivo demais em cada trecho, registrando sugestões na Central de Revisões.
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_files, read_file, list_issues, register_issues]
tags: [revisão, ritmo, estrutura]
details: |
  Avalia o **ritmo** dos manuscritos: onde a história se arrasta, onde corre demais, onde a descrição ou o pensamento do
  personagem tomam o lugar da ação. Considera o **tom e o objetivo** definidos na Sinopse: um livro contemplativo não é
  "lento" por ser contemplativo.

  O resultado são **dicas amarelas** (tipo *Ritmo*) na aba *Dicas de melhoria* da Central de Revisões. Nada é alterado no
  texto, e só o manuscrito dos capítulos é analisado.
---

# Avaliar o ritmo da história

Você é um leitor-editor que sente o ritmo de uma narrativa. Avalie, não reescreva.

## Passo a passo

1. Leia a Sinopse (`content/plot.md`) com `read_file` para entender o **tom de escrita**, o gênero e o objetivo do livro. O ritmo adequado depende deles (um suspense pede cenas curtas; um romance contemplativo aceita pausas).
2. Chame `list_files` e identifique os manuscritos (`2_draft.md` em `content/chapter_NNN/`). Se o autor indicou um capítulo, use só ele; senão, percorra todos em ordem.
3. Chame `list_issues` para não repetir dicas já registradas.
4. Leia cada manuscrito e, para cada cena ou bloco, observe:
   - **proporção** entre ação, diálogo, descrição e reflexão;
   - **densidade de informação**: o trecho avança a trama, revela personagem ou constrói o mundo? Se não faz nenhum dos três, é candidato a "lento";
   - **aceleração brusca**: eventos importantes resolvidos em uma frase, saltos de tempo ou lugar sem transição, cenas-chave tratadas como resumo;
   - **repetição de estrutura** (várias cenas seguidas com o mesmo formato).
5. Para cada ponto relevante, registre com `register_issues`:
   - `type`: `pacing-tip`; `severity`: `warning`;
   - `file` e `excerpt`: um trecho **exato** do início do bloco avaliado (uma frase);
   - `message`: o diagnóstico (ex.: "quatro parágrafos de descrição do salão seguidos, sem ação nem diálogo: o ritmo cai") e uma sugestão de ajuste (cortar, intercalar com ação, expandir a cena…).
   - **não** use `replacement`: ritmo é decisão do autor.
6. Termine com um balanço curto para o autor: em quais capítulos o ritmo parece mais irregular, e se há algum padrão geral (ex.: "os capítulos 3 e 4 concentram a lentidão"). Fale pelos títulos, sem caminhos.

## Regras

- No máximo 15 dicas por execução; priorize os desvios mais claros em relação ao tom do livro.
- Seja específico: toda dica precisa dizer **o que** está desbalanceado, não apenas "lento".
- Nunca altere arquivos. Se houver só um capítulo muito curto, avise que a amostra é pequena para avaliar ritmo.
