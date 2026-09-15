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

`disposition_class` имеет closed vocabulary `upstream_issue`, `project_issue`,
`unconfirmed`, `either`, `mixed`. Разрешение на write задаётся самими
`required_action` и `forbidden_action`, а не выводится из свободной прозы.

| scenario_id | disposition_class | inputs                                                | required_action                                      | forbidden_action                       | evidence                         |
| ----------- | ----------------- | ----------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- | -------------------------------- |
| ISS-01      | upstream_issue    | External root cause; verified upstream                | Search all; comment matching cause or create         | Use project remote as fallback         | Ownership, query, result, URL    |
| ISS-02      | upstream_issue    | Ownership unreadable or ambiguous                     | `needs_attention`; no write                          | Guess from tool/package name           | Sources and ambiguity            |
| ISS-03      | upstream_issue    | Only project remotes available                        | `needs_attention`; no write                          | Use `origin` or tracking ref           | Remotes and missing owner        |
| ISS-04      | project_issue     | Project cause; no explicit repository                 | Tracking ref, then `origin`; search/comment/create   | Choose unrelated repository            | Precedence, host, result, URL    |
| ISS-05      | unconfirmed       | Root-cause owner unknown                              | Reproduce until class is established                 | Any external write                     | Reproduction or attention        |
| ISS-06      | either            | Open match has same surface, invariant and symptom    | Add one sanitized confirmed use case                 | Duplicate or title-only match          | Three-part match and URL         |
| ISS-07A     | either            | Closed fixed in installed version; still reproducible | Create new Issue linked to closed one                | Pretend fix is not installed           | Versions, reproduction, URLs     |
| ISS-07B     | either            | Closed fixed only in newer version                    | Reference required version; no write                 | Create duplicate                       | Installed/fixed versions, URL    |
| ISS-07C     | either            | Closed wontfix/stale; symptom alive                   | Add sanitized use case                               | Automatic reopen                       | Closure reason and result        |
| ISS-08      | either            | Prepared title or body contains forbidden data        | Redact/rebuild; credential boundary if unresolved    | Publish original title/body            | Redaction evidence               |
| ISS-09      | either            | Write result ambiguous                                | Read-only lookup; settle URL or `needs_attention`    | Blind retry                            | Write identity and lookup        |
| ISS-10      | mixed             | Project workaround over confirmed upstream gap        | Two correctly routed cross-linked Issues             | Collapse into nearest repository       | Both ownership proofs and URLs   |
| ISS-11      | either            | Repository known; CLI/auth unavailable                | Credential boundary; preserve sanitized intent       | Switch host or publish without auth    | Host, error, prepared title/body |
| ISS-12      | either            | Same-rank repositories or host unclassified           | `needs_attention`; no write                          | Pick first or infer from installed CLI | Candidates and ambiguity         |
| ISS-13      | either            | Read succeeds; write unambiguously rejected           | Report exact failure; retry only if no effect proved | Treat rejection as success or drop     | Exit and canonical error         |
| ISS-14      | either            | Search equals limit, truncates or errors              | Narrow or enlarge explicitly; else attention         | Claim no duplicate                     | Limits, counts, final query      |
| ISS-15      | either            | Installed CLI lacks required capability               | Record help; unsupported or `needs_attention`        | Guess flag or invoke bodyless write    | Version and missing capability   |

## Native CLI surface

Перед записью зафиксируй installed version и перечитай help точной subcommand.
GitHub repo-scoped dedup использует `gh issue list --state all --limit <n>
--json number,title,state,stateReason,url,updatedAt`; comments/creates используют
`--body-file`. Cross-repo `gh search issues` не получает `--state all` и не
выдаёт отсутствие `stateReason` за repo-scoped доказательство.

GitLab dedup использует `glab issue list --all --output json --per-page <n>
--page <k>` до короткой страницы. Creates используют `--description-file`.
`glab issue note` не читает body из файла или stdin и без `--message` открывает
editor. Поэтому многострочная note публикуется через
`glab api --hostname <host> --method POST projects/<url-encoded-path>/issues/<iid>/notes --input <prepared-note.json>`,
где JSON собирается file-safe командой `jq -Rs '{body: .}' < body.md > note.json`.
Это локальный workaround: рядом с инструкцией обязателен canonical upstream
Issue URL; пока он не подтверждён, route даёт `needs_attention`, а не guessed
write. Bodyless command, editor invocation и shell substitution запрещены.

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
