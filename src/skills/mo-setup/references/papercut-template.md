# Commands and papercuts template

A short everyday document: how things are done in this project and what already
failed. `AGENTS.md` must link it, or nobody finds it in time.

Only the repeating case is written down. A frequent or routine command hung or
failed and the cause is known → one short line: what does it, what it does, what
did not work. A stale line is deleted by the same change that made it wrong: a
wrong line costs more than a missing one. A one-off is not written here, and
neither is friction of the methodology itself — that has its own channel and
would be lost in this document.

Write the document in the project's human language; the skeleton below is the
shape, not the wording.

```markdown
# <заголовок документа>

## Команды

| Команда     | Что делает    | Чего не делать             |
| ----------- | ------------- | -------------------------- |
| `<команда>` | `<одна фраза>` | `<что уже не сработало>`   |

## Грабли

- `<одна короткая строка: что выглядело рабочим и почему им не было>`
```
