---
name: remover-item-da-historia
title: "Remove an item from the story naturally"
description: "When a sheet (character, place, concept or event) is deleted, finds where it was mentioned and suggests rewrites so the story keeps flowing naturally without it."
author: Astra Writer
version: 1.0.0
kind: recurring
triggers: [deleted:character, deleted:place, deleted:element, deleted:event]
tools: [list_issues, list_files, search_book, read_file, get_file_digest, register_issues]
tags: [wiki, rewriting, native]
native: true
details: |
  When you **delete** a character, place, concept or event sheet, the texts that mentioned it keep talking about it. This skill uses the **link connections** (the links left broken) and a search by name to **find every spot** and propose, for each one, **how to rewrite the excerpt** so the item stops existing in the story **naturally**, instead of just deleting the name.
  
  It only **suggests**: each proposal becomes a tip in the Review Center, with the rewrite ready for you to apply or dismiss. **Native** skill.
---

# Remove an item from the story naturally

The deleted file is the one indicated in "File:" at the start of the request. The file **no longer exists**: find out its name from the title (if given), from the digests or from the text of the broken links.

## Step by step

1. **Find the mentions.**
   - `list_issues` (links category): the `broken-link` issues whose target is the deleted file show **where** the item was mentioned by link.
   - `search_book` with the name (and nicknames, if they appear in the links or digests): catches mentions **without a link**.
   - Group everything by file and excerpt.
2. **Understand the item's role.** For each file mentioned, read (`read_file` / `get_file_digest`) the paragraph and its context: was the item just mentioned? Did it have lines or actions? Did anyone depend on it (a character who only exists because of it, an event that involves it)?
3. **Propose the rewrite** for each mention, choosing the most natural strategy:
   - *loose mention* → rewrite the sentence without the item, preserving the meaning and rhythm;
   - *action or line of the item* → attribute it to another existing character, or condense the scene without it;
   - *dependency* (someone only exists/happened because of it) → warn about the consequence and suggest the minimal adjustment.
4. **Register** each proposal with `register_issues`: `type` `style-tip`, `severity` `warning`, `file`, `excerpt` (the **exact** excerpt, one sentence), `message` (what is being removed and the chosen strategy) and `replacement` **only when the rewrite is a single sentence and you are sure**; otherwise describe the suggestion in the `message`.
5. If there are more than 20 mentions, handle the 20 most important and say so.

## Report

How many mentions you found, in which chapters/sheets, and which changes have a **plot consequence** that the author needs to decide. Never change files.

## Rules

- Do not just delete the name: the resulting text must remain fluid and coherent.
- Do not invent new happenings to "plug" the hole; prefer simple cuts and redistributions.
