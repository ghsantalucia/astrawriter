---
humanRead: true
humanWrite: true
aiRead: true
aiWrite: true
userDelete: true
advanced: false
title: New event

data:
  title:
    placeholder: "Event name"
    required: true
    content: ""
  when:
    placeholder: "When it happened (e.g., year 312, winter of year 5, during the war)"
    required: false
    content: ""
  after:
    placeholder: "Happened after (names of other events, comma-separated)"
    type: events # list of events: suggests the registered ones and accepts new names
    required: false
    content: ""
  before:
    placeholder: "Happened before (names of other events, comma-separated)"
    type: events # list of events: suggests the registered ones and accepts new names
    required: false
    content: ""
  aliases:
    placeholder: "Alternative names (comma-separated)"
    required: false
    content: ""
---

# EVENT SHEET

## What happened

> Describe the event in a few lines: who, where, and what changed in the story.

## Consequences

> What did this event cause or make possible?
