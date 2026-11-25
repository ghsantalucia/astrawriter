# User Guide — Astra Writer

This guide teaches, step by step, how to use Astra Writer to write and organize a book. It was written for people who **use** the
app (authors), not for those who develop it. For the technical side, see [`project.md`](project.md) and
[`ai-tools.md`](ai/ai-tools.md).

> **How to read it:** if you are a beginner, follow chapters 1 to 4 in order. The others are for reference: come back to them when you need them.

## Contents

1. [Getting started](#1-getting-started)
2. [Getting to know the screen](#2-getting-to-know-the-screen)
3. [How the book is organized](#3-how-the-book-is-organized)
4. [Writing: drafts and syncing](#4-writing-drafts-and-syncing)
5. [A file's data and tags](#5-a-files-data-and-tags)
6. [Links between files](#6-links-between-files)
7. [Search](#7-search)
8. [Spelling and grammar checking](#8-spelling-and-grammar-checking)
9. [Folders, moving and deleting](#9-folders-moving-and-deleting)
10. [History and changelog](#10-history-and-changelog)
11. [The AI assistant](#11-the-ai-assistant)
12. [Permissions: who can change what](#12-permissions-who-can-change-what)
13. [Questions and common problems](#13-questions-and-common-problems)
14. [Glossary](#14-glossary)

---

## 1. Getting started

### Open the app

When you open it, a splash screen ("Per Aspera Ad Astra") appears with the app version at the bottom. Then the main screen
loads, already on the last book you worked on.

### Create your first book

1. In the upper left corner, click the **book name** (the book list).
2. Choose **"Create new book"**.
3. Answer the questions in the window (title and other information) and confirm.

Astra Writer creates a folder for the book with the default structure (chapter 1, characters, places, notes...), opens the book and shows the **Synopsis** in the editor.

> **Your data stays on your computer.** The book is a folder of Markdown files (`.md`). There is no database and no online account:
> you can copy, version or back up the folder like any other.

### Choose the theme

Click the **gear** (Settings) next to the book name and use **Night mode** to switch between the light theme (purple) and the
dark theme (blue).

### Chat background

In **Settings → Appearance → Chat background** (collapsed by default; click to open) you choose the assistant's background, separately for the dark and light themes:
**Stars**, **Nebula**, **Orbits** (animated planets, moons and asteroids) or **Solid color**. With *Stars*, *Orbits* and *Solid color* a
picker appears so you can choose the **background color**.

---

## 2. Getting to know the screen

| Area | Where it is | What it is for |
| --- | --- | --- |
| **Book list and gear** | Top of the sidebar | Switch books, create a book, open Settings |
| **Explorer** | Sidebar | File tree, with the **Notes**, **Writing** and **World** tabs, the search and the mini toolbar |
| **Writing Assistant** | Bottom of the sidebar | Chat with the AI (opens and collapses with the ▲ arrow) |
| **File tab** | Toolbar, above the editor | Name of the open file, with the data pen and the draft `*` |
| **Toolbar buttons** | Upper right corner | **Auto-link**, **History**, **Export** and **Sync** |
| **Editor** | Center | Where you write |
| **"File data" box** | Between the toolbar and the text | The file's variables and tags |
| **Editor footer** | Bottom of the editor | Words, reading time, connections, warnings and save status |

**Tip:** almost every button has a tooltip: hold the mouse over it for a moment. Hover over the file name on the tab to see the **real path of the file on disk** (for example
`book_001/assets/characters/character_001.md`). This helps when the displayed name is different from the file name.

### Navigate the explorer with the keyboard

Click anywhere in the explorer and use the keyboard:

| Key | What it does |
| --- | --- |
| **↑ / ↓** | Moves the highlight between the files and folders of the current tab (it only highlights, it does not open). The starting point is the file selected in the tab, or the first item. |
| **→ / ←** | Goes through the **options** of the highlighted item (create, rename, edit, delete...). |
| **Enter** | On a folder: opens/closes it. On a file: opens it in the editor. With an option chosen: triggers that option. |
| **↓ on the last item** | Selects the **Writing Assistant**; **Enter** opens the drawer and puts the cursor in the message field. |
| **Esc** | Clears the highlight. In the chat, **Esc** closes the drawer and gives the arrow keys back to the explorer. |

### Explorer mini toolbar

Right below the search:

- **Eye** — shows or hides the *advanced files* (indexes and technical files).
- **Padlock** (Notes tab) — locks or unlocks AI writing on **all** notes at once (files and folders inherit the rule).
- **Folder tree** — opens all the folders in the tab; if they are all already open, it closes them all.
- **New chapter** (Writing tab), **New folder** and **New note** (Notes tab).

---

## 3. How the book is organized

The explorer has three tabs, which match the three main folders of the book:

| Tab | Folder | What it holds |
| --- | --- | --- |
| **Writing** | `content/` | Chapters, synopsis (`plot.md`) and the chapter index |
| **World** | `assets/` | Characters, places, concepts/systems and the timeline |
| **Notes** | `notes/` | Free-form notes and any folders you create |

### Chapters

Each chapter is a folder `content/chapter_001/`, `chapter_002/`... with **three files**:

- **Manuscript** (`2_draft.md`) — the text of the chapter itself.
- **Outline** (`1_outline.md`) — the chapter plan, written before you get your hands dirty (it works as a prompt for the AI to generate the chapter).
- **Analysis** (`3_analysis.md`) — generated after writing, with AI suggestions: analysis, planning for the next chapters and hints (foreshadowing).

In the explorer each chapter appears as **a single item** (open book icon); clicking it opens the manuscript. Above the editor there are three tabs — **Manuscript**, **Outline** and **Analysis**: the one for the open file shows its name and the others shrink to just the icon; clicking one opens that file.
Old books are migrated automatically (the backlog becomes the Analysis; nothing you wrote is lost and everything stays in the changelog).

To create one, use **New chapter** in the Writing tab. When you delete a chapter, the following ones are **renumbered** automatically so there
are no gaps.

### World sheets

Characters, places and concepts are *sheets*: files with **data** (variables, such as name, nicknames and age) and text sections.
To create one, hover over the category folder (for example **Characters**) and click the **+** ("New item in..."). The window
asks for the data and the sections, and the sheet is created.

### Automatic indexes

Each category has an index file (visible with the eye turned on, for example "Characters index"). **You don't need to
edit it:** when a sheet is created, its link goes into the index; when it is deleted, the link comes out. The same goes for chapters.

---

## 4. Writing: drafts and syncing

This is the most important concept in Astra Writer.

### Two states for each file

- **Official file** (`name.md`) — the version that "counts".
- **Draft** (`name.md.temp`) — what you typed and haven't synced yet.

While you type, the text is **saved automatically as a draft**. A file with a draft shows a **`*`** next to its name, in the
explorer and on the file tab.

### Sync

Click **Sync** (upper right corner) to turn drafts into official versions. Syncing:

1. writes the official text;
2. records the version in the history (see [chapter 10](#10-history-and-changelog));
3. removes the `*`.

When the AI is about to edit something, the app **requires everything to be
synced** first (so your draft is never mixed with the AI's).

### Editor toolbar

Headings, bold, italic, strikethrough, line, quote, lists (bulleted, numbered and task lists), indent, table, image, link,
**find and replace** (`Ctrl+F`) and the switch between **formatted text** and **raw Markdown**.

### Export the file

The **Export** button (top bar, next to History) saves the open file outside the app. Choose the format:

| Format | What it is for |
| --- | --- |
| **Markdown** (`.md`) | The text as it is in the editor, to use in other writing programs. |
| **Word** (`.docx`) | To send to editors and reviewers or to keep working in Word. |
| **PDF** | To read, print or share with the formatting ready (A4 page). |

After you choose, the app asks **where to save**. The exported text includes what you just typed, even without syncing.
Links between the book's files become plain text (they only work inside the app); web links stay links.

### Export the book

In **Book Center → Export** (open it with the pen next to the book in the selector, or from the menu) choose:

- **What to export:** the book as a **single file** (chapters in order, each on a new page), the **chapters separately** (one file per chapter, in a zip) or the **complete project** (a zip with all the files, useful as a safety copy).
- **The format** (for the first two): Markdown, Word or PDF. The complete project keeps the files as they are.

The manuscript of each chapter is included (with what you typed, even without syncing); outline and analysis are not. The project zip leaves out the app's internal data (`.system`) and unsynced drafts.

### Read-only files

A padlock in the explorer means the file **cannot be edited by you** (for example, indexes). The permission is set in the
file itself; see [chapter 12](#12-permissions-who-can-change-what).

---

## 5. A file's data and tags

### "File data" box

It sits between the toolbar and the text. Click **"File data"** (or the **pen** on the file tab) to open or close it.
It contains:

- the file's **tags**;
- the sheet's **variables** (name, nicknames, age, role in the story...). The sheet's name is also edited here: when you change it, the
  file title, the title line of the text, the explorer and the tab are updated.

Click **Save data** to save. The changes go to the file's **draft**, like any other edit.

> You can also open a file's data **without opening the file**, using the **pencil** icon that appears when you hover over it
> in the explorer.

### Tags

Tags are labels to group files from any category (for example `magic`, `villain`, `arc-1`).

**How to add one:**

1. Open the data box and click the **Tags** field.
2. Type the word and use **comma** or **Enter**: it becomes a colored tag.
3. To remove it, click the tag's **×** (or use **Backspace** with the field empty).

**Suggestions:** as you type, the tags that already exist in other files of the book appear. Move with **↑ ↓** and choose with **Enter**,
or click.

**Rules:**

- The **#** is just decoration: it appears before each tag, but you don't need to type it (if you do, it is removed).
- Everything becomes **lowercase**. Letters (including accented ones), numbers and the symbols `- _ / .` are accepted.
- Spaces inside a tag become a hyphen: `high fantasy` → `high-fantasy`. Spaces around commas are ignored.
- Each tag's **color** is chosen automatically from its text: the same tag **always has the same color** (there are 40 colors,
  with versions for the light and dark themes).

The file's tags also appear in the header of the box, before "File data · N fields". **Click a tag** in the header to
search for it: the `#tag` is placed in the explorer's search field (clicking outside the tags opens or closes the box). More about search in
[chapter 7](#7-search).

---

## 6. Links between files

Links connect your sheets and chapters to each other (like a wiki).

- **Insert a link:** **link** button in the editor toolbar. Look up the book's file by name or enter a web address.
- **Auto-link:** the **Auto-link** button (top bar) automatically turns mentions of the **names and nicknames of
  sheets** found in the text into links. It is useful after writing a whole chapter. Links created by auto-link appear in **pink**
  until you sync, when they turn blue. Code and text that are already links are ignored; headings are linked normally.
- **Nicknames:** fill in the sheet's nicknames variable (separated by commas) so that auto-link also recognizes those names.
- **Remove a link:** right-click it and choose **Remove link**.
- **Broken link:** if the target file is deleted, the link turns **gray**.

### Footer warnings

The editor footer shows warnings when there are problems, for example **"2 invalid internal links"**. **Click the warning** to move the cursor
to the first problem; click again to go to the next one, in order (at the end, it goes back to the first).

---

## 7. Search

The search field sits above the file tree and looks through the **titles, texts and variables** of the whole book. The results
show the passage found, with the term highlighted, and each tab shows a number with the count of results.

### Forgiving search

You don't need to type exactly as it is written. The search ignores **uppercase, accents, punctuation** (commas, hyphens,
dashes) and little words such as **articles, conjunctions and prepositions** (*the, a, and, of, in, for...*):

| You type | It finds |
| --- | --- |
| `mongrel dog` | "mongrel-dog" |
| `grimoire eldoria` | "Grimoire of Eldoria" |
| `grand magnificent` | "the grand and magnificent" |

### Several terms at once

Separate terms with a **comma** to search for several at once: `kingdom, magic` shows the files that have **kingdom** or **magic**. It works
for text and for tags, even mixed (`concept, #villain`). A trailing comma is ignored.

**The order in which results appear:**

1. whatever matches **more terms** comes first (a file that has all 3 terms comes before one that has only 1);
2. if tied, the **order of the terms** you typed counts (what matches the first term comes before what matches only the second);
3. if still tied, **alphabetical order**.

Since the explorer is a tree, this applies inside each folder, and folders with the best results move up.

### Searching by tags

Start with **#**: `#magic` shows the files that have a tag with that name (part of the name is enough). The tag found appears in place of
the text passage. With several (`#magic #villain`), the file needs to have **all** of them.

When trying a `#` with several terms, remember: a **space** joins tags in the same term (all must exist) and a **comma** separates terms (any one will do).

If nothing is found, the message **"No results for the search"** appears right below the bar.

---

## 8. Spelling and grammar checking

- **Red wavy underline** on words the dictionary doesn't know and **orange** on words repeated in a row ("the the").
- **Right-click** an underline to open the menu:
  - correction **suggestions** (click to swap the word);
  - **Ignore** — stops marking that word until you close the app;
  - **Add to dictionary** — the word is always accepted from now on (applies to all your books);
  - for repetitions: **Remove the repetition** or **Keep as is**.
- **The book's dictionary:** the **names and nicknames of all the sheets** in the book (characters, places, concepts...) are already part of
  that book's dictionary. That's why a character's name is never marked as an error and you don't need to add it. Text that is already
  a link, code and addresses are not checked either.
- **Footer:** shows **"N writing issues"**. Click the warning to go to the next problem, in text order.
- **Settings → Language and checking:** the **"Spelling and grammar checking"** switch turns everything on or off (underline, menu and
  counter) and **Checking language** changes the dictionary (Brazilian Portuguese, English, Spanish, French).

> The grammar part is a simple check (repeated words). For a deeper style and grammar review, ask the
> AI assistant.

---

## 9. Folders, moving and deleting

### Create files directly in a folder

Hover over a folder you created: in **Notes** it shows **New note in...**; inside **Characters**, **Places**
and **Concepts** it shows the **+** ("New item in..."). The process is the same as for the category, but the file is born already inside the folder, with no
need to move it.

### Folders

In **Notes** and inside each **World** category you can create your own folders (**New folder** button, or the folder icon
when you hover over a folder). Folders you create have their own icon and can be **renamed** and **deleted**
(deleting a folder erases everything inside it, and the app asks for confirmation).

### Move

**Drag** files and folders to another folder **in the same category** (a character can only go to another characters folder). Internal links
that pointed to the file are fixed automatically.

### Delete

Hover over the file and click the **trash can**. A window asks for confirmation. The deleted content stays in the
[changelog](#10-history-and-changelog) (it records the full text). Some items are never deleted individually: chapter
files (delete the whole chapter), indexes and templates.

---

## 10. History and changelog

Astra Writer records **everything** that happens in the book: who did it (you, the AI or the system itself), what and when.

### A file's history

With the file open, click **History**. The list shows the previous versions. Choose one to see the **side-by-side comparison**
with the current version (what was removed in red, what was added in green) and click **Restore this version** to go back to
it. Restoring doesn't erase the record of the later versions, but they can no longer be restored.

### Book changelog

**Book Center → Changelog** shows all the actions in the book and the disk space that the history (with the content kept for
rollback) takes up. The **AI error log**, with connection failures or usage limits from providers, is in **AI Center → Error log**.

---

## 11. The AI assistant

The **Writing Assistant** sits at the bottom of the sidebar. Click the ▲ arrow to open the chat. While the AI is working, the send button turns into a **stop** button (red square): it interrupts the response immediately. Hover over a message to see the time it was sent.

**No AI connected?** The app comes with the **Astra Assistant**, a built-in assistant that is always there (it can't be removed). It is **not a real AI**: in the first message of each session it introduces itself with a quote from a writer and offers to connect a real AI (**AI Center → Accounts and model**) or to show what it can do; after that it answers commands such as `/ajuda`, `/listar`, `/ler`, `/anexar`, which already let you work on the book, in a more laborious way. The Windows window title shows the open book ("Book Name - Astra Writer").

### Set up (once)

1. Open **Settings → Artificial intelligence → Provider and model**.
2. Choose the **provider** (Claude or Gemini) and the **model**.
3. Paste the provider's **API key** and save.

> **The key is yours** (a *Bring-Your-Key* model): it is saved only on your computer and is never shown to the AI. There is also a **Mock** provider,
> used only for testing, which doesn't call any real AI.

### What the AI can do

Talking in natural language, you can ask the AI, for example, to:

- read and summarize files, review the tone, check consistency between chapters and sheets;
- write or rewrite passages and add text to a file;
- create chapters, characters, places and notes;
- create, move and delete folders and files (if you allow it);
- change sheet variables and tags, and turn on auto-link in a file;
- look up the history and the changelog, and restore an old version (**always asking for your confirmation**);
- tell you which AI models are set up (without ever revealing the key).

The full technical list is in [`ai-tools.md`](ai/ai-tools.md).

### How the AI works on your files (safely)

1. **You control access.** The AI only reads what is marked as readable and only changes what is marked as editable
   ([chapter 12](#12-permissions-who-can-change-what)). By default, it **doesn't delete anything**.
2. **Before editing**, the app requires all your drafts to be synced.
3. **While the AI works**, the project is **locked** for you (a notice appears in the editor), avoiding simultaneous edits.
4. **Every AI edit becomes a draft.** When it finishes, the **review screen** opens with the side-by-side comparison: you choose to **keep the
   new version** or **discard** it and keep the old one. Changes only to data and tags also appear there ("Age: 31 → 33").
5. Everything is recorded in the changelog, with the author **AI**.

### Tips for asking well

- Be specific: "Rewrite the opening of chapter 2 with a darker tone" works better than "improve the chapter".
- Ask for one thing at a time when changing many files, so you can review calmly.
- If the AI says it can't, it's because the file's permission doesn't allow it — adjust the permission if you want.

---

## 12. Permissions: who can change what

Permissions live at the top of each `.md` file (the so-called *frontmatter*, between `---` lines) and, for folders, in the
`folder.yml` file. You can edit them in any text editor.

```yaml
---
title: "Reino de Eldoria"
humanRead: true      # você pode ler
humanWrite: true     # você pode editar
aiRead: true         # a IA pode ler
aiWrite: true        # a IA pode editar (sempre via rascunho)
aiDelete: false      # a IA pode excluir (ausente = não)
tags: [reino, magia] # tags do arquivo
---
```

| Field | What it controls |
| --- | --- |
| `humanRead` / `humanWrite` | Whether **you** can read / edit. `humanWrite: false` makes the file read-only (padlock). |
| `aiRead` / `aiWrite` | Whether the **AI** can read / edit. |
| `userDelete` | `false` prevents **you** from deleting; absent follows `humanWrite`. |
| `aiDelete` | `true` lets the **AI** delete. Absent: it doesn't delete. |
| `tags` | The file's list of tags (use the data box instead of editing by hand). |

In folders (`folder.yml`), `userDelete` and `userRename` mark folders **created by you** (the only ones that can be renamed,
moved or deleted). See the details in the permissions chapter of [`ai-tools.md`](ai/ai-tools.md#permissões).

---

## 13. Questions and common problems

**I typed something and the file shows `*`. Did I lose anything?**
No. The `*` means there is a **draft** saved automatically. Click **Sync** to make it official.

**The Sync button is disabled.**
There are no pending drafts (or the project is locked while the AI works).

**The editor is locked and I can't type.**
Either the AI is working (wait for the review) or the file is read-only (padlock in the explorer). See
[chapter 12](#12-permissions-who-can-change-what).

**The AI said it has no access to a file.**
The file has `aiRead: false` (or `aiWrite: false` for editing). Adjust the permission in the frontmatter if you want to allow it.

**Search doesn't find a file I just edited.**
Search also reads drafts. Check whether the term is in the title, the text or the variables, or use `#tag` for tags.

**I deleted something by accident.**
Open the **Book changelog**: the full text of deleted files is kept and can be recovered.

**The spell checker marks a word that exists.**
Right-click it and choose **Add to dictionary** (or **Ignore**). Names and nicknames of the book's sheets are already accepted
automatically; if the name is still underlined, check that it is in the sheet's title or nicknames.

**How do I back up?**
Copy the book folder (inside `books/`). Everything — text, permissions, history — is in it.

---

## 14. Glossary

| Term | Meaning |
| --- | --- |
| **Book** | A folder with all the files of a project. |
| **Sheet** | A World file (character, place, concept) with data and sections. |
| **Variable / data** | A field of a sheet (name, age, nicknames...). |
| **Tag** | A colored label to group files; searchable with `#`. |
| **Draft** (`.md.temp`) | Changes not yet synced; shown by the `*`. |
| **Sync** | Turn drafts into official versions. |
| **Frontmatter** | Block between `---` at the top of the file with title, permissions and data. |
| **Auto-link** | Automatic creation of links to sheets mentioned in the text. |
| **Changelog** | Record of everything done in the book, with author and date. |
| **Tool** | An action the AI can run on the book, always respecting permissions. |


## Centers

The **centers** are large windows with tabs on the left. Open them with the button in the editor footer (Review) or from the **Settings > Centers** drawer. **Esc** or the **X** closes them. **Esc** closes, one at a time, the topmost open layer (settings, window, center or chat drawer); windows that require a decision (no X) don't close with Esc.

### Review Center

The button in the footer shows **All good** (green) or the number of **issues** (yellow: only suggestions and possible errors; red: there are confirmed errors). Inside it:

- **Summary:** numbers, the most serious errors, the **AI analysis**, the request for the **AI to fix things on its own** (not recommended; the AI can make mistakes), the **dismissed types** (they can be re-enabled) and the **book dictionary**.
- **Links, Spelling and grammar, Timeline, Contradictions and Improvement tips:** each issue is a card with the type tag, the file and line, the passage, the recommended solution and the actions **Go to passage** (opens the file with the cursor at the exact spot), **Fix** (goes to the draft; sync to save), **Dismiss**, **Add to dictionary** (typos) and **Dismiss all of this type**.
- When you hover over a file in the explorer, issue marks appear (red: errors; yellow: suggestions).

### Events and timeline

In **World > Events** each fact is a file with **when it happened**, **after** and **before**. The "after" and "before" fields work like tags: several events separated by commas, with a list that searches the events already registered and accepts new names. A mentioned event that doesn't have a sheet yet becomes a name suggestion when you create the next event.

The system (without using AI) links the events, **updates the timeline file on its own** in the order described, puts events with no moment and no link to others in a "No known date" section, and warns about circular order or contradictory dates (while there is a contradiction, the file is not changed). **Nobody edits the official timeline by hand.** It is also the **events index**: it lists the link to every registered event (there is no separate "Events index"), in chronological order when the system can deduce it.

### New files and syncing

New characters, places, notes, events and chapters are born as a **draft** and go into the sync list. When you sync, they become official and the app offers the **AI analysis** (with a token estimate), which creates a metadata summary of each updated file and checks for contradictions.

### Switching centers and editor toolbar shortcuts

Click the **center's name** (at the top of the window) to open the list and go straight to another center. In the editor toolbar, the button with the spell checker icon opens the **Spelling** tab of the Review Center.

### Citations and "Fix all"

- **Cited in X files:** in the "File data" header, in front of the number of fields, **cited in X files** appears when other files link to it. Click to see each citation (the file title and the paragraph where the link is) and click a citation to go straight to that spot in the text.
- **Fix all with AI:** in the Review Center there is a button in each tab and in the overview. The AI evaluates each issue and chooses the solution: it applies the safe fix, resolves contradictions using the sheets and the Synopsis, and leaves to you what depends on a decision. The changes become a draft and stay in the changelog.
- **AI reply notice:** with the chat closed, a dot appears in the assistant's header and a soft sound plays when the AI replies (turn it off in System Center → General).

### Import and export books

- **Import:** in the book selector, **Import book (.zip)** creates a new book from a zip exported by the app (the zip is validated, and the book gets a new name if the title already exists).
- **Import from a file:** in the book selector, **Import from a file (Word, PDF, text)** reads a `.docx`, `.odt`, `.pdf`, `.txt` or `.md`, splits the chapters by their headings and shows what it found: you fix the book title, rename, merge with the previous one or remove what was wrongly identified, and then follow the book creation wizard as usual.
- **Export:** Book Center → **Export**: the book as a single file, the chapters separately or the complete project (zip), in Markdown, Word or PDF.

### AI autonomous mode

With the book in **autonomous** mode, the AI writes the files it produces directly (without the review window; everything is still in the changelog and can be undone). Each changed file gets a **blue dot** in the explorer (and, for chapters, on the Manuscript, Outline and Analysis tabs). The dot disappears 3 seconds after you open the file.

### System Center

The **System Center** (Settings → Centers, or **Ctrl+Shift+Y**) gathers the app's settings, not the book's:

- **General and Update:** installed version and whether it is the latest, automatic update, space used (books, history, app data) and **uninstall** (with the option to export the books first; the books stay in Documents/Astra Writer and remain there).
- **Appearance:** light/dark, ready-made color themes (**Neptune**, **Earth**, **Saturn**, **Venus** in pastel tones and **Pulsar**, pink and blue synthwave) and **create your own** (color by color, for light and dark mode), and the **chat background** (stars, nebula, orbits or solid color), each with its own colors.
- **Accessibility:** app font size, **night mode** (yellowish filter on a schedule) and **narrator** (button with the speaker icon in the editor toolbar, with **pause** and **stop** during reading; hover for the tooltip).
- **Editor:** letter size and font for the text and headings, with a **live preview** highlighted at the top.
- **Productivity:** the **timer** comes **turned off**; turn it on in **Show the timer** and it appears between the tabs and the explorer search, with play/pause, **Auto** mode (stops when the window loses focus or you are idle for 2 minutes) and **reset** (stops the clock and waits for you to press play again). With a **time goal** (e.g. 60 min), the clock **counts down**: when it reaches zero a soft sound plays and the strip turns green with "goal reached"; Auto mode keeps pausing when you step away. Here are the daily line chart and the records, grouped by day (with average and an arrow to expand), which can be deleted.
- **Shortcuts:** all the app's shortcuts. You can change the main ones (click **Change** and press the new combination). Arrows, Esc, Tab, Enter, Space and the system's editing keys are reserved. Explorer keyboard navigation (↑ ↓ → ← Enter Esc) is fixed.
- **Templates:** see below.
- **Backup:** backup folder (it can be the one from an installed cloud service), automatic backup when opening the app and how many copies to keep per book (default: 2). The default folder is Documents/Astra Writer/backups.

When you open the app, a **startup routine** checks whether there is a new version and whether the automatic backup is overdue, without blocking anything; a window only appears when there is a decision to make (update ready to install).

### Templates

Every new file is born from a template (character, place, concept and event sheets; chapter outline and analysis). There are three **template profiles**: **Assistant** (questions that spark writing), **Co-author** (information the AI can use, such as dialogue samples) and **Autonomous** (clear instructions for the AI). Only the **body** changes between profiles; the fields (variables) are always the same. When you create a book the profile is chosen by the AI mode, but you can change it; later, in the Book Center (**Book data** tab, under **Template profile**, where the **Edit templates** button takes you straight to System Center → Templates). In **System Center → Templates** you edit each template in a window with the editor, **duplicate** a profile to create your own and **restore** the original (editing never changes the app's files).

### Skills

**Skills** are packages of instructions that the AI runs using tools, shared across all books. In **AI Center → Skills** there is the library (**My skills**) and the **Store** (a catalog that comes with the app). Each skill has its own page (author, version, description, full text, triggers, allowed tools, token estimate and run history).

- **One-time:** runs when you say so (**Run now**), always with a confirmation window that shows what it can do and the **token estimate**.
- **Recurring:** runs by itself on the chosen **triggers** (when syncing, when opening the book or a file, when creating/updating/deleting chapters, characters, places, concepts, events and notes, etc.).
- **Permission:** each skill has "ask permission before activating" (on by default) and there is the general option "all skills ask permission" (checked automatically in the Minimal and Economy profiles).
- **Chapter trigger and savings:** there is the trigger **"When syncing a chapter's manuscript"** (outline and analysis don't fire it). Skills with a file trigger only run again when the file has changed (or the Synopsis/the skill changed). Each skill has the option **"Optimize instructions when running"**: turn it off for skills with writing samples.
- **Native skills:** some come already installed (create sheets, events, fix issues, remove an item from the story...): they have the **native** badge, **cannot be removed** (the system depends on them) but can be edited, with a warning (the original can be restored).
- **Questions before running:** a skill can ask for information (e.g. an author's name and writing samples); a window shows a field for each question.
- **Internet search:** each skill has the option **"Allow internet search"** (the provider's native search; currently Claude and Gemini). When on, the AI searches during the skill (for example, who the author is and their style, or whether a fact fits the period). It uses more tokens.
- **Create with AI:** ask the AI to create a skill; it asks a few questions and opens the form already filled in for you to review and create.
- **Search and colors:** there is a search bar in the library and in the store. Each skill has a **color** (suggested from its name, and you can change it) that appears on the card, along with the **active/inactive** state. On the skill's page, the allowed tools appear in a grid with checkboxes and a filter.
- **Edit:** changing the text of an app or store skill creates a copy marked as "edited" (the original can be restored). Triggers and allowed tools can be adjusted without creating a copy.

### The AI and the app

The AI knows the app and can open screens, change the theme or font, consult the guide and run skills. Actions that could get in the way ask for your **permission** in a window; sensitive actions (AI mode, file permissions, accounts and keys, deleting a book, uninstalling) the AI **does not do**: it guides you and opens the screen for you.

### Book Center and AI Center

- **Book:** name, AI mode (assistant, co-author or autonomous), overview (total files and disk space, without the changelog and the chat), changelog (with the space it takes up) and book deletion. It also opens from the **pen** that appears next to each book in the book selector.
- **AI:** several accounts with a nickname and key, automatic fallback, usage per model, **usage profile** (Minimal, Economy, Balanced, Full, Ultra or Custom, with an option you can turn on per step; among them, **Optimize instructions**, which sends the AI the app's instructions, the tool descriptions and the skills in a leaner form and asks for short answers, and which is already on in the Minimal and Economy profiles), debugging (the last 10 turns with the full text sent, tools and tokens; the pin fixes a turn in the book), error log and skills (library shared between books). It also opens from the **AI Center** button below the chat text field. In **Settings** there is only the account/model selector and the everyday shortcuts.
- **Providers:** Claude, Gemini, ChatGPT (OpenAI), Groq, Puter, **Ollama** (local models, no key) and any **OpenAI API-compatible server** (LM Studio, llama.cpp, vLLM...). Models without tool support work in **simulated mode**: the app teaches the format in the prompt, reads tool requests in the reply and runs the same loop. In automatic mode it tries the native one and, if the model refuses, simulates.
