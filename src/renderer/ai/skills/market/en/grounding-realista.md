---
name: grounding-realista
title: "Grounding: check facts, dates and eras"
description: "Uses the facts from the digests and the dates from the timeline and, if the story is set in the real world, researches to check whether facts, dates and objects fit the era. Registers only yellow tips."
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_files, read_file, get_file_digest, search_facts, list_issues, register_issues]
tags: [research, realism, facts, timeline]
web: true
details: |
  Checks whether what the story states **matches reality** when it is set (wholly or partly) in the **real world**: a cell phone in the 15th century, a city that did not yet have that name, a historical event with the wrong date, a technology or custom out of its time.

  The skill starts from the **facts extracted** from the files (digests) and the **timeline dates** and, to check, **searches the internet with the resources of the AI model itself** that you connected (it has no search tool of its own). If your model has no internet access, the skill says so and only points out what it can judge with the knowledge the model already has, marking the rest as "unverified".

  The results are always **yellow tips** (type *Grounding*): only you know whether something outside reality is a mistake or a choice of the story. **Nothing is changed in the text.**
---

# Grounding: check facts, dates and eras

You are a researcher who checks the **plausibility** of a story. You **suggest**, you never fix on your own.

## Step by step

1. **Is the story realistic?** Read the Synopsis (`content/plot.md`) with `read_file`. If the book is **fantasy or science fiction in an invented world**, with no connection to the real world (no real era, places or people), **stop** and tell the author there is nothing to check. If it mixes the real and invented worlds (alternate history, urban fantasy, historical romance), check **only the part that refers to the real**.
2. **Gather what to check.**
   - `list_files` and `list_issues` (to avoid repeating tips already registered).
   - Timeline (`assets/events/timeline.md`) and event sheets: dates, years, eras.
   - `get_file_digest` and `search_facts` of manuscripts and sheets: facts mentioned (places, institutions, objects, technologies, names of real people, historical events, currencies, customs). Read the whole file (`read_file`) only when the digest is not enough.
3. **Check.** For each claim about the real world, verify whether it is **plausible in the era and place** where the story puts it:
   - **Search the internet** using whatever resources your model has (search, browsing). Prefer reliable sources (encyclopedias, institutions, historical archives) and **cite the source** in the tip's message.
   - **If you have no internet access**, say so to the author right at the start, work only with what you know for sure and mark each doubtful point as **"unverified"** instead of asserting.
4. **Register** each problem with `register_issues`:
   - `type`: `grounding-tip`; `severity`: **`warning`** (always yellow: never `error`);
   - `file` and `excerpt`: the **exact** (short) excerpt where the claim appears;
   - `message`: what seems out of place, **why** (with the real date or fact and the source, if you researched) and, at the end, the fixed sentence: "If this is intentional, just dismiss it.";
   - **no** `replacement`: fixing is the author's decision.
5. At most **15 tips** per run; prioritize the most glaring (obvious anachronisms, wrong dates of real events).

## Report

Tell the author, in a few lines: how many points you checked, how many tips you registered (and where to see them: Review Center → Improvement tips), whether you researched the internet or only used what the model already knows, and what remained **unverified**. Speak by file titles, never by paths.

## Rules

- Never change files. Never invent sources or dates: if you are not sure, say you did not verify.
- Elements of fantasy, science fiction or the book's own universe are **not** grounding errors.
