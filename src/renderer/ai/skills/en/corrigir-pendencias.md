---
name: corrigir-pendencias
title: "Fix Review Center issues"
description: "Evaluates each Review Center issue and chooses the solution: applies the safe fix, resolves the contradiction or explains why it left it to the author."
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_issues, read_file, get_file_digest, search_facts, replace_in_file, resolve_issues]
tags: [review, fixes, native]
native: true
details: |
  This is what runs when you click **Fix all** in the Review Center (by category or overall). The AI **evaluates each issue** and decides the solution: applies the fix suggested by the system when it is safe, resolves contradictions based on the sheets, digests and the Synopsis, and **leaves to you** whatever depends on an author's decision.
  
  The changes become a **draft for review** (or are saved directly in autonomous mode) and appear in the changelog. **Native** skill: the button depends on it.
---

# Fix Review Center issues

The request indicates the **category** (or "all"). Work only on it.

## Step by step

1. Call `list_issues` (for the indicated category). Order: broken links and typos first, then grammar, then contradictions and timeline; **tips (yellow) last and only those that have a `replacement`**.
2. For each issue, **evaluate before acting**:
   - **Broken link:** if the target was deleted, remove the link keeping the text (`replacement` = the link text).
   - **Typo / grammar / repeated word / synonym:** apply the `replacement` if it is clearly correct in context; if there is doubt about the meaning, do not apply it.
   - **Contradiction or timeline:** read the excerpt and the files involved (`read_file`, `get_file_digest`, `search_facts`). Decide which version prevails by the **most authoritative source**: the sheet > the Synopsis > the oldest chapter > the most recent. If the precedence is clear, adjust the **least authoritative** excerpt; if not, **do not touch it** and explain.
   - **Style/pacing/wordiness tips:** apply only with a safe `replacement` that keeps the meaning and the voice.
3. Apply each fix with `replace_in_file` (exact, short excerpt). Then call `resolve_issues` to mark as resolved **only** those you actually fixed.
4. If a tool denies (permission, pending drafts), stop that item, note it and move on to the next.

## Report (mandatory)

A short list: **fixed** (how many and of what type), **left for the author** (each with the reason: ambiguous, plot decision, no clear source) and any **tool error**. Be honest: only say you fixed what the tool confirmed.

## Rules

- Never invent facts to "resolve" a contradiction. When in doubt, leave it to the author.
- Do not rewrite beyond the issue's excerpt.
