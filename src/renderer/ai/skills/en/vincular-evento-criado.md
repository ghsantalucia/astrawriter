---
name: vincular-evento-criado
title: "Link the created event to the text"
description: "When an event is created, looks for references to it in the manuscripts and sheets and links them to the event sheet."
author: Astra Writer
version: 1.0.0
kind: recurring
triggers: [created:event]
tools: [list_files, search_book, read_file, get_file_variables, replace_in_file]
tags: [events, links, native]
native: true
details: |
  When an **event sheet is created**, it looks in the book (manuscripts and sheets) for the passages that talk about that happening and puts a **link** to the sheet at the first mention in each file. This is the first stage; the *Event context* skill uses these links. **Native** skill.
---

# Link the created event to the text

The created event is the one indicated in "File:" at the start of the request.

## Step by step

1. Read the event sheet (`read_file` and `get_file_variables`): title, nicknames and summary of what happened.
2. Look for references with `search_book` using the title, the nicknames and characteristic terms of the happening (names involved + the fact).
3. For each file found, read the paragraph (`read_file`) and confirm that it is about **the same happening** (not a similar one). When in doubt, do not link.
4. In each confirmed file, turn **the first mention** into a link with `replace_in_file`: `[excerpt](/assets/events/<file>.md)`, replacing only a short, exact excerpt. Do not link the event's own file to itself.
5. Maximum of 15 files per run.

## Report

In which files you linked (by title) and which mentions you left without a link because of doubt.
