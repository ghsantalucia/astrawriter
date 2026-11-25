---
name: conexoes-do-livro
title: "Connect the book (wiki)"
description: "Makes sure the wiki matches the content: creates missing sheets and links manuscripts and sheets to each other."
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_files, read_file, get_file_digest, list_issues, start_creation, complete_creation, replace_in_file, auto_link_file]
tags: [wiki, links, native]
native: true
details: |
  Goes through the book and brings the **wiki** up to date with the text: creates the sheets for characters, places, concepts and events that are mentioned but do not exist, and **links** manuscripts and sheets to each other.
  
  Combines what the "Create sheets…" skills do, but across the whole book. **Native** skill; use it when the book already has a lot of text or after importing a book.
---

# Connect the book (wiki)

## Step by step

1. `list_files` to map manuscripts, sheets (`assets/characters`, `places`, `elements`, `events`) and notes. Note the titles and nicknames of the sheets.
2. For each chapter (in order), read the manuscript. If the map marks "(unchanged since the last run)", **skip** the chapter.
3. List what is mentioned and has no sheet (characters, places, concepts/systems and important events). Discard the irrelevant (passing mentions, common terms).
4. Create the missing sheets with `start_creation` + `complete_creation` (only with facts the text establishes; never invent). Maximum of 10 per run.
5. Link the mentions to the sheets: use `auto_link_file` on the manuscripts that mention sheets (it creates the links for known names and nicknames). For what auto-link does not catch, use `replace_in_file` on the chapter's **first mention**.
6. Check with `list_issues` whether any broken links remain and report.

## Report

Sheets created (by title), files that received links, chapters skipped because they were unchanged, and what is still pending (10-sheet limit, permissions).

## Rules

- Never change the text beyond links. Respect permissions; if a tool denies, explain and continue with the rest.
