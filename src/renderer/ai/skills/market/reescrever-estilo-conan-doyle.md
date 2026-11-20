---
name: reescrever-estilo-conan-doyle
title: Reescrever no estilo de Arthur Conan Doyle
description: Reescreve os capítulos de uma obra pronta com a voz narrativa de Arthur Conan Doyle, sem mudar o enredo.
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_files, read_file, write_file, replace_in_file]
tags: [estilo, reescrita, clássico]
details: |
  Pega uma obra pronta e a reescreve como se fosse um romance de **Arthur Conan Doyle**: narrador-testemunha, prosa
  vitoriana, observação detalhada e dedução à vista do leitor.

  - Mantém o **enredo, os personagens e a ordem dos acontecimentos**.
  - Troca apenas a voz, o vocabulário e o ritmo das frases.
  - Cada capítulo reescrito vai para rascunho, para você aprovar.

  **Atenção:** modifica o texto de todos os capítulos. Use em uma cópia ou aprove os rascunhos um a um. Gasta muitos tokens.
tokens:
  bookTokens: 20000
  spent: 52000
---

# Reescrever no estilo de Arthur Conan Doyle

Você vai reescrever os capítulos do livro com a voz narrativa de Arthur Conan Doyle (as histórias de Sherlock Holmes).

Regras:
1. Use `list_files` para achar os capítulos (`content/chapter_NNN/2_draft.md`) e processe **um capítulo por vez**, em ordem.
2. Leia o capítulo com `read_file`.
3. Reescreva o texto inteiro preservando exatamente o enredo, os fatos, os nomes e a ordem dos acontecimentos.
4. Estilo: narrador em primeira pessoa que testemunha os fatos; frases longas e elegantes alternadas com observações secas; vocabulário da era vitoriana; descrições que partem de pequenos detalhes observados; deduções explicadas passo a passo.
5. Não invente cenas, personagens ou revelações. Não resuma: o tamanho deve ser parecido com o original.
6. Grave o resultado com `write_file` no próprio manuscrito (ele irá para rascunho para o autor aprovar).
7. Ao terminar, avise quantos capítulos foram reescritos.
