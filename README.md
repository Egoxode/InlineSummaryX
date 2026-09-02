# InlineSummaryX

SillyTavern extension. Select a range of chat messages, replace it with one summary, keep the originals attached to that summary, restore them later if you need to.

Fork of [Kristyku/InlineSummary](https://github.com/Kristyku/InlineSummary).

| | |
| :--- | :--- |
| Upstream | https://github.com/Kristyku/InlineSummary |
| This fork | https://github.com/Egoxode/InlineSummaryX |
| Version | **1.3.6** (from upstream 1.2.2) |

---

## Install

1. In SillyTavern open **Extensions → Install Extension**.
2. Paste:

```
https://github.com/Egoxode/InlineSummaryX
```

3. Reload the page.

Remove the original KristyKu copy first if it is already installed. Two copies will fight over the same chat buttons.

The install folder may be named `InlineSummaryX`. Settings still live under the `InlineSummary` key, so old presets and chats keep working.

---

## Usage

### Make a summary

1. On the first message of the range, click **Select Summary Start**.
2. On the last message, click **Select Summary End**.
3. Inside the highlighted range three extra actions appear: **Summarise (AI)**, **Summarise (Manual)**, **Clear Selection**.
4. **Summarise (AI)** immediately replaces the range with a `Generating...` message. The originals are stored on that message. When the model returns, its text is written into the same message.
5. **Summarise (Manual)** inserts an editable placeholder instead of calling the model.

If generation is cancelled or fails, the `Generating...` message stays and the error (or a cancel note) is written into it. Originals are still inside the message — use **Restore Original** to unpack them. Turn on **Restore originals if summary generation is cancelled or fails** if you want the range unpacked automatically instead.

### Work with an existing summary

Every summary has an **Original Messages** header.

- Click the header (not the buttons) to expand or collapse the stored originals. Token counts are estimates, for example: `Original Messages: 8/8 used | ~1540 tokens | Summary: ~212 tokens`. While the summary is still generating, the last number is `…`.
- **Restore Original and Delete Summary** puts the originals back and removes the summary.
- **Re-Summarise (AI)** generates a new summary from the stored originals.

Summaries are normal chat messages: they go into later prompts, they can be edited, and they can be summarised again. A nested summary uses the summary text, not the hidden originals.

---

## Slash commands

| Command | What it does |
| :--- | :--- |
| `/ils 1 10` | Summarise messages 1–10 with AI (inclusive) |
| `/ils manual=true 1 10` | Insert a manual placeholder for 1–10 |
| `/ils-restore 5` | Unpack the 5 newest summaries |
| `/ils-restore all` | Unpack every summary in this chat, including nested ones |

Aliases: `/ils-sum`, `/ils-summarise`, `/ils-undo`, `/ils-back`. `/ils-restore *` is the same as `all`.

---

## Settings

Open **Extensions → InlineSummaryX**.

### Prompt

| Setting | Meaning |
| :--- | :--- |
| Setting Presets | Named presets; new / delete / import / export / reset |
| Summary Prompt Start | The full instruction sent to the model. Put extra rules here |
| Historical Context Size | How many messages *before* the range to include as background. `-1` fills the context window, `0` includes none |
| Historical Context Start / End Marker | Wrappers around that background block |
| Response Token Limit | Max summary length in tokens. `0` uses the current SillyTavern preset |

The prompt is built in this order: start prompt + start marker → historical messages → end marker → messages in the range. Hidden and system messages are skipped. With **Enable Multi Message Prompt** the pieces are sent as separate user/assistant turns with speaker names; otherwise they are joined into one user message.

### Connection

| Setting | Meaning |
| :--- | :--- |
| Use specified Connection Profile | Switch API profile only while summarising |
| Use specified API Preset | Switch generation preset only while summarising |

Unsaved edits to the current profile or preset are discarded when the extension swaps them.

### Behaviour

| Setting | Meaning |
| :--- | :--- |
| Auto Scroll to summarised message | Jump to the summary after generation |
| Restore originals if summary generation is cancelled or fails | Off (default): keep the placeholder and write the error into it. On: unpack the original messages |
| Enable Regex when summarising messages | Run SillyTavern Regex on source messages before the request |
| Enable Regex on final summary | Run SillyTavern Regex on the finished summary |
| Enable Multi Message Prompt | Send the prompt as separate turns instead of one blob |
| Summary message sender name | Author on the summary: User / Character / Custom |
| Restore legacy summary messages | One-time repair for chats created before upstream v1.2 |
| Restore all originals in this chat | Same as `/ils-restore all` |

---

## Uninstall

Summaries are normal chat messages. If you remove the extension without unpacking them, later chats still show the summary text and the originals stay buried in the chat file with no UI to restore them.

Before uninstalling:

1. Open every chat that still has summaries.
2. Run `/ils-restore all`, or click **Restore all originals in this chat**.

If SillyTavern supports extension lifecycle hooks, deleting the extension or using **Clean extension data** unpacks the open chat and then rewrites other character/group chat files on disk that still contain stored originals. If that pass cannot finish before the page reloads, open remaining chats and run `/ils-restore all`.

---

## Notes

- JSON export keeps the stored originals. Plain-text export keeps only the summary text.
- Swipes on a summary keep the stored originals on the message. The Original Messages header stays after a swipe.
- The Document chat style hides older message-action buttons, so Start/End are missing there. Bubbles and Flat work.
- Token counts use SillyTavern's counter and may not match the live model.

---

## Events

Other extensions can listen on SillyTavern's event bus:

| Event | Payload |
| :--- | :--- |
| `ILS_StartMsgSelected` | `{ msgIndex }` |
| `ILS_EndMsgSelected` | `{ msgIndex }` |
| `ILS_SelectionCleared` | `{}` |
| `ILS_SummaryAdded` | `{ msgIndex, originalMessages, isManual, isRegenerate }` |
| `ILS_RestoreOriginalsBegin` | `{ msgIndex }` |
| `ILS_RestoreOriginalsEnd` | `{ msgIndex }` |

---

## What this fork changes

- `/ils-restore all` and a settings button that fully expands the current chat.
- On extension delete / clean data, the open chat is unpacked and other saved chats are rewritten when possible.
- Mid prompt, end prompt, and content start/end markers removed. Instructions live in the main prompt.
- `Generating...` is inserted immediately; the model output (or the error text) is written into that same message.
- Optional restore-on-abort checkbox.
- Original Messages header also shows an estimate of the summary's own tokens.
- Speaker names are included in the summary prompt.
- Settings load from the installed folder URL.
- Fixes from the fork: token display after reload, Original Messages token path after v1.2, legacy-recovery checkbox actually saves, rollback if the first save fails, profile-restore error text.

Full history: `changelog.md`.

---

## License

Same terms as upstream. See `license.md`.

Original author: KristyKu.

Fork changes: Egoxode.
