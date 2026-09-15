# §A-ISSUE-01 — Подтверждённая внешняя работа маршрутизируется в Issues

```yaml
knowledge_id_changes:
  - action: reuse
    id: §A-ISSUE-01
    reason: Operational decision table оставалась только project-local и была недоступна установленному orchestration skill.
    new_boundary: Canonical ISS-01…ISS-15 contract принадлежит shared reference, механически входит в installable skill, а ADR сохраняет rationale и ownership.
    references_updated: true
  - action: reuse
    id: §A-ISSUE-01
    reason: Финальная публичная проекция раньше применяла redaction только к body и оставляла title вне одной write-границы.
    new_boundary: Перед native write одинаковая closed policy проверяет финальный title и все разрешённые поля body.
    references_updated: true
  - action: reuse
    id: §A-ISSUE-01
    reason: Review отделил разрешение записи от prose, уточнил route context и вынес изменчивые наблюдения из durable решения.
    new_boundary: Write имеет closed yes/no vocabulary, Applies to не выдаётся за disposition class, а version/auth facts остаются run evidence.
    references_updated: true
  - action: reuse
    id: §B-PORTABILITY-06
    reason: Upstream workaround теперь требует verified owner и canonical Issue URL.
    new_boundary: Неоднозначный owner делает route unsupported и запрещает project fallback.
    references_updated: true
```

## Решение

Agent сначала устанавливает `in_scope`, `unconfirmed`, `project_issue`,
`upstream_issue`, `duplicate` или `needs_attention`, затем адресат. Для upstream
допустим только explicit repository пользователя либо verified ownership
metadata инструмента; project remote никогда не fallback. Для project Issue
precedence: explicit repository, tracking remote, `origin`.

Hosting выводится из URL host. Для enterprise/self-hosted host требуется ровно
один успешный authenticated `gh auth status --hostname` или `glab auth status
--hostname`. Перед записью выполняется bounded search открытых и закрытых Issues;
усечённый результат не доказывает отсутствие duplicate. Root cause совпадает
только при той же публичной поверхности, нарушенном invariant и классе симптома.

Write использует native `gh`/`glab`; финальные title и explicit body из private
temporary file проходят одну closed redaction policy перед записью и post-write
lookup. Неопределённый effect не повторяется. Closed fixed
Issue либо связывается с требуемой версией, либо получает новый use case/new
Issue; автоматического reopen нет. Локальный workaround публичного пробела несёт
canonical upstream Issue URL или route объявляется unsupported.

Решение служит §B-LONGEVITY-04, §B-HUMAN-04, §B-PORTABILITY-06 и
§B-PORTABILITY-07. Без §A-ISSUE-01 подтверждённая работа снова теряется в
branch-local notebook, а native Issue writes лишаются проверяемого routing,
dedup, redaction и unknown-effect контракта.

## Переносимый operational-контракт

Canonical decision table ISS-01…ISS-15, native CLI surface и обязательный
disposition record принадлежат переносимому документу
[Маршрутизация подтверждённой внешней работы](../../shared/references/issue-routing.md).
Он механически входит в installable `mo-orchestrate-orca`, поэтому внешняя
write-граница не зависит от доступа к исходному репозиторию Meta-O.

Версионные и credential-наблюдения остаются current run evidence, а повторяемые
диагностические команды принадлежат
[Грабли и команды проекта](../papercut.md), не этому durable решению.
