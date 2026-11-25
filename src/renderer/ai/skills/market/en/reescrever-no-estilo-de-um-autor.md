---
name: reescrever-no-estilo-de-um-autor
title: "Rewrite in an author's style"
description: "Rewrites a chapter imitating an author's style, from the author's name and writing samples that you provide."
author: Astra Writer
version: 1.0.0
kind: once
triggers: []
tools: [list_files, read_file, replace_in_file]
tags: [style, rewriting, review]
web: true
compact: false
inputs:
  - "Name of the author whose style to imitate"
  - "Paste here samples of this author's writing (2 to 5 excerpts of a few paragraphs)"
  - "Which chapter should be rewritten? (number, e.g. 2)"
details: |
  Rewrites a chapter in the **style of an author** you choose. Before running, it opens a window asking for **the author's name**, **samples of their writing** (the skill studies the rhythm, vocabulary, punctuation and figures of speech) and **which chapter** to rewrite.
  
  The skill **changes the text** (the changes become a draft for your review and appear in the changelog) and preserves the facts, the events and the lines of dialogue. It comes with instruction optimization **turned off**, so as not to distort the samples.
---

# Rewrite in an author's style

The model author's information and the **samples** come in "Information provided by the author". The **samples** are the main source of style; research on the author complements them (do not rely on memory alone).

## Step by step

1. **Research the author.** Use **internet search** (if your provider offers it) to confirm **who the author is** and gather what is known about their **writing style**: period and literary school, typical narrator and verb tense, vocabulary, sentence structure, recurring devices and themes, and what critics highlight. Note the sources. If you have no internet access, tell the author and go on with only the samples and what you know for sure. If you cannot identify the author from the name, **stop and ask** (there may be namesakes).
2. **Study the samples.** Cross what the research brought with the samples (they count for more than any summary). Describe to yourself (without showing): average length of sentences and paragraphs, vocabulary (formal, colloquial, archaic), typical punctuation, verb tense and narrator's person, use of dialogue, figures of speech, humor or emotional tone, what the author **avoids**.
3. Locate and read the indicated chapter (`list_files`, `read_file` of the `2_draft.md` manuscript). If there is doubt about which one it is, ask.
4. **Rewrite passage by passage** with `replace_in_file` (never the whole file at once): apply the author's style keeping **all facts, names, events, the order of events and the meaning of the lines**. Do not copy sentences from the samples; imitate the manner, not the content.
5. Keep the chapter's approximate length.
6. If an edit is denied, explain to the author and stop.

## Report

Say who the author is (confirming the identification), what the research brought (with sources) and describe in a few lines the traits of the style you applied and what you left as it was. Remind them that the changes are a draft awaiting approval.

## Rules

- Do not change other files. Never say you changed something without the tool confirming.
