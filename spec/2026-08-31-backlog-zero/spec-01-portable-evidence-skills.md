# Spec 1 — Portable evidence skills

Статус: implementation-ready. Обязательный общий contract, зависимости, eval matrix и decision ledger находятся в [program overview](2026-09-02-backlog-zero-council-brainstorm.md). Эта spec не может ослаблять общий contract.

## 1.1. Outcome

Поставить переносимый `find-reuse` и компактное evidence-first ядро code review. Оба контракта не знают Meta-O paths, lifecycle, destination, Orca или структуру spec. Meta-O-интеграция остаётся в spec 2.

## 1.2. Компоненты и ownership

### `find-reuse`

- source: `src/skills/find-reuse/`;
- generated output: `skills/find-reuse/` только через `make skills`;
- старые `src/skills/mo-reuse/` и `skills/mo-reuse/` удаляются без alias;
- generic references описывают request/report contract и source adapters;
- skill активируется только по явному запросу reuse research, а не по любому вопросу о библиотеке.
- skill является pure read-only report producer: он не создаёт/редактирует repository artifacts, не коммитит, не устанавливает tools и не выполняет login;
- readiness increment регистрирует `find-reuse`, `senior-python` и `senior-jsts` в `tests/build-skills.test.mjs`, `tests/install.test.mjs`, README skill table и §A-DISTRIBUTION-06, не изменяя содержательный дизайн уже созданных senior skills.

### Portable review core

- owner: `shared/references/review-protocol.md` и review-specific references;
- consumer: `mo-review-orca` в spec 2;
- это не новый orchestration skill и не новый runtime;
- `senior-python`/`senior-jsts` — conditional lenses для соответствующих artifacts, но portable core не требует их наличия.

## 1.3. `find-reuse` request contract

Логический вход `find-reuse.request.v1` передаётся человекочитаемым Markdown:

```yaml
contract: find-reuse.request.v1
problem: <что нужно решить>
business_requirements:
  - id: BR-1
    text: <generic требование>
    priority: must|should|could
constraints:
  - <ограничение>
repository_root: <optional path>
depth: quick|standard|deep
```

`business_requirements` не содержит ссылок на Meta-O documents. Неизвестный `contract` отклоняется с понятной ошибкой до поиска.

## 1.4. `find-reuse` report contract

Выход — Markdown `find-reuse.report.v1` с frontmatter и обязательными секциями:

```yaml
contract: find-reuse.report.v1
status: reuse|extend|build|unknown
coverage: complete|partial|blocked
```

Обязательные секции:

1. `Decision` — выбранный status и короткая причина;
2. `Requirement fit` — каждая `must/should` requirement сопоставлена кандидатам;
3. `Search coverage` — каждая применимая surface, query, tool, auth/result/error;
4. `Candidates` — canonical identity, provenance, license, release/maintenance/adoption/security signals;
5. `Rejected candidates` — конкретная причина;
6. `Unknowns` — отсутствующие источники и последствия;
7. `Recommended next step`.

`build` запрещён, если required source не был проверен. В этом случае status — `unknown`, coverage — `partial|blocked`.

## 1.5. Adapter descriptor

Каждый adapter reference задаёт одну запись:

```ts
type AdapterDescriptor = {
  id: string;
  ecosystems: string[];
  capabilities: Array<
    | "semantic_search" | "name_search" | "exact_lookup"
    | "downloads" | "releases" | "maintenance"
    | "reverse_dependencies" | "security"
  >;
  required_tools: string[];
  version_probe: string[];
  capability_probe: string[];
  install_help: Record<"macos" | "debian" | "windows" | "other", string>;
  base_url: string;
  test_base_url_env?: string;
  auth_required: "never" | "private_only" | "always";
  auth_probe?: string[];
  login_help?: string;
  operations: Array<{
    capability: string;
    transport: "argv" | "http_get" | "http_post";
    argv_or_url: string[];
    output: "json" | "json_lines" | "text";
    success: { exit_codes?: number[]; http_status?: number[] };
    errors: Record<string, "tool_missing" | "auth_missing" | "rate_limited" | "source_unavailable" | "malformed">;
  }>;
  unavailable_fields: string[];
  last_verified: string;
};
```

Commands хранятся как argv arrays; skill не строит shell strings из user query. Ошибка команды записывается как coverage gap, а не как пустая выдача.

`base_url` production-значение неизменно внутри обычного запуска; tests подменяют его только через названный `test_base_url_env`. Поддерживаемой считается не версия по номеру, а версия, на которой `version_probe` и exact `capability_probe` успешны. Перед изменением `last_verified` обязательна отдельная network-enabled команда `make mo-live-adapters`; она не входит в `mo-qc`, но блокирует принятие изменённого обязательного adapter. Evidence фиксирует tool version, command, timestamp и sanitized result.

### Applicable surfaces

Алгоритм не оставляется исполнителю:

1. Local repository применяется, если передан `repository_root`.
2. Каждый canonical source remote repository применяется, если он обнаружен в Git/manifests либо назван business requirement.
3. Registry применяется для каждого ecosystem, обнаруженного по manifest/lockfile/imports, и для каждой явно допустимой requirement альтернативы.
4. Для нового компонента без закреплённого ecosystem добавляется один минимальный cross-ecosystem discovery tier: GitHub/GitLab плюс registries двух наиболее подходящих разрешённых стеков; выбор и rationale записываются в report.
5. Private source применяется только когда он явно назван context/remote/config; отсутствие credentials делает его `blocked`, не silently inapplicable.
6. Coverage `complete` только когда каждая применимая surface выполнила required discovery и каждый finalist — required enrichment, либо surface получила rule-based `not_applicable` с evidence. Ошибка/отсутствующий tool/auth даёт `partial|blocked` и запрещает `build`.

## 1.6. Обязательное discovery/enrichment ядро

`<query>` и `<package>` ниже — placeholders, которые передаются инструменту безопасным отдельным argument либо URL-encoding.

| Surface | Required tool/library | Auth probe и login | Arbitrary query / exact lookup | Enrichment |
| --- | --- | --- | --- | --- |
| Local Git/repository | `git`, `rg`, detected package manager | нет | `rg -n -i <query> .`; `git log -S <query> --oneline --all` | manifests, license, history, existing dependency |
| GitHub | `gh` | `gh auth status`; `gh auth login` | `gh search repos <query> --limit 30 --json ...`; `gh search code <query> --limit 30 --json ...` | `gh repo view`, releases, contributors, issues, advisories/API |
| GitLab | `glab` | `glab auth status`; `glab auth login` | `glab repo search <query>`; server API for scoped code search | repository/release/issues metadata through `glab api` |
| npm | Node.js + `npm` | public: none; private: `npm whoami`, then `npm login` | `npm search <query> --json --searchlimit=30`; `npm view <package> --json` | npm downloads API, repository field, versions, dependents when available |
| PyPI | Python + `python -m pip`; source-host adapter for semantic discovery | public: none; private index: index-specific credential probe/instruction | semantic query through source-host search scoped to Python; `python -m pip index versions <package>` for exact name | `https://pypi.org/pypi/<package>/json`; `pypistats` for downloads; project URLs for repository provenance |
| crates.io | Rust + `cargo` | public: none | `cargo search <query> --limit 30`; `cargo info <package>` | crates.io API downloads/versions/owners/repository |
| Go modules | Go + `go`; source-host adapter | public: none; private modules use existing `GOPRIVATE`/host auth | source-host semantic search scoped to Go; proxy/pkg.go.dev lookup; `go list -m -versions <module>` only in a temporary module context when required | proxy versions, pkg.go.dev metadata, repository tags |
| Maven Central | `curl` or standard HTTP client, Java build tool when present | public: none | Solr API `https://search.maven.org/solrsearch/select` with URL-encoded `q=<query>`, `rows=30`, `wt=json` | coordinates, versions, timestamps, SCM/POM metadata |
| NuGet | .NET SDK | public: none; private feed-specific `dotnet nuget list source` and documented login | `dotnet package search <query> --format json`; exact package API | versions, owners, downloads, repository metadata |
| RubyGems | Ruby + `gem` | public: none; private source-specific auth | `gem search <query> --remote --all`; `gem info <package> --remote` | RubyGems API downloads, versions, source code URI |
| Packagist | PHP + `composer` | public: none; private repository-specific auth | `composer search <query> --format=json`; `composer show <package> --all` | Packagist API downloads, dependents/suggesters, repository |

Каждая сокращённая ячейка этой обзорной таблицы раскрывается в adapter reference как exact operation. Минимально обязательные HTTP operations:

- npm downloads: `GET https://api.npmjs.org/downloads/point/last-month/<url-encoded-package>`;
- PyPI metadata: `GET https://pypi.org/pypi/<url-encoded-package>/json`;
- PyPI downloads: установленный `pypistats` и argv `pypistats recent <package> --json`; `python -m pip index versions` помечен experimental exact-name fallback и не используется для semantic search;
- crates.io: `GET https://crates.io/api/v1/crates?q=<url-encoded-query>&per_page=30` и `GET /api/v1/crates/<crate>`;
- Go: `GET https://proxy.golang.org/<escaped-module>/@v/list`; semantic discovery остаётся source-host operation;
- Maven: `GET https://search.maven.org/solrsearch/select?q=<url-encoded-query>&rows=30&wt=json`;
- NuGet: service index `GET https://api.nuget.org/v3/index.json`, затем advertised `SearchQueryService` endpoint с `q=<url-encoded-query>&take=30`;
- RubyGems: `GET https://rubygems.org/api/v1/search.json?query=<url-encoded-query>` и `GET /api/v1/gems/<gem>.json`;
- Packagist: `GET https://packagist.org/search.json?q=<url-encoded-query>` и `GET /packages/<vendor>/<package>.json`;
- security: OSV `POST /v1/query` не является `http_get`, поэтому обязательный security enrichment использует `osv-scanner --format json --lockfile <detected-lockfile>` либо source-host advisory operation; если ни один применим, field честно `unavailable`.

PyPI и Go не притворяются, что у них есть поддерживаемая generic full-text registry CLI. Semantic discovery идёт через применимый source host; registry используется для exact metadata. Наличие проекта только в одном источнике не завершает поиск.

Optional adapters: Codeberg/Gitea, Bitbucket, Swift Package Index, Hex, pub.dev, Conan/vcpkg и private registries. Они добавляются только вместе с descriptor, command examples, probes и tests; отсутствие optional adapter не делает обязательное coverage полным для проекта, где он явно применим.

## 1.7. Tool/auth behavior

Для каждого required tool сначала выполняется read-only install probe (`command -v`, version/help). Если tool отсутствует:

- skill не устанавливает его;
- показывает одну OS-aware команду установки или official URL;
- отмечает конкретные потерянные capabilities;
- не продолжает так, будто source дал ноль результатов.

Auth проверяется только там, где он нужен для выбранного source/scope. Skill никогда не просит credential value в чате и не выполняет login; он показывает точную login command. Public registry search не блокируется отсутствием publishing credentials. Любой adapter command сначала проходит exact `--help`/capability probe; неизвестный flag/subcommand даёт `adapter_unsupported`, а не попытку угадать замену.

## 1.8. Identity, dedup и enrichment

```ts
type CandidateIdentity = {
  source_repo?: { host: string; canonical_owner: string; canonical_name: string };
  packages: Array<{ ecosystem: string; normalized_id: string }>;
  relationships: Array<{
    left: string;
    right: string;
    kind: "authoritative_same_project" | "possible_same_as" | "fork" | "mirror" | "monorepo_member";
    evidence: string;
  }>;
};
```

Package ↔ repository объединяются только по authoritative registry metadata, repository-owned manifest/release evidence или явно документированной upstream связи. Совпадение имени/описания даёт `possible_same_as`, не merge. Forks, mirrors и packages одного monorepo сохраняют отдельную identity.

Каждый finalist обогащается как минимум source-host и registry signals, если обе стороны существуют. Downloads, stars и dependents не сравниваются между ecosystems как одна шкала; report сохраняет source, window и timestamp.

## 1.9. Portable review algorithm

`fast`, `deep` и `follow_up` — начальные coverage profiles одного portable core, а не разные evidence standards и не указание числа reviewers или subagents. Ни один mode не разрешает пропустить intent, candidate identity, causality, severity, evidence или валидный результат без findings.

- `fast` предназначен для bounded low-risk change. Он обязательно читает весь diff, непосредственно достижимые callers/callees, связанные tests/configuration и repository instructions. History и более дальние surfaces читаются, если без них нельзя установить intent, causality или поведение.
- `deep` предназначен для первого review крупного или неизвестного change и для semantically broad/high-risk delta. Он охватывает весь diff, reachable implementation, tests, schemas, configuration, relevant history и, при доступном adapter, связанные prior PR/comments.
- `follow_up` требует original intent, предыдущий full candidate SHA, собственный предыдущий report reviewer, disposition каждого его finding и computable delta до нового SHA. Он перепроверяет каждую disposition, исправления, новое поведение и изменившиеся surrounding invariants. Peer report reviewer не передаётся.
- Mode является budget hint, а не пределом корректности. `fast` и `follow_up` в том же execution повышаются до `deep`, если обнаружены изменения trust/auth, concurrency, schema/transaction/data migration, compatibility, destructive effects, resource ownership либо иной широкий semantic delta. Report фиксирует requested и effective mode.
- Если входа недостаточно даже для `deep`, результат — `UNKNOWN` с точным перечнем отсутствующего evidence, а не сокращённый `PASS`.

Review core выполняет стадии в указанном порядке:

1. Grounding: исходный intent, accepted spec, repository instructions, exact candidate SHA, claimed scope и mode input.
2. Change discovery: прочитать diff до risk mapping; установить изменённые artifacts, непосредственно достижимый surrounding code, tests/configuration и релевантную history. Prior PR/comments используются только через доступный optional adapter.
3. Risk mapping: по фактическому diff и обнаруженным contracts активировать применимые lenses — security/effects, concurrency/state, compatibility/data, performance/resources, maintainability/test gaps. Карта может расширяться по мере discovery, но не строится вместо чтения diff.
4. Candidate discovery: сопоставить requirements с реализацией, проследить активированные risk surfaces и собрать material candidate findings без требования заполнить категории.
5. Candidate verification: попытаться опровергнуть каждый candidate тестом, trace, contract, guard, caller, configuration или language/framework semantics; классифицировать его как `confirmed`, `strongly_supported`, `unproven` или `refuted`.
6. Causality: finding должен быть вызван change либо materially worsened им. Pre-existing issue отражается только как отдельно маркированный residual risk, если он блокирует заявленный outcome; он не маскируется под change finding.
7. Severity policy: severity назначается только после evidence и causality, отдельно от discovery.
8. Reporting: публикуются только `confirmed` и `strongly_supported` findings; `unproven` остаётся в `Unknowns`, `refuted` не публикуется. Zero findings — валидный `PASS`.

Portable severity contract:

- `P0` — доказанная reachable emergency: активная эксплуатация, неизбежная или уже происходящая потеря/порча данных, широкий outage либо другой немедленный запрет эксплуатации.
- `P1` — серьёзный correctness, security, availability, data или compatibility failure с реалистичными prerequisites и высоким impact; change нельзя принимать без remediation.
- `P2` — ограниченный, но actionable дефект, regression, operational failure или доказанная structural pressure с конкретным failure/cost path.
- `P3` — неблокирующее, но actionable локальное улучшение robustness, clarity, testability или proof. Вкус, отсутствие предпочитаемого pattern, formatter/linter noise и недоказанный hypothetical concern не являются P3.
- Severity определяется impact, reachability и prerequisites. Confidence после evidence допустим только как диагностическая пометка и не повышает, не понижает и не скрывает finding.

Report начинается с обязательного header:

```text
Review-Execution: <opaque caller-supplied execution id>
Candidate: <40-hex full SHA>
Scope: <branch|feature|project>
Mode: requested=<fast|deep|follow_up> effective=<fast|deep|follow_up>
Reviewer: <vendor/model/lens>
Verdict: <PASS|FINDINGS|UNKNOWN>
Checks: <commands or explicit not-run reasons>
```

`Review-Execution` остаётся opaque для portable core. Внешний consumer может подставить native task/dispatch locator, не заставляя core знать Orca или иной backend.

Finding format остаётся текстовым:

```text
[P0|P1|P2|P3] <краткий заголовок>
Location: <path:line or smallest affected surface>
Failure: <конкретное наблюдаемое последствие>
Evidence state: <confirmed|strongly_supported>
Evidence: <trace/test/contract/code path>
Why introduced: <causal link to candidate>
Remediation boundary: <что должно стать истинным, без навязывания реализации>
```

Severity остаётся текстовым свойством каждого finding; обязательных counters, ranking formula и adjudication grammar нет. `PASS` разрешён только при отсутствии published findings и unresolved evidence, способного material change превратить в P0–P2; при таком unresolved evidence verdict — `UNKNOWN`. Confidence может быть диагностической пометкой после evidence, но не заменяет его и не является threshold для публикации. Ссылки из кода на номера findings запрещены; durable comments ссылаются только на business/architecture contracts.

## 1.10. Acceptance и evals

- rename test доказывает отсутствие `mo-reuse` в source/generated/docs/instructions;
- portability scan запрещает `Meta-O`, `docs/business.md`, `docs/acceptance.md`, lifecycle/destination/commit semantics внутри `find-reuse`;
- contract fixtures: unknown version, missing tool, auth gap, rate limit, malformed output, empty result, dedup, monorepo/fork, cross-source enrichment, incomplete coverage → `unknown`;
- adapter fixtures выполняют documented argv against fake/local endpoints; `make mo-live-adapters` обязателен перед обновлением `last_verified` или принятием изменённого adapter, но не входит в offline `mo-qc`;
- review fixtures: clean change, plausible false positive, off-diff reachable regression, security effect, concurrency bug, docs-only change, unknown SHA;
- stage-order fixture доказывает чтение diff до initial risk map и отдельные discovery, verification, causality, severity и reporting results;
- severity fixtures различают один и тот же доказанный failure при P0–P3 impact/prerequisite profiles и отклоняют confidence-only finding;
- mode fixtures: bounded `fast`, initial `deep`, valid `follow_up`, missing follow-up context, in-place escalation `fast|follow_up → deep`, отсутствие peer report bytes;
- report fixtures проверяют header, opaque `Review-Execution`, full SHA, requested/effective mode, evidence state, textual severity и `PASS|FINDINGS|UNKNOWN` invariants без counters;
- eval matrix общего раздела покрывает все installable skills; results advisory, deterministic contract failures blocking.

## 1.11. Rejected/deferred

- Отдельный `review-core` skill отклонён: shared portable contract достаточно, новый public entrypoint не нужен.
- Постоянный полный checklist и prompt wall отклонены: risk lenses выбираются по evidence.
- Обязательные 2×2 ensembles и forced subagents deferred до differential eval; foreign benchmark не является acceptance.
- Автоустановка tools и auto-login отклонены как authority violation.
- Registry detection как единственный сигнал применимости отклонён: business requirements могут разрешать другую технологию.

## 1.12. Open questions

Нет. Ошибки конкретных adapter commands, найденные executable probes, исправляются в этой spec без изменения architecture.
