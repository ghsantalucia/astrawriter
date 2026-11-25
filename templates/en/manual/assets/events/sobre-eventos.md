---
humanRead: true
humanWrite: true
aiRead: true
aiWrite: true
userDelete: true
advanced: false
title: "About events"
data:
  title:
    placeholder: "Event name"
    required: true
    content: "About events"
  when:
    placeholder: "When it happened (e.g. year 312, winter of year 5, during the war)"
    required: false
    content: ""
  after:
    placeholder: "Happened after (names of other events, comma-separated)"
    type: events
    required: false
    content: ""
  before:
    placeholder: "Happened before (names of other events, comma-separated)"
    type: events
    required: false
    content: ""
  aliases:
    placeholder: "Alternative names (comma-separated)"
    required: false
    content: ""
---

# EVENT SHEET

**Events** holds the facts of the story, one per file: the battle, the coronation, the betrayal. What matters is **when** each one happened.

- The **happened after** and **happened before** fields link this event to others (several, comma-separated). From these links the system builds the [Timeline](/assets/events/timeline.md), without using AI.
- The **Timeline** is the index of this category: it lists the link to every event, in chronological order when the system can work it out (those with no known date go in a separate section). You do not edit it: it updates itself.
- If there is an impossible order (A before B and B before A), the [Review Center](app:central/issues/timeline) warns you.
