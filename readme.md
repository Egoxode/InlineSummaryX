# InlineSummary by ego

Personal fork of [Kristyku/InlineSummary](https://github.com/Kristyku/InlineSummary) for SillyTavern.

Оригинал: https://github.com/Kristyku/InlineSummary  
Этот форк: https://github.com/Egoxode/InlineSummary_by_ego  
Версия форка: **1.2.6** (база upstream 1.2.2)

Расширение сжимает выбранный диапазон сообщений в одно саммари прямо в чате. Оригиналы сохраняются внутри саммари и их можно вернуть.

---

## Что изменено относительно оригинала

### Исправления
- Счётчик токенов на сообщении-саммари снова показывается после вставки и reload (`extra.token_count` пишется ещё и в `swipe_info`).
- Оценка токенов в блоке Original Messages читает `ILS_Data` (путь после v1.2), а не старый `extra.ILS_Data`.
- Галочка **Restore legacy summary messages** теперь реально сохраняется.
- Если первый save/reload после вырезания диапазона падает, оригиналы откатываются в чат.
- Тосты отката Connection Profile / API Preset показывают предыдущее имя, а не имя саммари-профиля.
- Поправлены опечатки в диалогах удаления и сброса пресета.

### Новые функции
- `/ils-restore all` (также `*`) — разворачивает **все** саммари в текущем чате, включая вложенные.
- Кнопка в настройках **Restore all originals in this chat** — то же самое, с подтверждением.
- При удалении расширения или Clean extension data автоматически разворачивается **только открытый чат** (хуки `delete` / `clean`). Остальные чаты нужно пройти вручную.

### Упрощение настроек
Убраны поля, которые дублировали основной промпт:
- Summary Prompt Middle
- Summary Prompt End
- Content Start Marker
- Content End Marker

Инструкции пишутся в **Summary Prompt Start**. Маркеры исторического контекста оставлены — они обрамляют другой кусок текста.

### UI
- Кнопка восстановления оригиналов на всю ширину панели настроек.

---

## Установка

SillyTavern → **Extensions** → **Install Extension**:

```
https://github.com/Egoxode/InlineSummary_by_ego
```

Если раньше стоял оригинал KristyKu — удали его, чтобы не было двух копий, затем поставь этот форк. Обновление: кнопка **Update** у этого расширения.

---

## Использование

1. На сообщениях нажми **Start** и **End**.
2. Появятся **Summarise (AI)**, **Summarise (Manual)** и **Clear Selection**.
3. AI-саммари заменяет диапазон одним сообщением. Оригиналы лежат внутри и открываются по шапке **Original Messages**.
4. В шапке: восстановить оригиналы или перегенерировать саммари.

![Message buttons](images/usage1.png)
![Message buttons - start selected](images/usage2.png)
![Message buttons - start and end selected](images/usage3.png)
![Summary message example](images/usage4.png)

Саммари можно редактировать как обычное сообщение. Вложенные саммари поддерживаются: при сжатии саммари в промпт идёт его текст, не спрятанные оригиналы.

---

## Slash-команды

| Команда | Что делает |
| :--- | :--- |
| `/ils-summarise 1 10` | Сжать сообщения 1–10 через AI |
| `/ils-summarise manual=true 1 10` | Вставить ручное саммари-заглушку |
| `/ils-restore 5` | Вернуть оригиналы из 5 последних саммари |
| `/ils-restore all` | Вернуть оригиналы из **всех** саммари в этом чате |

Алиасы: `/ils`, `/ils-sum`, `/ils-undo`, `/ils-back`.

Перед удалением расширения выполни `/ils-restore all` в каждом чате с саммари. Иначе после снятия расширения останутся только тексты саммари, а оригиналы останутся спрятанными в файле чата без UI.

---

## Настройки

| Настройка | Смысл |
| :--- | :--- |
| Setting Presets | Пресеты настроек расширения |
| Summary Prompt Start | Единственный текстовый промпт суммаризатора |
| Historical Context Size | Сколько сообщений *до* диапазона дать как фон. `-1` — сколько влезет, `0` — без фона |
| Historical Context Start / End Marker | Обёртка вокруг этого фона |
| Response Token Limit | Потолок ответа. `0` — как в пресете ST |
| Use specified Connection Profile | Другой профиль API только на время саммари |
| Use specified API Preset | Другой пресет генерации только на время саммари |
| Auto Scroll to summarised message | После генерации прыгать к саммари |
| Enable Regex when summarising messages | Regex ST по сообщениям до запроса |
| Enable Regex on final summary | Regex ST по готовому саммари |
| Enable Multi Message Prompt | Промпт пачкой user/assistant, а не одной простынёй |
| Summary message sender name | Имя автора саммари: User / Character / Custom |
| Restore legacy summary messages | Разово починить чаты, сделанные до v1.2 |
| Restore all originals in this chat | Полностью развернуть текущий чат |

---

## События для других расширений

- `ILS_StartMsgSelected` — `{ msgIndex }`
- `ILS_EndMsgSelected` — `{ msgIndex }`
- `ILS_SelectionCleared` — `{}`
- `ILS_SummaryAdded` — `{ msgIndex, originalMessages, isManual, isRegenerate }`
- `ILS_RestoreOriginalsBegin` — `{ msgIndex }`
- `ILS_RestoreOriginalsEnd` — `{ msgIndex }`

---

## English

Fork of [Kristyku/InlineSummary](https://github.com/Kristyku/InlineSummary). Select a chat range, replace it with one summary message, keep originals inside the summary and restore them later.

**vs upstream 1.2.2:** token count display on summaries, correct Original Messages token cache path, legacy-recovery checkbox actually saves, rollback originals if the first save after splice fails, `/ils-restore all`, uninstall hook flattens the *currently open* chat only, removed Mid/End prompt and Content markers (use the main prompt), full-width restore button.

Install URL: `https://github.com/Egoxode/InlineSummary_by_ego`

Before uninstalling, run `/ils-restore all` in every chat that still has summaries.

---

## License

Same terms as the upstream project. See `license.md`.
Original author: KristyKu.
Fork changes: Egoxode / ego.
