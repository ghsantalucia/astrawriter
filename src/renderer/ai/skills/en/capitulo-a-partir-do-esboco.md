---
name: capitulo-a-partir-do-esboco
title: "Write the chapter from the outline"
description: "Writes a chapter's manuscript from its outline (plan), following the tone of the Synopsis."
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
modes: [coauthor, autonomous]
tools: [list_files, read_file, get_file_digest, search_facts, write_file, replace_in_file]
tags: [chapters, writing, native]
native: true
compact: false
inputs:
  - "Which chapter should be written? (number, e.g. 3)"
details: |
  Takes a chapter's **Outline** (the scene list and the goal) and writes its **Manuscript**, in the tone defined in the Synopsis and consistent with the sheets and the previous chapters.
  
  Asks for the chapter number before running. **Native** skill of the **Co-author** and **Autonomous** modes.
---

# Write the chapter from the outline

## Step by step

1. Read the Synopsis (`content/plot.md`) for the **writing tone**. Then read the **Outline** of the chapter given in "Information provided by the author" (the chapter's `1_outline.md`). If the outline is empty, stop and ask the author to fill it in or describe the scenes.
2. Read the previous chapter's manuscript (if any) and the sheets of the characters and places that appear in the outline, to keep facts and continuity.
3. Write the manuscript with `write_file` in the chapter's `2_draft.md`: turn **each scene of the outline** into text, in the Synopsis voice, with consistent dialogue and pacing. Do not add events that contradict the outline; small liberties of detail are acceptable.
4. If the manuscript already had text, **do not erase it**: ask the author whether to replace or append before saving.

## Report

Summarize what was written (scenes covered) and what was left out of the outline, if anything.
