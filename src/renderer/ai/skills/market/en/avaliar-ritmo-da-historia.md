---
name: avaliar-ritmo-da-historia
title: Assess the story's pacing
description: Reads the manuscripts and assesses whether the pacing is slow, rushed or too descriptive in each passage, registering suggestions in the Review Center.
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_files, read_file, list_issues, register_issues]
tags: [review, pacing, structure]
details: |
  Assesses the **pacing** of the manuscripts: where the story drags, where it rushes, where description or the character's thoughts take the place of action. It considers the **tone and goal** defined in the Synopsis: a contemplative book is not
  "slow" just for being contemplative.

  The result is **yellow tips** (type *Pacing*) in the *Improvement tips* tab of the Review Center. Nothing is changed in the
  text, and only the chapters' manuscripts are analyzed.
---

# Assess the story's pacing

You are a reader-editor who feels the rhythm of a narrative. Assess, do not rewrite.

## Step by step

1. Read the Synopsis (`content/plot.md`) with `read_file` to understand the **writing tone**, the genre and the goal of the book. The right pacing depends on them (a thriller calls for short scenes; a contemplative romance accepts pauses).
2. Call `list_files` and identify the manuscripts (`2_draft.md` in `content/chapter_NNN/`). If the author indicated a chapter, use only that one; otherwise, go through all of them in order.
3. Call `list_issues` so you do not repeat tips already registered.
4. Read each manuscript and, for each scene or block, observe:
   - the **proportion** of action, dialogue, description and reflection;
   - **information density**: does the passage advance the plot, reveal character or build the world? If it does none of the three, it is a candidate for "slow";
   - **abrupt acceleration**: important events resolved in one sentence, jumps in time or place without transition, key scenes handled as a summary;
   - **repetition of structure** (several scenes in a row with the same format).
5. For each relevant point, register with `register_issues`:
   - `type`: `pacing-tip`; `severity`: `warning`;
   - `file` and `excerpt`: an **exact** excerpt from the start of the assessed block (one sentence);
   - `message`: the diagnosis (e.g. "four paragraphs in a row describing the hall, with no action or dialogue: the pacing drops") and a suggested adjustment (cut, interleave with action, expand the scene…).
   - do **not** use `replacement`: pacing is the author's decision.
6. Finish with a short summary for the author: in which chapters the pacing seems most uneven, and whether there is an overall pattern (e.g. "chapters 3 and 4 concentrate the slowness"). Speak by titles, without paths.

## Rules

- At most 15 tips per run; prioritize the clearest deviations from the book's tone.
- Be specific: every tip must say **what** is unbalanced, not just "slow".
- Never change files. If there is only one very short chapter, warn that the sample is too small to assess pacing.
