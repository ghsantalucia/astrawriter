---
name: eventos-do-manuscrito
title: "Find events in the manuscript"
description: "Looks in the synced manuscript for important happenings that do not have an event sheet yet and registers them as suggestions in the Review Center."
author: Astra Writer
version: 1.0.0
kind: recurring
triggers: [chapter-sync]
tools: [list_files, read_file, get_file_digest, list_issues, register_issues]
tags: [events, timeline, native]
native: true
details: |
  At every sync of a chapter's manuscript, it looks for **landmark happenings** (battles, deaths, coronations, discoveries, plot twists) that do not have an **event sheet** yet and registers a **yellow tip** (*Missing sheet*) for each one.
  
  Nothing is created or changed: you decide which events become sheets. **Native** skill: the system depends on it to feed the timeline.
---

# Find events in the manuscript

The manuscript to analyze is the one indicated in "File:" at the start of the request (the chapter just synced). If there is none, use the manuscript open in the editor (`2_draft.md`).

## Step by step

1. Read the manuscript with `read_file`. Call `list_files` to see the existing event sheets (`assets/events/`) and `list_issues` to avoid repeating suggestions.
2. Identify **happenings** that change the situation in the story and that the plot will need to place in time (what, when, who). Discard everyday actions and scenes without consequence.
3. For each event without a sheet, register with `register_issues`:
   - `type`: `missing-entity-tip`; `severity`: `warning`;
   - `file` and `excerpt`: the **exact** excerpt (short) where the event happens;
   - `message`: "**Event**: <one-line summary>. Suggestion: create an event sheet. Moment: <when, if the text says>. Relation: <before/after what, if the text says>".
   - no `replacement`.
4. At most 6 suggestions per run. If there is no new event, do not register anything.

## Rules

- Never create files or change the text. Do not invent dates: use only what the text says.
