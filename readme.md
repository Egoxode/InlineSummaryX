# InlineSummary by ego

Personal fork of [Kristyku/InlineSummary](https://github.com/Kristyku/InlineSummary) for SillyTavern.

- Upstream: https://github.com/Kristyku/InlineSummary
- This fork: https://github.com/Egoxode/InlineSummary_by_ego
- Fork version: **1.2.6** (based on upstream 1.2.2)

Select a range of chat messages and replace it with a single summary message. Originals are stored inside the summary and can be restored at any time.

---

## Changes from upstream

### Fixes
- Summary messages show a token count after insert/reload (`extra.token_count` is also written to `swipe_info`).
- Original Messages token estimate reads `ILS_Data` (post-v1.2 path) instead of the old `extra.ILS_Data`.
- **Restore legacy summary messages** checkbox now actually saves.
- If the first save/reload after cutting a range fails, originals are rolled back into the chat.
- Profile/preset restore error toasts show the previous name, not the summary profile name.
- Typos in preset delete/reset confirmation dialogs.

### New
- `/ils-restore all` (also `*`) expands **every** summary in the current chat, including nested ones.
- Settings button **Restore all originals in this chat** does the same, with a confirmation prompt.
- On extension delete or Clean extension data, originals in the **currently open chat** are restored automatically (`delete` / `clean` hooks). Other chats are not touched.

### Simplified settings
Removed fields that belonged in the main prompt:
- Summary Prompt Middle
- Summary Prompt End
- Content Start Marker
- Content End Marker

Put instructions in **Summary Prompt Start**. Historical context markers stay — they wrap a different section of the prompt.

### UI
- Restore-all button spans the full width of the settings panel.

---

## Install

SillyTavern → **Extensions** → **Install Extension**:

```
https://github.com/Egoxode/InlineSummary_by_ego
```

If you already have the KristyKu original installed, remove it first so you do not end up with two copies. To update this fork later, use **Update** on this extension.

---

## Usage

1. Mark **Start** and **End** on messages.
2. **Summarise (AI)**, **Summarise (Manual)**, and **Clear Selection** appear.
3. An AI summary replaces the range with one message. Originals stay inside and open from the **Original Messages** header.
4. From that header you can restore originals or regenerate the summary.

Summaries are normal editable messages. Nested summaries are supported: when a summary is summarised again, the prompt uses the summary text, not the hidden originals.

---

## Slash commands

| Command | Effect |
| :--- | :--- |
| `/ils-summarise 1 10` | Summarise messages 1–10 with AI |
| `/ils-summarise manual=true 1 10` | Insert a manual summary placeholder |
| `/ils-restore 5` | Restore originals from the 5 latest summaries |
| `/ils-restore all` | Restore originals from **all** summaries in this chat |

Aliases: `/ils`, `/ils-sum`, `/ils-undo`, `/ils-back`.

Before uninstalling, run `/ils-restore all` in every chat that still has summaries. Otherwise those chats keep only the summary text, and the originals stay buried in the chat file with no UI to restore them.

---

## Settings

| Setting | Meaning |
| :--- | :--- |
| Setting Presets | Saved setting presets for the extension |
| Summary Prompt Start | The only free-text summariser prompt |
| Historical Context Size | How many messages *before* the range to include as background. `-1` fills the context window, `0` includes none |
| Historical Context Start / End Marker | Wrappers around that background |
| Response Token Limit | Max summary length in tokens. `0` uses the current ST preset |
| Use specified Connection Profile | Switch API profile only while summarising |
| Use specified API Preset | Switch generation preset only while summarising |
| Auto Scroll to summarised message | Jump to the summary after generation |
| Enable Regex when summarising messages | Run ST Regex on messages before the request |
| Enable Regex on final summary | Run ST Regex on the finished summary |
| Enable Multi Message Prompt | Send the prompt as user/assistant turns instead of one blob |
| Summary message sender name | Summary author name: User / Character / Custom |
| Restore legacy summary messages | One-time repair for chats created before v1.2 |
| Restore all originals in this chat | Fully expand the current chat |

---

## Events

Other extensions can listen on SillyTavern's event bus:

- `ILS_StartMsgSelected` — `{ msgIndex }`
- `ILS_EndMsgSelected` — `{ msgIndex }`
- `ILS_SelectionCleared` — `{}`
- `ILS_SummaryAdded` — `{ msgIndex, originalMessages, isManual, isRegenerate }`
- `ILS_RestoreOriginalsBegin` — `{ msgIndex }`
- `ILS_RestoreOriginalsEnd` — `{ msgIndex }`

---

## License

Same terms as upstream. See `license.md`.
Original author: KristyKu.
Fork changes: Egoxode / ego.
