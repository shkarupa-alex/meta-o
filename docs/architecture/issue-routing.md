# §A-ISSUE-01 — Подтверждённая внешняя работа маршрутизируется в Issues

```yaml
knowledge_id_changes:
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

## Canonical decision table

`Applies to` — route context с closed vocabulary `upstream_issue`,
`project_issue`, `unconfirmed`, `either`, `mixed`; это не итоговый
`disposition_class`. `Write` — отдельное closed `yes|no` разрешение текущего
автономного действия и никогда не выводится из prose остальных cells.

| Scenario | Applies to     | Write | Preconditions                                         | Required action                                      | Forbidden action                       | Evidence                         |
| -------- | -------------- | ----- | ----------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- | -------------------------------- |
| ISS-01   | upstream_issue | yes   | External root cause; verified upstream                | Search all; comment matching cause or create         | Use project remote as fallback         | Ownership, query, result, URL    |
| ISS-02   | upstream_issue | no    | Ownership unreadable or ambiguous                     | `needs_attention`; no write                          | Guess from tool/package name           | Sources and ambiguity            |
| ISS-03   | upstream_issue | no    | Only project remotes available                        | `needs_attention`; no write                          | Use `origin` or tracking ref           | Remotes and missing owner        |
| ISS-04   | project_issue  | yes   | Project cause; no explicit repository                 | Tracking ref, then `origin`; search/comment/create   | Choose unrelated repository            | Precedence, host, result, URL    |
| ISS-05   | unconfirmed    | no    | Root-cause owner unknown                              | Reproduce until class is established                 | Any external write                     | Reproduction or attention        |
| ISS-06   | either         | yes   | Open match has same surface, invariant and symptom    | Add one sanitized confirmed use case                 | Duplicate or title-only match          | Three-part match and URL         |
| ISS-07A  | either         | yes   | Closed fixed in installed version; still reproducible | Create new Issue linked to closed one                | Pretend fix is not installed           | Versions, reproduction, URLs     |
| ISS-07B  | either         | no    | Closed fixed only in newer version                    | Reference required version; no write                 | Create duplicate                       | Installed/fixed versions, URL    |
| ISS-07C  | either         | yes   | Closed wontfix/stale; symptom alive                   | Add sanitized use case                               | Automatic reopen                       | Closure reason and result        |
| ISS-08   | either         | no    | Prepared title or body contains forbidden data        | Redact/rebuild; credential boundary if unresolved    | Publish original title/body            | Redaction evidence               |
| ISS-09   | either         | no    | Write result ambiguous                                | Read-only lookup; settle URL or `needs_attention`    | Blind retry                            | Write identity and lookup        |
| ISS-10   | mixed          | yes   | Project workaround over confirmed upstream gap        | Two correctly routed cross-linked Issues             | Collapse into nearest repository       | Both ownership proofs and URLs   |
| ISS-11   | either         | no    | Repository known; CLI/auth unavailable                | Credential boundary; preserve sanitized intent       | Switch host or use unproved raw API    | Host, error, prepared title/body |
| ISS-12   | either         | no    | Same-rank repositories or host unclassified           | `needs_attention`; no write                          | Pick first or infer from installed CLI | Candidates and ambiguity         |
| ISS-13   | either         | no    | Read succeeds; write unambiguously rejected           | Report exact failure; retry only if no effect proved | Treat rejection as success or drop     | Exit and canonical error         |
| ISS-14   | either         | no    | Search equals limit, truncates or errors              | Narrow or enlarge explicitly; else attention         | Claim no duplicate                     | Limits, counts, final query      |
| ISS-15   | either         | no    | Installed CLI lacks required capability               | Record help; unsupported or `needs_attention`        | Guess flag or invoke bodyless write    | Version and missing capability   |

## Native CLI surface

Before a write, record installed versions and reread subcommand help. GitHub
repo-scoped dedup uses `gh issue list --state all --limit <n> --json
number,title,state,stateReason,url,updatedAt`; comments/creates use
`--body-file`. Cross-repo `gh search issues` never receives `--state all` and
does not claim `stateReason`.

GitLab dedup uses `glab issue list --all --output json --per-page <n> --page
<k>` until a short page. Creates use `--description-file`. A multiline note uses
a verified body-file capability or `glab api --method POST ... --input
<prepared-note.json>`; bodyless `glab issue note/create` is forbidden because it
opens an editor. Every write body is prepared under `umask 077`, passed by file
or stdin without shell substitution, and removed only after settled outcome.

Многострочный GitLab body передаётся только через доказанную file/stdin
поверхность, включая `glab api --input` с явным `Content-Type`; её отсутствие
даёт ISS-15. Версионные и credential-наблюдения остаются current run evidence,
а повторяемые диагностические команды принадлежат
[Грабли и команды проекта](../papercut.md), не этому durable решению.
