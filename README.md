# Work Desk: writing studio (prototype)

A simple app for drafting ideas, writing novels, and keeping track of characters, places and plot.
It's plain HTML, CSS and JavaScript, with no install and no internet needed.

## Install it as an app
Follow **INSTALL.md**: put the folder online (free) and click **📲 Install**. You get your own window, an icon, offline use, and it works on phones too.

## How to open it
Double-click `index.html`, or right-click it and choose **Open with → Microsoft Edge**.

## Features
| Where | What it does |
|---|---|
| **Library** (click the Work Desk logo) | All your books in one place. Create, open or delete books, and see total words and your streak. |
| **Write** | A clean page editor with chapters, formatting, scene breaks (⁂) and spell check. Pasted text is cleaned so Word or website formatting doesn't carry over. |
| **Notebook** (left sidebar) | Ideas, People, Places and Plot threads. Character and place sheets show **which chapters mention them**. |
| **Corkboard** | Every chapter as an index card. Edit summaries on the card, drag the ⠿ handle to reorder, and see who appears in each chapter. |
| **Timeline** | Story events in order: when, who, where and which chapter. "Highlight" shows one character's path through the story. |
| **Character map** | Drag people around and connect them (family, friends, love, enemies, rivals, allies, mentor). Click a person to open their sheet. |
| **Snapshots** (right panel) | Save a copy of a chapter before a rewrite, then **compare** (removed words in red, added in green) or **restore** it. |
| **Find** (Ctrl+Shift+F) | Find and replace across every chapter and the notebook. It saves a snapshot of each changed chapter first, so you can undo. |
| **Comments & notes** | Hover over any paragraph and click **+** in the right margin (or 💬 in the toolbar, Ctrl+Alt+M). 💬 *Comments* are feedback and 📝 *notes* are reminders to yourself. Resolve or delete them; all of a chapter's comments are listed in the right panel. **Never exported.** |
| **Sticky notes** | 🗒 in the toolbar puts a sticky note on the page. Drag it by its top bar, 🎨 changes the color, and you can resize it from the corner. 👁 hides or shows them all. **Never exported.** |
| **Book cover** | File → Book cover… Shows in the library and as the first page of HTML / PDF exports. |
| **Import text file** | File → Import book from text file… (or in the Library). Turns a .txt or .md file into a new book, splitting chapters at lines like "Chapter 1", "Capítulo 2", "Prologue" or "# Heading". |
| **👥 Share / collaborate** | Put a book online and invite people as **Editor**, **Commenter** or **Reader**. You write together live, see who's online and which paragraph they're in, and chat beside the page. One-time setup: see **COLLABORATION.md**. |
| **Habits** | Daily word goal, 🔥 streak, a 5-week calendar, and **⏱ Sprint** timers (bottom bar). |
| **Focus** | Hides everything but the page. Press **Esc** to exit. |
| **💾 Back up / ♻ Restore** | Library buttons (also in the File menu). Saves every book on this device in one file, and brings them back on any device. |
| **Settings** | Six theme presets plus **color pickers**, font, text size, page width and daily goal. |
| **File menu** | Save or open book files, and export to .txt, .md, .html or **Print / Save as PDF**. |

## Where your writing is saved
- Everything **autosaves in Edge's storage** as you type.
- ⚠ If you clear Edge's browsing data, that copy is deleted. To keep a real file, use
  **File → Save book file** (Ctrl+S). The app then keeps saving to that file while it's open.
- Books you wrote in the first version of the app are moved into the library automatically.

## Files
- `index.html`: page layout
- `styles.css`: the look (colors, fonts, spacing)
- `js/app.js`: main app (editor, chapters, notebook, saving, settings, export)
- `js/store.js`: saving and loading books
- `js/util.js`: shared helpers and settings like theme presets
- `js/board.js`, `js/timeline.js`, `js/charmap.js`: the three visual views
- `js/snapshots.js`, `js/search.js`, `js/habits.js`, `js/library.js`: the other features
- `js/comments.js`, `js/stickies.js`, `js/cover.js`, `js/importer.js`: comments, sticky notes, cover, text import
- `js/cloud.js`, `js/collab.js`: online collaboration (sync engine, share dialog, chat)
- `supabase/setup.sql`: the one-time database setup for collaboration (see COLLABORATION.md)
- `assets/`: app icons
- `manifest.webmanifest`, `sw.js`, `js/pwa.js`: what makes it an installable, offline app (plus backup/restore and the phone layout)

`app.js` in the main folder is left over from the first version and is no longer used, so you can delete it.
