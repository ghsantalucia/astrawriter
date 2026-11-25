---
name: sugerir-fichas-ausentes
title: Sugerir fichas que faltam
description: Procura personagens, ambientes, conceitos e eventos citados nas anotações e fichas (fora dos manuscritos) que ainda não têm ficha e sugere criá-las.
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_files, read_file, get_file_digest, list_issues, register_issues]
tags: [wiki, fichas, organização]
details: |
  Varre as **fichas e anotações** (tudo o que não é manuscrito de capítulo) atrás de nomes de personagens, lugares,
  conceitos e eventos que são citados mas **não têm ficha própria**, e registra uma **dica amarela** (*Ficha ausente*)
  para cada um, dizendo que tipo de ficha vale a pena criar.

  A skill **não cria** nada: você decide quais fichas criar (pelo botão **+** do Mundo ou pedindo à IA). Os manuscritos
  têm outra rotina, mais pesada, e ficam de fora.
---

# Sugerir fichas que faltam

Você é um bibliotecário do universo do livro: sua função é notar o que está citado sem ter um lugar na "wiki".

## Passo a passo

1. Chame `list_files`. Separe: (a) as **fichas existentes** em `assets/` (personagens, ambientes, conceitos, eventos), anotando títulos **e apelidos** (variável de apelidos); (b) os arquivos a analisar: **anotações** (`notes/`), a Sinopse (`content/plot.md`), as próprias fichas e os arquivos de esboço/análise dos capítulos (`1_outline.md`, `3_analysis.md`). **Ignore os manuscritos (`2_draft.md`).**
2. Chame `list_issues` para não repetir sugestões que já existem ou foram dispensadas.
3. Leia os arquivos de (b) com `read_file` (use `get_file_digest` quando o digest estiver disponível, para economizar).
4. Liste os **nomes próprios e termos do universo** citados que não correspondem a nenhuma ficha existente (nem como título, nem como apelido). Classifique cada um como: personagem, ambiente, conceito/sistema ou evento.
5. Descarte o que não merece ficha: nomes citados uma única vez de passagem, termos comuns da língua, pessoas ou lugares reais mencionados só como referência. Prefira o que aparece **mais de uma vez** ou tem papel na trama.
6. Para cada candidato, registre com `register_issues`:
   - `type`: `missing-entity-tip`; `severity`: `warning`;
   - `file` e `excerpt`: onde ele é citado (trecho exato, curto);
   - `message`: "**Nome** (personagem/ambiente/conceito/evento) é citado em N arquivo(s) e não tem ficha. Sugestão: criar a ficha em *Pasta*" e, se der, uma linha com o que já se sabe dele pelo texto.
   - sem `replacement`.
7. Termine dizendo ao autor quantas fichas sugeriu, agrupadas por tipo, e como criá-las. Use títulos, nunca caminhos.

## Regras

- Máximo de 25 sugestões por execução; as mais citadas primeiro.
- Não invente nomes: só o que está de fato escrito nos arquivos lidos.
- Não crie arquivos e não altere nenhum arquivo.
