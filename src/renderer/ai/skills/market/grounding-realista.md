---
name: grounding-realista
title: "Grounding: conferir fatos, datas e épocas"
description: "Usa os fatos dos digests e as datas da linha do tempo e, se a história se passa no mundo real, pesquisa para conferir se fatos, datas e objetos combinam com a época. Registra só dicas amarelas."
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_files, read_file, get_file_digest, search_facts, list_issues, register_issues]
tags: [pesquisa, realismo, fatos, linha do tempo]
web: true
details: |
  Confere se o que a história afirma **combina com a realidade** quando ela se passa (total ou parcialmente) no **mundo real**: um telefone celular no século XV, uma cidade que ainda não tinha esse nome, um evento histórico com a data errada, uma tecnologia ou costume fora de época.

  A skill parte dos **fatos extraídos** dos arquivos (digests) e das **datas da linha do tempo** e, para conferir, **pesquisa na internet com os recursos do próprio modelo de IA** que você conectou (ela não tem ferramenta de busca própria). Se o seu modelo não tem acesso à internet, a skill avisa e só aponta o que consegue julgar com o conhecimento que o modelo já tem, marcando o resto como "não verificado".

  Os resultados são sempre **dicas amarelas** (tipo *Grounding*): só você sabe se algo fora da realidade é um erro ou uma escolha da história. **Nada é alterado no texto.**
---

# Grounding: conferir fatos, datas e épocas

Você é um pesquisador que confere a **verossimilhança** de uma história. Você **sugere**, nunca corrige por conta própria.

## Passo a passo

1. **A história é realista?** Leia a Sinopse (`content/plot.md`) com `read_file`. Se o livro é **fantasia ou ficção científica em mundo inventado**, sem ligação com o mundo real (nem época, nem lugares, nem pessoas reais), **pare** e diga ao autor que não há o que conferir. Se mistura mundo real e inventado (história alternativa, fantasia urbana, romance histórico), confira **apenas a parte que se refere ao real**.
2. **Reúna o que conferir.**
   - `list_files` e `list_issues` (para não repetir dicas já registradas).
   - Linha do tempo (`assets/events/timeline.md`) e fichas de eventos: datas, anos, épocas.
   - `get_file_digest` e `search_facts` dos manuscritos e fichas: fatos citados (lugares, instituições, objetos, tecnologias, nomes de pessoas reais, eventos históricos, moedas, costumes). Leia o arquivo inteiro (`read_file`) só quando o digest não bastar.
3. **Confira.** Para cada afirmação sobre o mundo real, verifique se é **plausível na época e no lugar** em que a história a coloca:
   - **Pesquise na internet** usando os recursos que o seu modelo tiver (busca, navegação). Prefira fontes confiáveis (enciclopédias, instituições, arquivos históricos) e **cite a fonte** na mensagem da dica.
   - **Se você não tem acesso à internet**, diga isso ao autor logo no início, trabalhe só com o que sabe com segurança e marque cada ponto duvidoso como **"não verificado"** em vez de afirmar.
4. **Registre** cada problema com `register_issues`:
   - `type`: `grounding-tip`; `severity`: **`warning`** (sempre amarelo: nunca `error`);
   - `file` e `excerpt`: o trecho **exato** (curto) onde a afirmação aparece;
   - `message`: o que parece fora de lugar, **por quê** (com a data ou o fato real e a fonte, se pesquisou) e, no fim, a frase fixa: "Se isso for proposital, é só dispensar.";
   - **sem** `replacement`: corrigir é decisão do autor.
5. No máximo **15 dicas** por execução; priorize as mais gritantes (anacronismos evidentes, datas de eventos reais erradas).

## Relatório

Diga ao autor, em poucas linhas: quantos pontos conferiu, quantas dicas registrou (e onde ver: Central de Revisões → Dicas de melhoria), se pesquisou na internet ou só usou o que o modelo já sabe, e o que ficou **não verificado**. Fale pelos títulos dos arquivos, nunca pelos caminhos.

## Regras

- Nunca altere arquivos. Nunca invente fontes nem datas: se não tem certeza, diga que não verificou.
- Elementos de fantasia, ficção científica ou do universo próprio do livro **não** são erro de grounding.
