# Маршрутизация подтверждённой внешней работы

Этот переносимый контракт определяет operational-решение проекта Meta-O.
Установленный orchestrator читает его до поиска или записи Issue; ему не
нужен доступ к исходному репозиторию Meta-O.


Сначала установи `in_scope`, `unconfirmed`, `project_issue`, `upstream_issue`,
`duplicate` или `needs_attention`, затем адресат. Для upstream допустим только
explicit repository пользователя либо verified ownership metadata инструмента;
project remote никогда не fallback. Для project Issue precedence: explicit
repository, tracking remote, `origin`.

Hosting выводится из URL host. Для enterprise/self-hosted host требуется ровно
один успешный authenticated `gh auth status --hostname` или `glab auth status
--hostname`. Перед записью выполняется bounded search открытых и закрытых Issues;
усечённый результат не доказывает отсутствие duplicate. Root cause совпадает
только при той же публичной поверхности, нарушенном invariant и классе симптома.

Write использует native `gh`/`glab`; финальные title и explicit body из private
temporary file проходят одну closed redaction policy перед записью и post-write
lookup. Неопределённый effect не повторяется. Closed fixed Issue либо связывается
с требуемой версией, либо получает новый use case/new Issue; автоматического
reopen нет. Локальный workaround публичного пробела разрешён только рядом с
verified canonical upstream Issue URL; иначе route объявляется unsupported.

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

Перед записью зафиксируй installed version и перечитай help точной subcommand.
GitHub repo-scoped dedup использует `gh issue list --state all --limit <n>
--json number,title,state,stateReason,url,updatedAt`; comments/creates используют
`--body-file`. Cross-repo `gh search issues` не получает `--state all` и не
выдаёт отсутствие `stateReason` за repo-scoped доказательство.

GitLab dedup использует `glab issue list --all --output json --per-page <n>
--page <k>` до короткой страницы. Creates используют `--description-file`.
Многострочная note разрешена только через доказанную native file/stdin
поверхность. В текущем контракте `glab issue note` body-file route unsupported:
канонический upstream Issue URL для локального API workaround не подтверждён.
Это даёт ISS-15 и запрещает bodyless command, editor invocation и raw API
workaround.

Каждый write body готовится под `umask 077`, передаётся файлом или stdin без
shell substitution и удаляется только после settled outcome. Версионные и
credential-наблюдения принадлежат текущему run evidence, а не durable contract.

После каждого решения сохрани bounded textual disposition record в живой
spec/backlog closure message с точными полями `Scenario`, `Class`, `Repository`,
`Search`, `Action`, `Canonical-URL`, `Outcome`. `Outcome` принимает только
`implemented`, `commented`, `created`, `duplicate`, `refuted` или
`needs_attention`. Для Issue-class outcomes `commented`, `created` и `duplicate`
поле `Canonical-URL` обязательно. Для `needs_attention` обязательна причина, а
`Canonical-URL` не может содержать URL, угаданный из failed write. Record не
создаёт отдельный manifest/state store и удаляется вместе со spec после harvest.
