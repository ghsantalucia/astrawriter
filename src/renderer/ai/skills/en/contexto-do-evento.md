---
name: contexto-do-evento
title: "Place the event in time and check contradictions"
description: "Gathers the context of all mentions of the event and its variables, finds out when it happened, flags date contradictions and fills in whatever is missing in the sheet."
author: Astra Writer
version: 1.0.0
kind: recurring
triggers: [created:event]
tools: [list_files, search_book, read_file, get_file_digest, search_facts, get_file_variables, set_file_variables, register_issues]
tags: [events, timeline, native]
native: true
details: |
  After the **event is linked to the text**, this skill gathers the **paragraph of each mention** of the event (and the variables you filled in) to understand **when** it happened and **how it relates** to the other events.
  
  - If it finds a **sign of contradiction** in dates, it reads the **whole file** where the doubt is to be sure; if it is sure, it registers an **error** in the Review Center.
  - If everything is consistent and it works out the moment (absolute or relative to another event), it **fills in the variables** of the event that are still empty (it never overwrites what you wrote).
  
  **Native** skill, chained after *Link the created event to the text*.
---

# Place the event in time and check contradictions

The event is the one indicated in "File:" at the start of the request.

## Step by step

1. Read the sheet (`get_file_variables`): `when`, `after`, `before`. Note what the author already filled in: **it is never overwritten**.
2. Gather the mentions: `search_book` by the title and nicknames. For each file, read **only the paragraph** of the mention (and neighbors, if needed). Use `get_file_digest` and `search_facts` for dates and events already extracted.
3. Build the mental timeline: when the event happened (absolute date, "in the winter of year 5", "after the war"…) and its relation to other events (before/after what).
4. **Contradictions.** Look for signs: two mentions with incompatible moments; an impossible order with other events (A after B in one text and before in another); ages or dates that do not add up. **At the slightest sign, read the whole file** (`read_file`) where the possible contradiction is before concluding.
   - If, after reading the file, you are **sure**: register with `register_issues` (`type` `timeline-conflict` or `fact-conflict`, `severity` `error`, exact `excerpt` of each side in `file`/`related`, `message` explaining both sides).
   - If you are **not** sure: register as `possible-conflict` (`warning`) or do not register.
5. **Fill in the sheet.** If there is no contradiction and you found the moment (`when`) or the relation (`after`/`before`, using the title of other existing events), save with `set_file_variables` **only the empty fields**. If there is doubt between two readings, do not fill in.

## Report

What you found out about when the event happened, what you filled in, and the contradictions registered (certain and possible).

## Rules

- Never overwrite variables filled in by the author. Never invent dates.
