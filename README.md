# InlineSummary_by_ego

A SillyTavern extension that replaces a selected range of chat messages with one inline summary. The original messages stay attached to that summary and can be restored at any time.

This repository is a fork of [Kristyku/InlineSummary](https://github.com/Kristyku/InlineSummary).

- Upstream: https://github.com/Kristyku/InlineSummary
- Fork: https://github.com/Egohox/InlineSummary_by_ego
- Version: **1.3.1** (based on upstream 1.2.2)

---

## What it does

1. You mark a **Start** and an **End** message.
2. You generate an **AI summary** or insert a **manual** placeholder.
3. The selected range is replaced by a single chat message.
4. The originals are stored on that message (`ILS_Data.OriginalMessages`), not deleted.
5. You can expand the **Original Messages** header, restore the range, or regenerate the summary.

The summary behaves like a normal chat message: it is sent to the model on later turns, it can be edited, and it can itself be summarised (nested summaries use the summary text, not the hidden originals).

---

## Install

In SillyTavern: **Extensions → Install Extension**, then paste:

```
https://github.com/Egohox/InlineSummary_by_ego
```

Reload the page after install.

If the original KristyKu extension is already installed, remove it first so you do not run two copies.

The install folder may be named `InlineSummary_by_ego` or `InlineSummary`. Settings and defaults are loaded from the extension folder URL, so either name works.

---

## Usage

### New summary

1. Open the message actions on the first message of the range and click **Select Summary Start**.
2. Open the last message of the range and click **Select Summary End**.
3. **Summarise (AI)**, **Summarise (Manual)**, and **Clear Selection** appear on messages inside the range.
4. **Summarise (AI)** replaces the range with a `Generating...` message right away (originals are stored on it), then writes the model output into that same message. **Summarise (Manual)** inserts an editable placeholder instead.

### Existing summary

The summary message has an **Original Messages** header.

- Click the header (not the buttons) to expand or collapse the stored originals.
- **Restore Original and Delete Summary** puts the originals back and removes the summary.
- **Re-Summarise (AI)** generates a new summary from the stored originals.

---

## Slash commands

| Command | Effect |
| :--- | :--- |
| `/ils-summarise 1 10` | Summarise messages 1–10 with AI (inclusive) |
| `/ils-summarise manual=true 1 10` | Insert a manual summary placeholder for 1–10 |
| `/ils-restore 5` | Restore originals from the 5 newest summaries |
| `/ils-restore all` | Restore originals from **every** summary in the current chat, including nested ones |

Aliases: `/ils`, `/ils-sum`, `/ils-undo`, `/ils-back`. `/ils-restore *` is the same as `/ils-restore all`.

Experimental (asks for confirmation; `confirm=false` skips it):

- `/ils-linear 10` — walk the chat forward and summarise in chunks of 10
- `/ils-stack 10` — repeatedly summarise from the start in chunks of 10

---

## Uninstall / disable

Summaries are normal chat messages. If you delete the extension without restoring, later chats still show the summary text, and the originals stay inside the chat file with no UI to unpack them.

**Before you uninstall:**

1. Open every chat that still has summaries.
2. Run `/ils-restore all`, or use **Restore all originals in this chat** in the extension settings.

**Automatic cleanup:** if your SillyTavern build supports extension lifecycle hooks, deleting the extension or using **Clean extension data** restores originals in the **currently open chat** and saves it. Other chats are not opened and are not changed. Always run `/ils-restore all` in those chats first.

---

## Settings

| Setting | Meaning |
| :--- | :--- |
| Setting Presets | Named presets with import / export / reset |
| Summary Prompt Start | The full summariser instruction. Put extra instructions here; mid/end prompts and content markers were removed |
| Historical Context Size | How many messages *before* the range to add as background. `-1` fills the context window, `0` adds none |
| Historical Context Start / End Marker | Wrappers around that background block |
| Response Token Limit | Max summary length in tokens. `0` uses the current SillyTavern preset |
| Use specified Connection Profile | Switch connection profile only while summarising |
| Use specified API Preset | Switch generation preset only while summarising |
| Auto Scroll to summarised message | Jump to the summary after generation |
| Enable Regex when summarising messages | Run SillyTavern Regex on source messages before the request |
| Enable Regex on final summary | Run SillyTavern Regex on the finished summary |
| Enable Multi Message Prompt | Send the prompt as user/assistant turns instead of one blob |
| Summary message sender name | Author name on the summary: User / Character / Custom |
| Restore legacy summary messages | One-time repair for chats created before upstream v1.2 |
| Restore all originals in this chat | Fully expand the current chat (same as `/ils-restore all`) |

Changing connection profile or API preset discards unsaved edits to those ST presets.

---

## How the prompt is built

1. **Summary Prompt Start** plus the historical-context start marker.
2. Earlier chat messages (the historical context), trimmed to fit the context window.
3. The historical-context end marker.
4. The messages in the selected range (hidden/system messages are skipped).

If **Enable Multi Message Prompt** is off, those pieces are joined into one user message. If it is on, they are sent as separate turns with speaker names.

---

## Events

Other extensions can subscribe on SillyTavern's event bus:

| Event | Payload |
| :--- | :--- |
| `ILS_StartMsgSelected` | `{ msgIndex }` |
| `ILS_EndMsgSelected` | `{ msgIndex }` |
| `ILS_SelectionCleared` | `{}` |
| `ILS_SummaryAdded` | `{ msgIndex, originalMessages, isManual, isRegenerate }` |
| `ILS_RestoreOriginalsBegin` | `{ msgIndex }` |
| `ILS_RestoreOriginalsEnd` | `{ msgIndex }` |

---

## Notes

- JSON chat export keeps the stored originals. Plain-text export keeps only the summary text.
- Swipes on a summary are treated as ordinary message swipes. They do not clone the stored originals.
- The Document chat style hides older message-action buttons, so Start/End are missing there. Bubbles and Flat work.
- Token counts use SillyTavern's counter and may not match the live model exactly.

---

## Fork changes (from upstream 1.2.2)

- `/ils-restore all` and a settings button that fully expands the current chat.
- `delete` / `clean` hooks restore the open chat before the extension is removed.
- Mid prompt, end prompt, and content start/end markers removed. Instructions live in the main prompt.
- Cancel during generation restores the originals from the in-chat `Generating...` placeholder.
- Speaker names are included in the summary prompt.
- Settings load from the installed folder URL (`InlineSummary_by_ego` installs work).
- Fixes: token display after reload, Original Messages token path after v1.2, legacy-recovery checkbox, rollback if the first save fails, profile-restore error text.

See `changelog.md` for the full history.

---

## License

Same terms as upstream. See `license.md`.

Original author: KristyKu.

Fork changes: ego.
