---
humanRead: true
humanWrite: true
aiRead: true
aiWrite: true
userDelete: false
advanced: false
title: Synopsis

data:
  book_title:
    placeholder: "Book title"
    required: true
    content: "User Manual"
  ai_mode:
    placeholder: "AI mode"
    required: true
    type: select
    options:
      - { value: assistant, label: "Writing assistant: you write and the AI helps when asked" }
      - { value: coauthor, label: "Co-author: the AI proposes and writes together with you, step by step" }
      - { value: autonomous, label: "Autonomous: the AI writes from a briefing you provide" }
    content: "assistant"
  genres:
    placeholder: "Literary genres"
    required: false
    content: "Manual"
---

# SYNOPSIS

## Summary of the core idea

This book is the Astra Writer **User Manual**: each file in it explains what that kind of file is and what it is for. Explore the explorer (the left bar) by opening the files in any order.

> The **Synopsis** is the "soul" of the book. It is the first file the AI reads: this is where you sum up the core idea, the final goal and the writing tone of your story. The better the synopsis, the better the AI (and the Review Center) understand what your book wants to be.

## Final goal

> Here you describe where the story is heading. The AI compares the chapters with this goal to warn you if something is drifting off course.

## Writing tone

> Narrator, verb tense, mood of the story. The AI uses this to write and review in your style.

The fields shown above the text (click **File data**) are the book title, the **AI mode** (assistant, co-author or autonomous; you can also change it in the [Book Center](app:central/book/data)) and the genres. When you are done exploring, create your book with **New book** (in the book selector, at the top of the sidebar) and delete this one if you like.
