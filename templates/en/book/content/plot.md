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
    content: ""
  ai_mode:
    placeholder: "AI mode"
    required: true
    type: select # a list of options becomes a select box
    options:
      - { value: assistant, label: "Writing assistant: you write and the AI helps when asked" }
      - { value: coauthor, label: "Co-author: the AI proposes and writes together with you, step by step" }
      - { value: autonomous, label: "Autonomous: the AI writes from a briefing you provide" }
    content: "assistant" # default value
  genres:
    placeholder: "Literary genres"
    required: false
    content: ""
---

# SYNOPSIS

## Summary of the core idea

> Briefly write what you have already thought of for this story.

## Final goal

> ...

## Writing tone

> ...
