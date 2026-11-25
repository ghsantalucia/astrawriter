---
name: rascunho-de-capitulo-pela-sinopse
title: "Draft of the next chapter (from the Synopsis)"
description: "Uses the Synopsis and the previous chapters to plan and write the draft of the next chapter."
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
modes: [autonomous]
tools: [list_files, read_file, get_file_digest, search_facts, start_creation, complete_creation, write_file]
tags: [chapters, writing, native]
native: true
compact: false
details: |
  For **Autonomous** mode: reads the **Synopsis** (goal, tone, structure) and the **previous chapters**, plans the next chapter and writes the full draft, in the tone of the book.
  
  **Native** skill; in Assistant and Co-author it is available on demand. The result goes through the changelog (it can be undone).
---

# Draft of the next chapter (from the Synopsis)

## Step by step

1. Read the Synopsis (`content/plot.md`): premise, **writing tone**, final goal and structure. If the tone is empty, stop and ask the author to describe it.
2. Call `list_files`. Identify the existing chapters (`content/chapter_NNN/`) and read, in order, the **manuscripts** already written (use `get_file_digest` and `search_facts` to save tokens when digests exist). Also read the relevant sheets (characters and places mentioned).
3. Decide the **next chapter**: what the story needs now, according to the Synopsis structure and the hooks left by the last chapter. Write a short plan (goal, scenes, active characters).
4. Create the chapter with `start_creation` (kind `chapter`) and `complete_creation` (title + the planning as brainstorm).
5. Write the draft in the new chapter's manuscript with `write_file` (`2_draft.md`), **in the tone and voice** of the Synopsis and the previous chapters, respecting facts from sheets and digests (ages, family ties, world rules, timeline). Keep the length similar to the previous chapters.
6. Do not change existing chapters or the Synopsis.

## Report

Tell the author the title of the created chapter, what happens in it and which plot decisions you made (so they can disagree).
