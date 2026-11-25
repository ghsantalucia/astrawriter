---
name: criar-fichas-de-personagens
title: "Create sheets for mentioned characters"
description: "Finds characters mentioned in the manuscript that do not have a sheet yet, creates a sheet for each and links the text to the sheet."
author: Astra Writer
version: 1.0.0
kind: recurring
triggers: [chapter-sync]
modes: [coauthor, autonomous]
tools: [list_files, read_file, get_file_digest, start_creation, complete_creation, replace_in_file, list_issues]
tags: [wiki, sheets, native]
native: true
details: |
  After you sync a chapter's manuscript, the skill looks for mentioned characters that **have no sheet**, creates a sheet for each (only with what the text already says) and puts a **link** from the first mention to the sheet.
  
  It is a **native** skill: in the **Co-author** and **Autonomous** modes it runs on its own at every chapter sync; in **Assistant** mode you or the AI run it on demand.
---

# Create sheets for mentioned characters

The manuscript to analyze is the one indicated in "File:" at the start of the request (the chapter just synced). If there is none, use the manuscript open in the editor (`2_draft.md`).

## Step by step

1. Read the manuscript with `read_file`. Call `list_files` and note the sheets that **already exist** in `assets/characters` (title and nicknames). Do not create a duplicate sheet: also check for name variations (nicknames, diminutives, names with titles).
2. List the characters mentioned in the chapter that **have no sheet**. A character is any **named** person or creature that acts or speaks. Ignore unnamed extras and real people mentioned only as a reference.
3. For each one (at most 8 per run), create the sheet:
   - call `start_creation` (kind `entity`, folder `assets/characters`) and then `complete_creation` with **only what the text establishes**: name, nicknames mentioned, age if stated, role in the story, appearance and personality only if described. Fields without information stay blank: **never invent facts**.
   - if the tool says the value "does not appear in the conversation", use exactly the name as it is in the manuscript.
4. Link the text to the sheet: with `list_files` find the path of the newly created sheet and use `replace_in_file` to turn **the first mention** in the chapter into a Markdown link `[Name](/assets/characters/file.md)`. Replace a short, exact excerpt (the name itself, with the surrounding sentence if needed to make it unique).
5. If any tool refuses (folder permission, pending drafts), stop, **do not insist** and explain to the author what was missing.

## Report

Tell the author: which sheets you created (by title), which mentions you linked and what you left out for not deserving a sheet. Never show file paths.

## Rules

- Only create a sheet for what has a role in the story or appears more than once; discard passing mentions and common terms.
- Do not change anything beyond the links. Never delete the author's text.
