---
name: remover-item-da-historia
title: "Remover um item da história com naturalidade"
description: "Quando uma ficha (personagem, ambiente, conceito ou evento) é excluída, acha onde ela era citada e sugere reescritas para que a história continue natural sem ela."
author: Astra Writer
version: 1.0.0
kind: recurring
triggers: [deleted:character, deleted:place, deleted:element, deleted:event]
tools: [list_issues, list_files, search_book, read_file, get_file_digest, register_issues]
tags: [wiki, reescrita, nativa]
native: true
details: |
  Quando você **exclui** uma ficha de personagem, ambiente, conceito ou evento, os textos que a citavam continuam falando dela. Esta skill usa as **conexões de links** (os links que ficaram quebrados) e uma busca pelo nome para **achar cada lugar** e propor, para cada um, **como reescrever o trecho** para que o item deixe de existir na história **de forma natural**, e não apenas apagar o nome.
  
  Ela só **sugere**: cada proposta vira uma dica na Central de Revisões, com a reescrita pronta para você aplicar ou dispensar. Skill **nativa**.
---

# Remover um item da história com naturalidade

O arquivo excluído é o indicado em "Arquivo:" no começo do pedido. O arquivo **já não existe**: descubra o nome dele pelo título (se informado), pelos digests ou pelo texto dos links quebrados.

## Passo a passo

1. **Achar as citações.**
   - `list_issues` (categoria links): os `broken-link` cujo alvo é o arquivo excluído mostram **onde** o item era citado por link.
   - `search_book` com o nome (e apelidos, se aparecerem nos links ou digests): pega citações **sem link**.
   - Junte tudo por arquivo e trecho.
2. **Entender o papel do item.** Para cada arquivo citado, leia (`read_file` / `get_file_digest`) o parágrafo e o contexto: o item era só mencionado? Tinha falas ou ações? Alguém dependia dele (um personagem que só existe por causa dele, um evento que o envolve)?
3. **Propor a reescrita** para cada citação, escolhendo a estratégia mais natural:
   - *menção solta* → reescrever a frase sem o item, preservando o sentido e o ritmo;
   - *ação ou fala do item* → atribuir a outro personagem existente, ou condensar a cena sem ele;
   - *dependência* (alguém só existe/aconteceu por causa dele) → avisar a consequência e sugerir o ajuste mínimo.
4. **Registrar** cada proposta com `register_issues`: `type` `style-tip`, `severity` `warning`, `file`, `excerpt` (o trecho **exato**, uma frase), `message` (o que está sendo removido e a estratégia escolhida) e `replacement` **só quando a reescrita for de uma frase e você tiver certeza**; senão descreva a sugestão no `message`.
5. Se houver mais de 20 citações, trate as 20 mais importantes e avise.

## Relatório

Quantas citações achou, em quais capítulos/fichas, e quais mudanças têm **consequência de enredo** que o autor precisa decidir. Nunca altere arquivos.

## Regras

- Não apague apenas o nome: o texto resultante deve continuar fluido e coerente.
- Não invente acontecimentos novos para "tapar" o buraco; prefira cortes e redistribuições simples.
