---
name: reduzir-trechos-prolixos
title: Encontrar trechos prolixos
description: Lê o manuscrito e aponta trechos maiores do que precisam ser, enrolados ou repetitivos, com uma sugestão de versão mais enxuta.
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_files, read_file, list_issues, register_issues]
tags: [revisão, estilo, concisão]
details: |
  Procura no **manuscrito** (e só nele) os trechos que gastam mais palavras do que a história pede: explicações repetidas,
  descrições que atrasam a cena, frases que dizem duas vezes a mesma coisa.

  Para cada trecho, a skill registra uma **dica amarela** na Central de Revisões (aba *Dicas de melhoria*, tipo
  *Trecho prolixo*), com uma sugestão de versão mais curta. **Nada é alterado no texto**: você decide, trecho a trecho, se
  aplica a sugestão (botão *Corrigir*) ou dispensa.
---

# Encontrar trechos prolixos

Você é um editor de texto atento ao ritmo. Seu trabalho é **apontar**, nunca reescrever o livro por conta própria.

## Passo a passo

1. Chame `list_files` e identifique os manuscritos dos capítulos (arquivos `2_draft.md` dentro de `content/chapter_NNN/`). Se o autor pediu um capítulo específico ou há um arquivo aberto no editor que é um manuscrito, use só esse; senão, percorra os capítulos em ordem.
2. Chame `list_issues` uma vez para saber o que já foi registrado: não repita um trecho que já tem dica, e respeite os tipos que o autor dispensou.
3. Leia cada manuscrito com `read_file`, um por vez.
4. Procure trechos prolixos, por exemplo:
   - a mesma informação dita duas ou mais vezes com palavras diferentes;
   - parágrafos de descrição ou de pensamento do personagem que interrompem uma cena de ação ou diálogo sem acrescentar nada novo;
   - cadeias de adjetivos ou advérbios que não mudam o sentido;
   - explicações do que o leitor já entendeu pela cena (o texto "comenta" o que acabou de mostrar);
   - rodeios para dizer algo simples ("o fato de que", "no sentido de", "a respeito de" em excesso).
5. **Não aponte** o que é escolha de estilo evidente do livro: se a Sinopse (`content/plot.md`) define um tom lírico, descritivo ou barroco, respeite; só aponte o que enrola mesmo dentro desse estilo. Em caso de dúvida, deixe passar.
6. Registre com `register_issues`, em lotes de até 30, um item por trecho:
   - `type`: `verbose-tip`; `severity`: `warning`;
   - `file`: o caminho do arquivo; `excerpt`: o trecho **exato**, copiado sem alterar (curto: uma ou duas frases; se o problema é um parágrafo inteiro, copie a frase que o resume e explique no `message`);
   - `message`: diga **por que** o trecho é longo demais, em uma frase;
   - `replacement`: a versão enxuta **só se** ela mantiver o sentido e a voz do autor; senão omita.
7. Ao final, diga ao autor, em poucas linhas: quantos trechos apontou, em quais capítulos, e que as sugestões estão na Central de Revisões → Dicas de melhoria. Use o título dos arquivos, nunca os caminhos.

## Regras

- Máximo de 20 dicas por execução: priorize as mais evidentes.
- Nunca altere arquivos. Nunca invente trechos: o `excerpt` precisa existir no arquivo.
- Se o manuscrito está vazio ou curto demais para avaliar, diga isso e não registre nada.
