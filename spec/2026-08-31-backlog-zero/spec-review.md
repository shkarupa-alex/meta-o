# Программа обнуления текущего backlog Meta-O

Статус: draft для council spec review.

Эта программа состоит из четырёх самостоятельно реализуемых спецификаций. Девять аналитических workstreams из council synthesis сохранены как coverage slices внутри них, а не превращены в девять документов.

## 1. Общая цель и границы

После выполнения всех четырёх спецификаций:

- `docs/backlog.md` сохраняет schema и пустой `## Открыто`;
- `docs/backlog-issues-real-runs.md` удалён после переноса каждого уникального инцидента в durable requirement и executable proof;
- `docs/research/review-deep-research-{1,2,3}.md` использованы как исследовательский input, но не становятся нормативным слоем;
- каждый applicable пункт исходного backlog закрыт реализацией, явно принятым архитектурным отказом либо подтверждённой upstream capability boundary;
- один full Git SHA проходит `make mo-qc`, два vendor-diverse review и applicable E2E;
- Herdr/Paseo не возвращаются; поддерживается только Orca;
- `senior-python` и `senior-jsts` считаются существующим пользовательским input, их создание не входит в программу.

Источники исходной постановки фиксируются по Git, а не постоянной копией ledger:

- program base commit: `41a4898974a6a08eb415cb07ba849575c5964b61`;
- `docs/backlog.md` blob: `8d11d1107eb5875235c2830e6503f7e1265317d7`;
- `docs/backlog-issues-real-runs.md` blob: `c75859372fa7d794269cc6dcc8834c069ddd8096`;
- последний commit с Herdr/Paseo: `2eb85bebe14aa35419db192db66938e14e0be6f1`.

## 2. Четыре спецификации и зависимости

| Spec | Название | Workstreams | Зависимости |
| --- | --- | --- | --- |
| 1 | Portable evidence skills | WS-01 `find-reuse`, portable WS-03 review core, bounded eval contract | нет |
| 2 | Feature lifecycle and review settlement | WS-02 lifecycle, WS-04 review orchestration, integration WS-03 | стабильные contracts spec 1; Orca readiness spec 3 |
| 3 | Orca reliability and local-model orchestration | WS-05 capability truth, WS-06 supervision/recovery, WS-08 watchdog | нет для readiness; spec 1 review contract для полного E2E |
| 4 | Knowledge integrity and backlog closure | WS-07 knowledge, WS-09 closure/migration | закрытые specs 1–3 для final deletion proof |

Spec 1, readiness slice spec 3 и knowledge-foundation slice spec 4 могут идти параллельно. Затем spec 3 доказывает полный Orca path и Qwen profile, spec 2 собирает lifecycle. Spec 4 закрывает программу последней.

## 3. Общий change protocol

Каждая spec реализуется отдельной feature branch и отдельным independently reviewable feature SHA.

Первый implementation commit каждой ветки:

1. материализует утверждённую spec и дословный user ledger;
2. добавляет короткий outcome checklist без повторения нюансов spec;
3. переносит новые устойчивые business intents в `docs/business.md` пропорционально реальному изменению;
4. добавляет или уточняет architecture decision, если меняется ownership или принятое поведение.

Исполнитель отмечает checklist по мере работы. Spec и checklist удаляются только после полного proof, переноса durable knowledge и явного решения пользователя о готовности к merge. Их удаление создаёт новый SHA, поэтому общий final gate выполняется на deletion SHA.

Устойчивое повторение «такое поведение хорошее/плохое» проверяется при каждом increment:

- если ожидание уже покрыто, spec и proof ссылаются на существующий `§B-*`;
- если это новое устойчивое ожидание, оно становится компактным `§B-*`;
- если пользователь явно изменил смысл, обновляется верхний слой и зависимые решения, а старый текст не маскируется тихой правкой ledger.

## 4. Общий eval contract

Отдельная eval-платформа и отдельная пятая spec не создаются. Каждая spec владеет representative cases изменяемых skills.

- Для `mo-orchestrate-orca` профиль Qwen 3.8 27B UD-Q4-KM через OpenCode критичен: пока он не проходит acceptance, локальная orchestration не считается поддерживаемой.
- Для остальных skills выполняются 2–3 bounded прогона positive, negative и degraded cases. Они advisory, кроме executable safety/contract failures.
- Сначала применяются deterministic/executable oracles; Qwen не оценивает собственный semantic output. Спорные semantic results проверяет vendor-diverse frontier reviewer либо человек.
- DeepSeek 4 Flash — optional comparator после реального подключения к OpenCode; его отсутствие ничего не блокирует.
- `make mo-qc` остаётся offline и deterministic. Живые model runs выполняются отдельной documented командой на GPU machine.
- Evidence фиксирует candidate SHA, skill revision, effective model id, quantization, OpenCode profile/version, context/sampling, tool permissions, case ids, repetitions и результаты. Secrets, абсолютные machine paths, веса и полные transcripts не коммитятся.
- Устойчивый gap становится regression case и правкой. После bounded rerun принимается обычное инженерное решение; бесконечная калибровка запрещена.

# Spec 1 — Portable evidence skills

## 1.1. Outcome

Поставить переносимый `find-reuse` и компактное evidence-first ядро code review. Оба контракта не знают Meta-O paths, lifecycle, destination, Orca или структуру spec. Meta-O-интеграция остаётся в spec 2.

## 1.2. Компоненты и ownership

### `find-reuse`

- source: `src/skills/find-reuse/`;
- generated output: `skills/find-reuse/` только через `make skills`;
- старые `src/skills/mo-reuse/` и `skills/mo-reuse/` удаляются без alias;
- generic references описывают request/report contract и source adapters;
- skill активируется только по явному запросу reuse research, а не по любому вопросу о библиотеке.

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
  install_probe: string[];
  auth_required: "never" | "private_only" | "always";
  auth_probe?: string[];
  login_help?: string;
  query_examples: string[][];
  enrichment_examples: string[][];
  unavailable_fields: string[];
  last_verified: string;
};
```

Commands хранятся как argv arrays; skill не строит shell strings из user query. Ошибка команды записывается как coverage gap, а не как пустая выдача.

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

PyPI и Go не притворяются, что у них есть поддерживаемая generic full-text registry CLI. Semantic discovery идёт через применимый source host; registry используется для exact metadata. Наличие проекта только в одном источнике не завершает поиск.

Optional adapters: Codeberg/Gitea, Bitbucket, Swift Package Index, Hex, pub.dev, Conan/vcpkg и private registries. Они добавляются только вместе с descriptor, command examples, probes и tests; отсутствие optional adapter не делает обязательное coverage полным для проекта, где он явно применим.

## 1.7. Tool/auth behavior

Для каждого required tool сначала выполняется read-only install probe (`command -v`, version/help). Если tool отсутствует:

- skill не устанавливает его;
- показывает одну OS-aware команду установки или official URL;
- отмечает конкретные потерянные capabilities;
- не продолжает так, будто source дал ноль результатов.

Auth проверяется только там, где он нужен для выбранного source/scope. Skill никогда не просит credential value в чате и не выполняет login; он показывает точную login command. Public registry search не блокируется отсутствием publishing credentials.

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
Projection: <full SHA> <verdict> P0=<n> P1=<n> P2=<n> P3=<n>
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

Числа в `Projection` обязаны точно совпадать с findings body. Confidence может быть диагностической пометкой после evidence, но не заменяет его и не является threshold для публикации. Ссылки из кода на номера findings запрещены; durable comments ссылаются только на business/architecture contracts.

## 1.10. Acceptance и evals

- rename test доказывает отсутствие `mo-reuse` в source/generated/docs/instructions;
- portability scan запрещает `Meta-O`, `docs/business.md`, `docs/acceptance.md`, lifecycle/destination/commit semantics внутри `find-reuse`;
- contract fixtures: unknown version, missing tool, auth gap, rate limit, malformed output, empty result, dedup, monorepo/fork, cross-source enrichment, incomplete coverage → `unknown`;
- adapter fixtures выполняют documented argv against fake/local endpoints; optional live probes не входят в `mo-qc`;
- review fixtures: clean change, plausible false positive, off-diff reachable regression, security effect, concurrency bug, docs-only change, unknown SHA;
- stage-order fixture доказывает чтение diff до initial risk map и отдельные discovery, verification, causality, severity и reporting results;
- severity fixtures различают один и тот же доказанный failure при P0–P3 impact/prerequisite profiles и отклоняют confidence-only finding;
- mode fixtures: bounded `fast`, initial `deep`, valid `follow_up`, missing follow-up context, in-place escalation `fast|follow_up → deep`, отсутствие peer report bytes;
- report fixtures проверяют header, opaque `Review-Execution`, full SHA, requested/effective mode, evidence state и точное совпадение `Projection` с body;
- 2–3 Qwen/OpenCode runs каждого изменённого skill проверяют positive activation, forbidden activation и degraded path; результаты advisory, deterministic contract failures blocking.

## 1.11. Rejected/deferred

- Отдельный `review-core` skill отклонён: shared portable contract достаточно, новый public entrypoint не нужен.
- Постоянный полный checklist и prompt wall отклонены: risk lenses выбираются по evidence.
- Обязательные 2×2 ensembles и forced subagents deferred до differential eval; foreign benchmark не является acceptance.
- Автоустановка tools и auto-login отклонены как authority violation.
- Registry detection как единственный сигнал применимости отклонён: business requirements могут разрешать другую технологию.

## 1.12. Open questions

Нет. Ошибки конкретных adapter commands, найденные executable probes, исправляются в этой spec без изменения architecture.

# Spec 2 — Feature lifecycle and review settlement

## 2.1. Outcome

Собрать intent, исполнение и review loop в один skills-first lifecycle. Оркестратор управляет процессом, executor владеет product/spec commits, а `mo-review-orca` владеет двумя независимыми горячими reviewers и импортирует portable protocol из spec 1.

## 2.2. Components

- `shared/references/methodology.md`: общий lifecycle и authority boundaries;
- `src/skills/mo-orchestrate-orca/`: управляющая роль, delegation, waits, settlement;
- `src/skills/mo-review-orca/`: review session lifecycle и pair delivery;
- `shared/references/review-protocol.md`: portable review behavior из spec 1;
- `docs/business.md`: только новые устойчивые intents, не incident log;
- temporary feature spec, verbatim ledger и outcome checklist: executor-owned tracked artifacts до merge approval.

Новый workflow engine, state store, task database или Meta-O wrapper над Orca не создаются.

## 2.3. First-commit artifacts

Минимальный feature bundle:

```text
spec/<feature>/
  <feature>-spec.md
  user-ledger.md
  checklist.md
```

`checklist.md` содержит только observable outcomes:

```markdown
- [ ] <outcome>
- [ ] Tests and knowledge updated
- [ ] Applicable E2E passed on candidate SHA
- [ ] Two reviewers passed final candidate SHA
```

Он не копирует design details и не становится task graph. Executor отмечает выполненное в coherent commits. Orchestrator читает, но не редактирует product/spec commits.

## 2.4. Business-intent harvest

До substantive implementation executor сравнивает spec/ledger с `docs/business.md`:

```text
каждое повторяющееся normative ожидание
→ existing §B-* exact link
| new compact §B-* thesis
| explicit user-approved meaning change
```

Incidents, command syntax и временный workaround идут в architecture/papercut/tests, а не раздувают business layer. Review проверяет пропорциональность: маленькая feature не переписывает общую картину проекта.

## 2.5. Executor advisory self-review

Перед `worker_done` executor может запустить один clean-room subagent review собственного candidate. Это явно ограниченное исключение к hot-session preference:

- advisory, не lifecycle gate;
- не заменяет vendor-diverse pair;
- не получает ownership worktree;
- результат полностью отражается в executor `worker_done`;
- executor исправляет material finding либо объясняет disagreement.

Способность executor работать без этого self-review сохраняется; обязательным является readiness собственного результата, а не конкретный subagent mechanism.

Для этого advisory review используется `fast`, если concern scan не обнаружил high-risk/broad semantic delta. Обнаруженный escalation автоматически переводит тот же review в `deep`; mode не разрешает executor пропустить material finding.

## 2.6. Review session contract

`mo-review-orca` получает:

```yaml
candidate_sha: <40-hex full SHA>
intent_source: <Git blob/ref or bounded private input>
scope: branch|feature|project
mode: fast|deep|follow_up
previous_review:
  candidate_sha: <required for follow_up>
  own_report: <required for follow_up; no peer report>
  own_finding_dispositions: <required for follow_up>
reviewers:
  - harness: codex
    model: <exact configured model>
    effort: <exact effort>
  - harness: claude
    model: <exact configured model>
    effort: <exact effort>
```

`previous_review` отсутствует для `fast|deep`. Для `follow_up` каждый reviewer получает только собственный предыдущий report и dispositions своих findings; peer report и peer reasoning не передаются.

Meta-O mode policy:

- первый обязательный lifecycle review выполняется как `deep`;
- remediation review выполняется как `follow_up`, пока portable core не повышает effective mode до `deep`;
- `fast` используется для advisory executor self-review или явно запрошенного standalone fast review и не заменяет первый обязательный deep pair;
- final same-SHA gate может быть `follow_up`, если reviewers видят original intent, свой prior report, полный delta и все изменившиеся contracts; semantic expansion повышает его до `deep`;
- выбор mode не меняет требование двух независимых vendor-diverse reviewers и двух `PASS` на одном SHA.

Model/provider/effort приходят из user-approved `mo-setup` posture/config. Skill не выбирает fallback harness/model и не добавляет sandbox/posture flags. Недоступная выбранная модель — typed block с инструкцией, а не молчаливый OpenCode fallback.

Каждый reviewer:

- имеет стабильный title `<feature>:review:<vendor>`;
- работает в immutable checkout exact SHA либо читает SHA-addressed Git objects;
- перед review доказывает full SHA и clean status;
- использует exact native Dispatch ID как `Review-Execution`;
- возвращает полный textual report через Orca `worker_done`;
- включает в report точную `Projection` из portable contract;
- после принятого `worker_done` показывает в своей видимой TUI строку `REVIEW DELIVERED <Review-Execution> <Projection>`;
- если native send отклонён, capability потеряна либо delivery не подтверждён, показывает `REVIEW DELIVERY UNKNOWN <Review-Execution>` и не считается settled;
- остаётся горячим до settlement всей feature, если backend capability это поддерживает.

`worker_done` body остаётся единственным authoritative report. TUI line — обязательная человекочитаемая проекция того же report, а не второй verdict. Coordinator проверяет, что `Review-Execution`, full SHA, verdict и P0–P3 counts совпадают с authoritative body и exact Dispatch. Missing/mismatched projection переводит delivery в `UNKNOWN` до исправления проекции тем же worker; новый review для этого не требуется. Terminal text никогда не заменяет отсутствующий или отклонённый `worker_done`.

Пользовательские unnamed tabs не закрываются. Собственная failed/replaced session освобождается exact-target operation после подтверждения replacement bookkeeping; duplicate visible tabs не оставляются.

## 2.7. Pairing, remediation и settlement

1. Создать обе review tasks до запуска первой.
2. Успешно запустить обе с выбранными профилями.
3. Ждать обе полные выдачи; не посылать findings исполнителю по одной.
4. Проверить exact SHA, `Review-Execution`, report completeness и совпадение `Projection`; terminal projection не подменяет report.
5. Передать executor исходную пару reports без перефразирования.
6. Executor исправляет findings либо аргументированно возражает.
7. Orchestrator решает спор по contracts/evidence; reviewer может ответить.
8. Любая material code/doc change образует новый candidate SHA.
9. Settlement завершается двумя независимыми `PASS` на одном final full SHA.

P0–P2 блокируют settlement. Все P3 также передаются executor и должны быть исправлены либо явно отклонены с причиной. Отдельный follow-up round только ради P3 не запускается; после обработки всех изменений один общий final same-SHA gate даёт два `PASS`.

Numeric round cap и правило «три minor-only итерации = готово» отклонены: они противоречат текущему business contract согласия обоих reviewers. Цикл заканчивается состоянием, а не счётчиком.

Final gate выполняется один раз после удаления temporary spec/checklist и всех последних правок. Reviewers получают intent из parent Git blob или bounded private input, поэтому deletion SHA остаётся проверяемым без tracked archive.

## 2.8. QC isolation

- reviewers не запускают mutating formatter/fixer;
- full QC не запускается одновременно в одном worktree;
- orchestrator/executor владеет mutex/sequencing full QC;
- потенциально mutating diagnostic выполняется в disposable checkout;
- reviewer может запускать read-only targeted tests, но сообщает command и environment;
- candidate mismatch или dirty checkout даёт `unknown`, не `PASS`.

## 2.9. Completion cleanup

После двух `PASS`, applicable E2E и user merge decision executor:

1. переносит durable knowledge;
2. удаляет feature spec, ledger и checklist;
3. повторяет required deterministic gates;
4. запускает единый final same-SHA review/E2E gate, если deletion вошёл после предыдущего proof;
5. освобождает только owned Orca workers/terminals после delivery confirmation.

Оркестратор не путает review-loop settlement с завершением всей spec и не закрывает executor после промежуточного QC.

## 2.10. Acceptance и evals

Deterministic fixtures/contracts:

- unknown/short SHA отклонён;
- dirty/mismatched checkout не может дать `PASS`;
- один report не доставляется как пара;
- P3 передаётся, но не создаёт отдельный minor-only loop;
- first lifecycle review использует `deep`, remediation использует `follow_up`, advisory self-review может использовать `fast`;
- `follow_up` получает только own prior report/dispositions, не peer bytes;
- high-risk или broad delta повышает `fast|follow_up` до effective `deep`;
- P0–P3 counts в `Projection` совпадают с report body;
- TUI `REVIEW DELIVERED` содержит тот же `Review-Execution`, SHA, verdict и counts, что authoritative `worker_done`;
- missing/mismatched TUI projection или rejected delivery даёт `UNKNOWN`, а terminal text не принимается вместо report;
- failed launch не меняет approved model и очищает только owned failed session;
- full access wrapper не получает duplicate flag;
- user unnamed tab остаётся;
- two reviewers не запускают full QC одновременно;
- comments с review finding ids отклоняются policy/lint review.

Agent E2E:

- 2–3 bounded Qwen runs проверяют explicit trigger/no overtrigger и pair protocol;
- live Orca scenario: два vendor-diverse reviewers exact SHA, formally linked brief TUI projections, full `worker_done`, remediation, повторное использование hot sessions, два final `PASS`;
- executor self-review scenario доказывает advisory status и полную передачу результата.

## 2.11. Rejected/deferred

- Четыре обязательных initial reviewers, 2×2 prompts и specialized subagents deferred до pre-registered differential eval.
- Confidence threshold вместо evidence отклонён.
- Автоматический fallback на иной harness/model отклонён.
- Закрытие всех reviewer tabs после каждого round отклонено.
- Review finding identifiers в production comments отклонены.

## 2.12. Open questions

Нет. Конкретный выбор моделей остаётся user-approved runtime configuration, а не постоянной spec-константой.

# Spec 3 — Orca reliability and local-model orchestration

## 3.1. Outcome

Сделать Orca единственным правдиво поддерживаемым backend, а `mo-orchestrate-orca` — реально запускаемым через локальный Qwen/OpenCode управляющим слоем. Исправления upstream не маскируются Meta-O proxy.

## 3.2. Ownership boundary

Meta-O владеет:

- required capability contract;
- preflight и fail-closed consumption;
- orchestration policy, roles, cadence, recovery ladder;
- acceptance fixtures/E2E;
- точными upstream issues и временными public workarounds только в разрешённых границах.

Orca/upstream `orchestration` владеет native commands, event envelope, delivery, process state, settled responses и effect confirmations. Для каждого gap нужны reproduction + upstream issue, затем upstream fix или qualifying public workaround. Сам факт issue означает только provenance; backlog закрывается лишь работающим proof либо явным architecture rejection.

## 3.3. Readiness contract

Readiness различает provider-native auth, Orca account projection и фактическую способность Orca запустить выбранный harness. Ни один из этих сигналов по отдельности не подменяет остальные.

```ts
type HarnessReadinessEvidence = {
  harness: "codex" | "claude" | "opencode";
  requested_model: string;
  requested_effort: string;
  native_auth: {
    state: "authenticated" | "unauthenticated" | "unknown";
    observed_at: string;
    command: string;
  };
  orca_account_projection: {
    state: "available" | "missing_credentials" | "unavailable" | "unknown";
    updated_at?: string;
    observed_at: string;
  };
  freshness: "fresh" | "stale" | "unknown";
  live_launch:
    | { state: "verified"; dispatch: string; process_identity: string; effective_model: string; effective_effort: string }
    | { state: "failed"; error: string }
    | { state: "not_run"; reason: string };
};
```

Перед доверием lifecycle message orchestrator доказывает:

1. `orca status --json` относится к ожидаемому instance/worktree;
2. companion `orchestration` доступен;
3. provider-native auth probe выполнен для выбранного harness;
4. `orca account list --json` прочитан вместе с `updatedAt`; projection, наблюдённая до более свежего успешного native auth, считается `stale`, а не доказательством отсутствующих credentials;
5. выбранный harness/model/effort существует и approved;
6. первый реальный role Dispatch либо один bounded disposable health Dispatch запустил настоящий harness process и task принят им, а не shell;
7. `launch.requested` и `launch.effective` совпадают по exact model/effort;
8. returned run/task/dispatch/terminal locators сохранены в текущем reasoning context.

Предпочтительно использовать первый реальный role Dispatch как live launch probe, чтобы не создавать лишние вкладки. Disposable probe допустим только когда реальный role ещё нельзя безопасно запускать; он создаётся по одному harness за раз, не выполняет product work и освобождается exact-target operation после подтверждения результата.

Если свежий provider-native auth расходится со stale Orca projection:

- orchestrator не просит пользователя авторизоваться повторно;
- не объявляет provider недоступным только по cached `missing-credentials|unavailable`;
- применяет только документированный read-only refresh/recheck, если native surface его предоставляет;
- затем выполняет один exact live launch probe на уже approved harness/model/effort;
- verified launch делает readiness успешной с диагностическим `stale_account_cache`;
- credential failure при verified real harness process означает backend integration gap, а не доказательство отсутствующей пользовательской авторизации;
- отсутствие подтверждённого process/effect оставляет readiness `unknown`;
- другой harness/model без user authority не пробуется.

`ready`/`input_accepted` — transport receipts. Untouched harness prompt, bare shell или task text executed by shell означают failed start; orchestrator останавливает только exact failed dispatch и применяет один документированный Orca fallback. Другой harness/model без user authority не пробуется.

## 3.4. Capability/event contract

Meta-O не вводит собственный envelope, но требует от native surface эквивалент следующих полей для каждого observed event:

```ts
type RequiredObservation = {
  instance: string;
  run: string;
  task: string;
  dispatch: string;
  terminal?: string;
  harness: "codex" | "claude" | "opencode";
  process: { identity: string; state: "running" | "stopped" | "lost" | "unknown" };
  lifecycle: "working" | "question" | "completed" | "failed" | "quota" | "reconnecting" | "compacted" | "unknown";
  message_id?: string;
  full_response?: string;
  observed_at: string;
};
```

Capability привязана к конкретным Dispatch/turn/process и проверяется на каждом событии; после exit/replacement она отзывается. Malformed/mismatched data даёт `unknown`, не inference из terminal preview.

Effectful native operations должны давать stable operation/target id, idempotency semantics и authoritative confirmation surface. Receipt не равен effect. Если effect нельзя подтвердить, состояние — `unknown_effect`; автоматический повтор запрещён.

## 3.5. Wait, wakeup и cadence

Основной механизм — blocking public wait на `worker_done,question,escalation` с bounded timeout. Timeout означает checkpoint, не failure.

- полный delivery batch обрабатывается до acknowledgment;
- early message обязан разбудить wait;
- quiet timeout создаёт один осмысленный checkpoint, не terminal polling loop;
- следующий wait ставится до продолжения длительной orchestration;
- cadence измеряется wall clock и backend event activity, а не количеством turns или repaint cursor;
- readiness/long work перепроверяется не реже одного bounded 5–10 minute window, если native wait не дал события;
- orchestrator не отправляет final, пока есть незакрытая spec, task, review, E2E или user-decision gate.

## 3.6. Roles, sessions и authority

Стабильные titles:

```text
<feature>:orchestrator
<feature>:executor
<feature>:review:codex
<feature>:review:claude
<feature>:e2e:<n>
```

Orchestrator не реализует feature локально. Executor остаётся hot до завершения remediation. Review workers принадлежат spec 2. Bounded E2E actors освобождаются после доказанного результата. Unnamed human tabs и sessions вне текущего run не изменяются.

Прямой user input в worker имеет высший authority, но делает его контекст contaminated для прежней изолированной роли; orchestrator фиксирует decision и при необходимости создаёт replacement с явным bookkeeping.

Work package, reviewable slice и gate — разные понятия. `worker_done` закрывает только свой Dispatch. `outcome=succeeded` запрещён, если обязательная часть infra-blocked, E2E не выполнен или durable decision gate пропущен.

## 3.7. Recovery ladder

1. typed Dispatch/worker state;
2. provider-native auth и public account/provider status с отдельной freshness classification;
3. exact live launch evidence для расхождения native auth и Orca account projection;
4. заранее квалифицированный bounded terminal projection;
5. user interruption только на named credential/subscription/dispute/irreversible boundary.

Quota, capacity, reconnecting, compaction, refusal, lost process, actual missing credentials и `stale_account_cache` не смешиваются.

Для `stale_account_cache`:

1. сравнить native auth observation time с Orca `updatedAt`;
2. выполнить документированный read-only refresh/recheck, если он существует;
3. не перезапускать живой Orca Run и не трогать private cache;
4. выполнить один exact approved live launch probe;
5. при успехе продолжить с диагностической отметкой и upstream reproduction;
6. при credential failure живого harness process зафиксировать backend integration gap;
7. при неподтверждённом effect оставить `unknown` и не повторять start автоматически.

Для остальных состояний policy выбирает wait, nudge, exact replacement или human escalation. Terminal/private transcript не используется как primary settled-response transport.

Recovery освобождает exact owned failed resource после подтверждения; broad close/cleanup запрещён. Соседние containers/files/network resources не затрагиваются без точной authority. Неопределённый effect fail-closed.

## 3.8. Watchdog

Deterministic classifier остаётся primary и добавляет patterns для:

- `Selected model is at capacity`;
- quota/limit и reset time;
- endless reconnecting;
- question/refusal/failure/completion;
- lost coordinator/worker и stale baseline distinctions.

Он seed'ит baseline до alerts, различает `queued` и delivered nudge, использует только typed native state и соблюдает §A-WATCHDOG-01 dedup. Изменение projection/dedup требует обновления ADR.

Local classifier — bounded experiment для неоднозначных credential-free states:

- exact installed model, network denied;
- input — sanitized structured observation, не transcript;
- output enum плюс evidence fields;
- deterministic high-severity patterns имеют приоритет;
- false positive/negative, latency и resource use сравниваются с pattern baseline;
- при non-inferiority failure experiment отклоняется в §A-WATCHDOG-02, а backlog всё равно закрывается принятым решением.

## 3.9. Qwen/OpenCode orchestration profile

Локальный Qwen выполняет роль orchestrator, а не semantic judge. Profile является поддерживаемым только если на GPU machine:

- OpenCode запускает exact Qwen 3.8 27B UD-Q4-KM;
- orchestrator не пишет product code и не присваивает executor ownership;
- корректно создаёт/называет roles и использует approved worker models;
- ставит blocking waits, обрабатывает early wakeups и quiet checkpoints;
- доставляет questions/reviews, соблюдает authority и recovery ladder;
- не заканчивает turn до terminal lifecycle state;
- не убивает unnamed/foreign resources;
- доводит representative feature до одного verified SHA.

Critical suite:

1. fake-Orca regressions для всех unique real-run incident families;
2. три последовательных прогона core safety/lifecycle scenarios без invariant failure;
3. один live small-feature E2E с executor, двумя vendor-diverse reviewers и applicable E2E;
4. exact environment/evidence record без secrets/transcripts.

Любой authority/destructive/premature-final/same-SHA failure блокирует поддержку профиля. Latency/tokens report-only. DeepSeek comparator optional.

## 3.10. Acceptance families

- fabricated `worker_done` из bare shell отвергнут;
- byte-safe task/report с quotes, newlines и shell metacharacters доставлен без интерполяции;
- early message wakes wait; timeout даёт один checkpoint;
- complete `worker_done` совпадает с public report surface;
- reviewer TUI projection формально совпадает с authoritative `worker_done` по `Review-Execution`, full SHA, verdict и P0–P3 counts;
- reconnect/quota/capacity/compaction/refusal имеют разные typed outcomes;
- fresh `claude auth status` плюс более старый cached Orca `missing-credentials|unavailable` классифицируются как `stale_account_cache`, не вызывают повторный login или model fallback;
- exact approved live launch разрешает stale-account mismatch только после проверки real harness process, task consumption и `launch.requested == launch.effective`;
- actual unauthenticated provider, stale projection и backend integration credential failure дают три разные outcomes;
- duplicate flag не добавляется поверх wrapper posture;
- follow-up receipt без consumption не считается delivery;
- fake SHA и wrong candidate отвергаются;
- concurrent QC contamination предотвращена;
- own background terminals очищены, foreign resources сохранены;
- lost coordinator takeover восстанавливает управление через public run state;
- Qwen critical suite проходит на exact candidate SHA.

## 3.11. Rejected/deferred

- Meta-O proxy над Orca CLI отклонён.
- Private provider transcripts и inferred session databases отклонены.
- Автоматический retry `unknown_effect` отклонён.
- Произвольный fallback harness/model отклонён.
- Local model как замена deterministic watchdog patterns отклонён.
- Постоянная version compatibility matrix отклонена; versions диагностические, requalification incident-driven.

## 3.12. Open questions

Нет product decisions. Если required native capability отсутствует, implementation создаёт upstream issue и возвращает spec в blocked state до fix/qualifying workaround; это не повод ослаблять acceptance.

# Spec 4 — Knowledge integrity and backlog closure

## 4.1. Outcome

Закрыть три knowledge-chain deferral и доказуемо удалить текущий backlog/real-runs program material без создания вечного closure registry.

## 4.2. Symbol-level purpose

Для `.mjs` используется mature `eslint-plugin-jsdoc`:

- значимые exported/public symbols требуют JSDoc;
- description объясняет purpose и содержит применимый `§A-*` identifier;
- trivial/private callback helpers исключаются через явную project config, не ad-hoc suppressions;
- config и violation fixtures входят в `make mo-lint`.

Для `.sh` нет зрелого выбранного parser/linter, способного надёжно требовать semantic purpose link у functions. Architecture decision фиксирует границу: module-level machine gate + обязательная symbol-level review для substantive shell functions. Это явное принятое ограничение, а не незакрытый backlog item. Собственный regex/parser не создаётся.

## 4.3. Source-only anchor stripping

§A-MEMORY-01 обновляется: source skills могут использовать architecture anchors, generated skills не содержат их.

`tools/build-skills.mjs` снимает только explicit author annotation syntax через Markdown AST transformation. Contract:

```ts
stripArchitectureAnchor(node: TextNode): {
  text: string;
  removed: Array<{ id: string; original: string; start: number; end: number }>;
}
```

Разрешённая трансформация удаляет exact `§A-...` reference token и нормализует только непосредственно соседний separator/whitespace. Build test сравнивает AST/text до и после и доказывает, что все остальные bytes/semantic nodes сохранены. Нераспознанный anchor syntax fail-closed. Gate переносится на source validity + generated absence.

## 4.4. Historical knowledge identifiers

Cutoff — program base commit `41a4898974a6a08eb415cb07ba849575c5964b61`, записанный в §A-MEMORY-01 и потребляемый `tests/knowledge-chain.test.mjs`.

Checker:

1. перечисляет relevant commits от cutoff до HEAD по full merge DAG;
2. читает historical blobs через Git object interface, не checkout mutation;
3. парсит Markdown real AST;
4. строит историю `§B-*`/`§A-*` id, path, heading text и commit;
5. ловит silent deletion, duplicate/reuse и broken forward/back references;
6. учитывает rename по blob/history, а merge-base diff остаётся дешёвым branch guard.

После cutoff intentional removal/reuse требует commit trailer:

```text
Knowledge-ID-Change: remove <id> — <reason>
Knowledge-ID-Change: reuse <id> — <reason and approving architecture decision>
```

Trailer разрешает изменение только если тот же commit обновляет owning business/architecture decision и все references. Без этого checker fail-closed. Тест сначала доказывается green на реальной истории cutoff→current HEAD, затем включается в `mo-qc`.

## 4.5. Temporary lossless closure map

Source of truth — два Git blobs, указанные в общей части. Closure использует два связанных уровня:

1. Appendix A этой программы немедленно фиксирует semantic inventory: каждый backlog item, каждый самостоятельный unheaded incident/wish и каждый именованный real-runs incident family получает owner и proof family.
2. Во временной spec 4 создаётся исчерпывающая AST node map, которая связывает каждый исходный paragraph/list item с semantic obligation или с его distinct evidence/context. Она не позволяет спрятать пропущенный узел внутри широкого heading range.

Во временной spec 4 размещается таблица:

```text
source locator | source digest | node role | obligation id |
owner spec/workstream | disposition | durable obligation | proof id
```

`node role` принимает только:

```text
obligation
evidence
duplicate-evidence
positive-control
superseded-workaround
```

Правила:

- `obligation` формулирует самостоятельный incident, wish или требование.
- `evidence` сохраняет отдельный reproduction, consequence или root-cause observation и ссылается на ровно один `obligation id`.
- `duplicate-evidence` не исчезает при объединении: он имеет собственный locator/digest и canonical `obligation id`.
- `positive-control` сохраняет успешный контрольный опыт и связывает его с проверяемым invariant.
- `superseded-workaround` сохраняет исторический workaround и proof того, каким итоговым contract он заменён.
- Ни одна роль не является disposition закрытия. Каждый node всё равно должен вести к durable obligation и executable proof либо к принятому architecture rejection.
- Один широкий heading или line range не считается lossless map row для содержащихся в нём разных AST nodes.

`source locator` вычисляется из `blob id + path + heading ancestry + AST node ordinal`, а digest — из normalized содержимого конкретного node. Line locators в Appendix A — human-readable index к frozen blob; executable map пересчитывает их в AST locators и не использует номера строк как identity.

Inventory включает каждый самостоятельный heading, paragraph и list item после `## Открыто`, включая девять sibling `##` sections, unheaded bullets первого real-runs section и дубли later runs.

`tests/backlog-closure.test.mjs` является временным consumer карты и доказывает биекцию:

```text
каждый source node → ровно одна map row
каждая map row → существующий source node
каждый obligation → owner + durable obligation + proof id
каждый evidence/context node → ровно один obligation id
каждый adopted obligation → executable proof
каждый duplicate → canonical obligation + distinct evidence locator
каждый superseded workaround → replacement contract + proof
ни один heading range не поглощает немаппированные дочерние nodes
```

Фиксированное ожидаемое число nodes запрещено: parser сравнивает полное множество. Во время программы map обновляется вместе с increment. В final deletion commit временный test/map/spec удаляются; постоянная `docs/acceptance.md` сохраняет только program provenance commit/blob и obligation-level proofs, не incident registry.

## 4.6. Dispositions

Разрешены:

```text
implemented
merged-duplicate
architecture-rejected
upstream-fixed
public-workaround-proven
```

`reported-upstream`, `documented`, `not-reproduced` и `not-blocking` не закрывают row сами по себе. `merged-duplicate` сохраняет собственный evidence locator и указывает canonical owner. `architecture-rejected` требует owner ADR/business rationale и acceptance proof выбранной границы.

## 4.7. Final migration

После specs 1–3:

1. выполнить closure bijection на source blobs;
2. перенести устойчивые business/architecture/papercut знания;
3. переместить полезные raw review studies в `docs/references/code-review/` как ненормативный archive либо, по явному user decision, оставить за пределами repository;
4. удалить `docs/backlog-issues-real-runs.md`;
5. оставить в `docs/backlog.md` заголовок/schema и пустой `## Открыто`;
6. изменить существующий test, который требует non-empty backlog, на schema/future-entry validation;
7. удалить temporary closure map/test/program specs после user merge approval;
8. выполнить final proof на deletion SHA.

Future real deferral снова записывается обычной полной backlog entry с причиной, impact и next step. Live mismatch во время closure становится новой полной entry либо upstream issue + capability-boundary row; канал обратной связи не удаляется.

## 4.8. Final machine-checkable Definition of Done

На одном full SHA:

- `docs/backlog.md` содержит zero substantive AST nodes под `## Открыто`;
- `docs/backlog-issues-real-runs.md` и temporary closure artifacts отсутствуют;
- до удаления временный closure test доказал полную AST bijection обоих frozen blobs;
- semantic inventory Appendix A и executable AST map покрывают unheaded bullets, headings, paragraphs, list items, duplicates, positive controls и superseded workarounds;
- ни один source node не закрыт только принадлежностью к широкому heading range;
- все links/knowledge ids разрешимы;
- historical-id, source-anchor, generated-anchor и symbol-purpose gates проходят;
- `make mo-qc` проходит без mutation;
- все required live E2E specs 1–3 прошли на этом SHA либо имеют допустимый documentation carry-forward;
- два vendor-diverse reviewers дали `PASS` на этом SHA;
- review acceptance доказывает stage order, portable P0–P3 semantics, mode escalation и TUI/report projection identity;
- Orca acceptance содержит отдельный proof для stale account cache после свежего provider-native auth;
- scan не находит `mo-reuse`, Herdr/Paseo support, private transcript transport, workflow engine/general state store или orphaned program artifact;
- acceptance map содержит program provenance и реальные obligation-level proof commands/artifacts;
- никакой row не закрыт только upstream issue или временным непроверенным workaround.

## 4.9. Acceptance и evals

- AST fixtures: nested headings, sibling `##`, paragraphs, lists, duplicate text, reordered nodes, malformed map;
- node-role fixtures: unheaded obligation, evidence, duplicate-evidence, positive-control, superseded-workaround и запрещённый orphan context;
- range-loss fixture доказывает, что heading-level row не поглощает немаппированные child nodes;
- Git-history fixtures: rename, merge DAG, silent deletion, semantic reuse, valid/invalid trailer;
- build fixtures: anchor removal only, punctuation/Unicode/inline code, malformed anchor;
- ESLint/JSDoc fixtures для exported symbols;
- end-to-end closure test на frozen source blobs до deletion;
- Qwen runs для skill changes в spec 4 не обязательны, если изменяются только deterministic tooling/docs; если меняется instruction-bearing skill, применяются 2–3 bounded cases общего contract.

## 4.10. Rejected/deferred

- Permanent closure manifest/receipt/baseline отклонён.
- Regex Markdown parsing отклонён.
- Silent deletion сырого ledger без bijection отклонён.
- Heading-only inventory как замена node-level bijection отклонён.
- Самостоятельный custom shell parser отклонён без доказательства отсутствия mature tool/config.
- Upstream issue как самостоятельное закрытие дефекта отклонён.

## 4.11. Open questions

Нет. Выбор сохранить или не коммитить raw research не влияет на normative design; default этой spec — ненормативный archive в `docs/references/code-review/`.

# 5. Decision ledger

## Adopted

| Decision | Rationale | Source |
| --- | --- | --- |
| Council spec review выполняют GPT-5.6 Sol/high и Claude Opus 1M/high | это явно выбранные и health-checked judges | judges |
| Четыре specs, девять internal workstreams | сохраняет coverage без бюрократии | four-spec-packaging; synthesis |
| Только Orca | пользователь прекратил поддержку Herdr/Paseo | backend-scope |
| `find-reuse` portable, invocation/destination external | reusable skill не должен знать Meta-O methodology | find-reuse |
| Existing `senior-python`/`senior-jsts` — input | создание уже выполнено пользователем | senior-skills |
| Текущий backlog закрывается losslessly до пустого | удаление без proof скрывает работу | backlog-goal |
| Durable good/bad behavior становится business requirements | будущие review не должны повторять интервью | durable-behavior-intent |
| Qwen/OpenCode orchestration — business capability | monitoring turns не должны расходовать subscription tokens | local-qwen-business-intent |
| Evals всех skills embedded и bounded | нужны representative proofs без большой eval subsystem | all-skill-evals; bounded-skill-evals |
| Orchestrator eval critical, остальные desirable | соответствует стоимости/риску ролей | bounded-skill-evals |
| Все P3 доходят executor; нет отдельного P3-round | не терять findings и не плодить бессмысленный loop | review-p3-policy |
| Два final `PASS` на одном SHA | действующий proof contract | §B-PROOF-02/03, §B-REVIEW-03 |
| Upstream issue — provenance, не closure | issue не доказывает работающий результат | council synthesis |
| Temporary AST bijection, no permanent registry | даёт lossless migration без нового state layer | council synthesis/premortem |
| `fast|deep|follow_up` — coverage profiles одного evidence contract | mode не должен ослаблять causality, severity, evidence или same-SHA proof | spec-review-R1 |
| Initial lifecycle review — `deep`, remediation — `follow_up`, `fast` — advisory/explicit standalone | превращает enum в проверяемую Meta-O orchestration policy | spec-review-R1; review research |
| P0–P3 определены в portable core отдельно от confidence | все consumers должны одинаково понимать severity, а confidence не заменяет evidence | spec-review-R1; senior skills |
| TUI summary — точная проекция authoritative `worker_done`, связанная через `Review-Execution` | пользователь видит краткий результат без второго источника истины | spec-review-R1; real-runs TUI incident |
| Fresh native auth и stale Orca account cache разрешаются freshness check и exact live launch | cached `missing-credentials` не доказывает отсутствующую авторизацию | real-runs 2026-08-24 line 22; spec-review-R1 |
| Closure использует semantic inventory плюс executable AST node bijection | headings недостаточно: unheaded incidents и distinct evidence должны иметь собственные locators | spec-review-R2; backlog-goal |
| Evidence, duplicates, positive controls и superseded workarounds сохраняются как node roles, а не dispositions | контекст не теряется, но не превращается в отдельный backlog или постоянный state | spec-review-R2; project contract |

## Rejected or deferred

| Decision | Status | Rationale | Source |
| --- | --- | --- | --- |
| Девять самостоятельных spec documents | rejected | overhead больше изменяемых skills | user feedback |
| Новая отдельная eval spec/platform | rejected | требование встраивается в предметные specs | user feedback |
| 2×2 review ensemble и forced subagents | deferred | нужна differential eval evidence | research/council |
| Numeric review-round cap | rejected | расходится с state-based settlement | business hierarchy |
| Meta-O Orca proxy | rejected | skills-first и native CLI contract | §A-ORCHESTRATION-01 |
| Permanent backlog closure manifest | rejected | нет постоянного consumer/value | project contract |
| Heading-only closure inventory | rejected | теряет unheaded bullets и distinct evidence внутри многосоставных sections | spec-review-R2 |
| Herdr/Paseo compatibility | rejected | явное scope decision | backend-scope |

# 6. Program risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Укрупнение specs теряет incident | semantic inventory + AST node bijection + raw proposals/reviews/premortem as review input |
| Portable skill снова протекает Meta-O vocabulary | portability scan + external consumer contract |
| Exact command в adapter устаревает | executable fixture/live probe + `last_verified`, failure → `unknown` |
| Qwen проходит happy path, но ломает authority | fake-Orca regressions + three consecutive invariant-clean runs + one live E2E |
| Upstream Orca gap маскируется workaround | capability boundary, issue + proven public workaround only |
| P3 fix invalidates reviewed SHA | один общий final same-SHA gate после всех изменений |
| Knowledge-history gate ломается на старой истории | explicit cutoff + prove green before activation |
| Closure artifacts становятся вечным registry | temporary consumer and required deletion in final DoD |
| Heading-level map скрывает несколько разных incidents или wishes | каждый AST node получает role, obligation id и proof; range-loss fixture запрещает поглощение children |
| Дубликаты удаляются вместе с контекстом повторного инцидента | один canonical obligation, но distinct `duplicate-evidence` locator/digest для каждого повторения |
| `fast` или `follow_up` превращается в способ сократить обязательное proof | общий evidence/severity contract, initial `deep`, in-place escalation и mode fixtures |
| TUI и Orca снова показывают разные verdicts | единый report `Projection`, opaque `Review-Execution`, mismatch → `UNKNOWN` |
| Stale Orca account cache ошибочно вызывает re-login или model fallback | timestamp freshness, provider-native auth и один exact approved live launch probe |

# 7. Program open questions

Нет unresolved user decisions, способных изменить четыре architecture tracks. Implementation может уточнять command syntax и fixture mechanics в пределах заданных contracts; изменение ownership, authority или business meaning возвращается пользователю.

# Appendix A — Current-source coverage map

Appendix является semantic inventory, а не заменой executable AST bijection из spec 4.

Locator `RR:L<n>` указывает строку frozen blob `c75859372fa7d794269cc6dcc8834c069ddd8096`. Диапазон у именованного incident family сохраняет human-readable группировку, но каждый Markdown node внутри диапазона получает отдельную строку во временной AST map. Повторные incident families сохраняются отдельными evidence locators, даже если ведут к одному obligation.

## `docs/backlog.md`

| Source entry | Owner | Closure proof |
| --- | --- | --- |
| Watchdog с локальной моделью | Spec 3 | §3.8 experiment + §3.10 acceptance + §A-WATCHDOG-02 adopt/reject |
| Цепочка id только до модуля | Spec 4 | §4.2 ESLint/JSDoc gate + explicit shell boundary |
| Якоря не снимаются при сборке | Spec 4 | §4.3 AST transform byte/semantic fixtures |
| Удаление/переиспользование id не ловится | Spec 4 | §4.4 full-history cutoff gate |
| Реальный запуск review не прошёл | Specs 2–3 | pair/session/recovery/live E2E |
| Про ревью / ещё про ревью | Specs 1–2 | evidence-first core, defined modes/severity, deferred ensemble eval, pair settlement |
| Ссылки на findings в code comments | Specs 1–2 | purpose/reference policy fixture |
| Быстрое ревью | Spec 2 | bounded advisory executor self-review with `fast → deep` escalation |
| Review skill overtrigger | Specs 1–2 | explicit-invocation negative eval |
| Названия tabs/panels | Specs 2–3 | stable owned role titles, foreign-tab preservation |
| Verbosity reviewers | Spec 2 | full `worker_done` + formally linked brief TUI projection |
| Model capacity message | Spec 3 | deterministic watchdog pattern + recovery scenario |
| Real-runs raw ledger | Specs 2–4 | semantic inventory below + final AST bijection/deletion |

## Unheaded observations and wishes under `2026-08-24 — Marta Eval task 730873`

| Obligation | Source locator(s) | Owner | Closure proof |
| --- | --- | --- | --- |
| Native CLI syntax/version probes are authoritative and diagnostic versions do not block lifecycle | `RR:L5` | Spec 3 | command-probe fixture and exact upstream help/issue boundary |
| Large guides/context are read in bounded independent calls; truncation is not treated as complete input | `RR:L6`, `RR:L9`, `RR:L15` | Specs 2–3 | truncation fixture with separate bounded retrieval and completeness check |
| Lifecycle starts only in a verified clean `feature/*` worktree based on current `develop` | `RR:L7` | Spec 2 | branch/worktree preflight fixture |
| Auth failure in one discovery surface does not authorize credential collection or an arbitrary connector switch | `RR:L8` | Spec 2 | task-source authority fixture with typed credential boundary |
| Canonical BRIEF materialization and first tracked spec/ledger commit belong to executor | `RR:L10`, `RR:L13` | Spec 2 | first-commit ownership E2E |
| `worktree create ok` is a receipt, not proof of Git checkout/branch effect | `RR:L11`, `RR:L12` | Spec 3 | effect-confirmation fixture; ambiguous delete remains `unknown_effect` |
| Blank Orca worktree metadata requires exact Git identity verification before use | `RR:L14` | Spec 3 | same-instance/worktree plus Git metadata proof |
| Provider readiness distinguishes account projection, native auth and selected-harness launch | `RR:L16`, `RR:L17`, `RR:L20` | Spec 3 | three-surface readiness matrix |
| OpenCode auth uses probed current CLI surface; invalid `auth list` or wrapper help is not proof | `RR:L18`, `RR:L19` | Spec 3 | command/auth probe fixture |
| Role, harness, model and effort require prior user-approved configuration | `RR:L21`, `RR:L28`, `RR:L30` | Spec 3 | no-unauthorized-role/model invariant |
| Fresh Claude auth overrides only the credential inference, not the need for a real Orca launch | `RR:L22` | Spec 3 | `stale_account_cache` fixture and exact approved live launch |
| Exact model ID and requested/effective effort must match; floating alias is insufficient | `RR:L23`, `RR:L31`, `RR:L33` | Spec 3 | model catalog plus `launch.requested == launch.effective` |
| `ready/input_accepted` and terminal existence do not prove discoverable real harness/task consumption | `RR:L24`, `RR:L25` | Spec 3 | composed-start false-positive fixture |
| Bare shell cannot fabricate an accepted lifecycle completion | `RR:L26` | Spec 3 | process identity/capability-bound `worker_done` fixture |
| Readiness probes must not create six unsanctioned concurrent workers or obscure the 1 executor → 2 reviewers topology | `RR:L27`, `RR:L28` | Spec 3 | bounded one-at-a-time health probe and role-count E2E |
| `worker-stop` is not resource release; cleanup needs exact inventory confirmation | `RR:L29` | Spec 3 | stop/release/already-absent cleanup fixture |
| A blocking waiter needs a recoverable public handle or idempotent reconnect behavior | `RR:L32` | Spec 3 | `waiter_exists`/lost-client recovery fixture |
| Bundled model discovery script is an explicit preflight dependency, not hidden optional knowledge | `RR:L34`, `RR:L35` | Specs 2–3 | skill inventory/model-selection fixture |
| Orchestrator does not edit task, ledger, business or delivery artifacts | `RR:L36` | Spec 3 | Qwen role-ownership invariant |
| First actually running executor replacement receives initial `/goal`, not an ordinary follow-up | `RR:L37` | Spec 2 | failed-first-launch/replacement initial-delivery fixture |

## Named real-run incident families

| Obligation | Source locator | Node role | Owner | Closure proof |
| --- | --- | --- | --- | --- |
| Define authoritative ordinary/UI/Orca question channels and preserve both backend acceptance paths | `RR:L39-L45` | obligation + evidence | Spec 3 | ordinary and UI question/reply E2E; no silent harness-setting change |
| Detect completed idle executor before status claims and resume bounded supervision after user turns | `RR:L47-L68` | obligation + distinct evidence | Spec 3 | early wakeup, start-of-turn state check, cadence and delivery fixtures |
| Orchestrator role cannot be overwritten by an injected executor task | `RR:L69-L76` | obligation + evidence | Spec 3 | role-conflict fail-closed and Qwen ownership fixture |
| Direct user input contaminating executor requires fenced exact replacement | `RR:L77-L82` | obligation + evidence | Spec 3 | addressing/authority/replacement and idempotent cleanup fixture |
| Executor remains a real hot assigned role throughout remediation, not an empty standby TUI | `RR:L83-L89` | obligation + evidence | Specs 2–3 | 1 executor + 2 reviewer lifecycle; queued-vs-active dispatch proof |
| Stopping current review churn is distinct from completing the specification | `RR:L90-L95` | obligation + evidence | Spec 2 | settlement/completion state-transition fixture |
| Failed Codex resume with duplicate posture flags leaves no unowned visible tab | `RR:L96-L101` | obligation + evidence | Spec 3 | wrapper posture and exact failed-start cleanup fixture |
| Ready `worker_done` must wake coordinator without a user ping | `RR:L102-L108` | duplicate-evidence of wakeup obligation | Spec 3 | turn-persistent wait E2E |
| Claude quota does not leave an apparently working reviewer forever | `RR:L109-L115` | obligation + evidence | Spec 3 | typed quota/reset/same-session recovery |
| Delivery batch is processed before acknowledgment and is not acknowledged twice | `RR:L116-L120` | obligation + evidence | Spec 3 | batch/ack idempotency fixture |
| Review progress is state-based; iteration accounting does not reset after remediation | `RR:L121-L127` | obligation + evidence | Spec 2 | no numeric cap/reset fixture |
| Compaction is observable and forces reread of file-backed role contracts | `RR:L128-L137` | obligation + evidence | Spec 3 | typed compaction and post-compact reload fixture |
| TUI final is a diagnostic projection of authoritative `worker_done` | `RR:L138-L146` | obligation + positive control | Specs 2–3 | `Review-Execution`/`Projection` identity E2E |
| Low-level injected hot workers need terminal-level retention ownership when Dispatch retention is unavailable | `RR:L147-L152` | obligation + evidence | Spec 3 | capability-bound retention fixture |
| Defensive review refusal distinguishes `input_blocked` from `output_blocked_after_work` | `RR:L153-L161` | obligation + evidence | Specs 1–3 | typed refusal, same-attempt recovery and `UNKNOWN` settlement |
| Repeated `worker-retain dispatch_not_found` preserves every affected executor/reviewer context as distinct evidence | `RR:L162-L173` | duplicate-evidence of retention obligation | Spec 3 | repeated cross-role retention fixture |
| Durable mailbox success is distinct from coordinator wakeup/cadence | `RR:L174-L186` | obligation + positive control | Spec 3 | FIFO delivery, early wakeup, timeout and replay fixtures |
| `worker_done` is complete, byte-safe and contains no hidden `reportPath` appendix | `RR:L187-L193` | obligation + evidence | Spec 3 | `--body-file`/stdin byte-roundtrip and report-completeness fixture |
| Endless `Reconnecting…` is distinct from progress and supports bounded same-task recovery | `RR:L194-L201` | obligation + evidence | Spec 3 | typed reconnect/resume fixture |
| `dispatch-show` exact syntax is probed, documented and diagnostic on misuse | `RR:L202-L207` | obligation + evidence | Spec 3 | native command probe/upstream capability proof |
| Work packages, reviewable slices, locally implemented work and external gates remain separate | `RR:L208-L215` | obligation + evidence | Spec 3 | outcome map and gate-semantics fixture |
| Claude subscription limit is a typed per-Dispatch wait, not inferred only from TUI | `RR:L216-L223` | obligation + evidence | Spec 3 | quota/reset public-surface E2E |
| Ordinary coordinator follow-up does not use undocumented `--type normal` | `RR:L224-L229` | obligation + evidence | Spec 3 | native enum/help fixture |
| Successful follow-up receipt does not prove worker consumption | `RR:L230-L236` | obligation + evidence | Spec 3 | pending-follow-up/consumption barrier fixture |
| Full SHAs are copied and verified, never reconstructed from memory | `RR:L237-L243` | obligation + evidence | Specs 2–3 | `git cat-file`/range verification fixture |
| Reviewer cannot background or overlap full QC | `RR:L244-L251` | obligation + evidence | Spec 2 | foreground completion and QC isolation fixture |
| Output filtering after completed review work becomes typed lifecycle state | `RR:L252-L258` | duplicate-evidence of refusal obligation | Spec 3 | `output_blocked_after_work` fixture |
| Reap test/process cleanup must remain hermetic even under foreground QC | `RR:L259-L265` | obligation + corrective evidence | Specs 2–3 | process namespace/descendant cleanup fixture |
| Neutral safe-summary retry is not assumed reliable; structured fallback is bounded | `RR:L266-L275` | obligation + positive control + superseded workaround | Spec 3 | native typed escalation target; schema fallback fixture |
| Unsupported `coordinator_guidance` type yields actionable enum diagnostics | `RR:L276-L282` | duplicate-evidence of message-type obligation | Spec 3 | invalid-type error contract fixture |
| Executor leaves no untracked background terminal/process after final QC | `RR:L283-L289` | obligation + evidence | Spec 3 | owned-resource final inventory |
| Vendor-diverse reviewers cannot run host-sensitive full QC concurrently | `RR:L290-L296` | duplicate-evidence of QC isolation obligation | Spec 2 | QC mutex fixture |
| Destructive restore validates exact effect ordering before mutation | `RR:L297-L303` | obligation + evidence | Spec 3 | preflight/backup/effect-confirmation fixture |
| Discovery origin and pinned egress inventory mismatch fails closed before external calls | `RR:L304-L310` | obligation + evidence | Spec 3 | same-instance/origin authority fixture |
| Long-poll `runtime_unavailable` with a live runtime recovers without restarting workers | `RR:L311-L317` | obligation + evidence | Spec 3 | idempotent reconnect/FIFO replay fixture |
| Infra-blocked mandatory phase cannot report whole-task success | `RR:L318-L324` | obligation + evidence | Spec 3 | outcome truthfulness fixture |
| Diagnostic commands account for implicit side effects before execution | `RR:L325-L332` | obligation + evidence | Spec 3 | zero-budget side-effect preflight fixture |
| Known duplicate posture failure is applied, not rediscovered through repeated launches | `RR:L333-L343` | duplicate-evidence of wrapper posture obligation | Spec 3 | wrapper/PATH regression fixture |
| Composed Codex start cannot fall through to shell and fabricate success | `RR:L344-L351` | duplicate-evidence of process-identity obligation | Spec 3 | real harness/process validation |
| Expired Dispatch capability separates accepted content from rejected settlement and deduplicates retries | `RR:L352-L358` | obligation + evidence | Spec 3 | per-event capability revocation fixture |
| Executor cannot delete neighboring project containers/resources | `RR:L359-L367` | obligation + evidence | Spec 3 | exact destructive allowlist invariant |
| Authority envelope must be exact enough to permit required live work without broad unsafe prohibition | `RR:L368-L395` | obligation + evidence | Spec 3 | bounded authority/effect-plan fixture |
| Durable product decision gate cannot be skipped after local implementation | `RR:L396-L414` | obligation + evidence | Specs 2–3 | business-intent harvest and outcome truthfulness |
| Repeated closure of hot reviewer tabs preserves separate recurrence evidence | `RR:L415-L445` | duplicate-evidence of hot-session obligation | Spec 2 | hot pair retained through `PASS+PASS` |
| Fresh Claude TUI input must be empty before injection | `RR:L446-L468` | obligation + evidence | Spec 3 | prompt-state readiness/PTY reproduction |
| Heartbeat promise is not a calibrated liveness threshold | `RR:L469-L491` | obligation + corrective evidence | Spec 3 | wall-clock/native-activity liveness fixture |
| Monitor seeds current state before reporting change | `RR:L492-L512` | obligation + three duplicate reproductions | Spec 3 | seed-before-alert fixture |
| `latest cursor` is not direct TUI liveness evidence | `RR:L513-L536` | obligation + corrective evidence | Spec 3 | direct-signal classifier fixture |
| Quota/reset unavailable on public Dispatch surface remains `unknown`, not transcript inference | `RR:L537-L569` | obligation + evidence | Spec 3 | public account/lifecycle capability proof |
| Provider transcript reset time is non-authoritative; account-level surface is preferred but insufficient alone | `RR:L570-L602` | evidence + superseded workaround | Spec 3 | transcript exclusion and account-to-Dispatch binding fixture |
| Lost coordinator pane requires public authorized Run takeover | `RR:L603-L629` | obligation + evidence | Spec 3 | coordinator takeover E2E |
| Replacement Claude reviewer cleanup preserves accepted result and removes superseded exact tab | `RR:L630-L664` | obligation + evidence | Specs 2–3 | replacement bookkeeping and exact cleanup E2E |

## Duplicate obligations retained with distinct evidence

| Canonical obligation | Distinct source evidence |
| --- | --- |
| Wake coordinator on lifecycle event | `RR:L47-L68`, `RR:L102-L108`, `RR:L174-L186` |
| Preserve hot executor/reviewer sessions through the loop | `RR:L67`, `RR:L83-L89`, `RR:L147-L173`, `RR:L415-L445` |
| Reject bare-shell/fabricated completion | `RR:L24-L26`, `RR:L344-L351` |
| Do not duplicate provider posture flags | `RR:L96-L101`, `RR:L333-L343` |
| Distinguish quota from working/lost | `RR:L109-L115`, `RR:L216-L223`, `RR:L537-L602` |
| Distinguish refusal stages and complete settlement | `RR:L153-L161`, `RR:L252-L258`, `RR:L266-L275` |
| Serialize and isolate full QC | `RR:L244-L251`, `RR:L259-L265`, `RR:L283-L296` |
| Require effect/consumption confirmation, not receipt | `RR:L11-L12`, `RR:L29`, `RR:L58-L60`, `RR:L230-L236`, `RR:L297-L303` |
| Calibrate monitoring only on direct validated signals | `RR:L47-L68`, `RR:L469-L536` |
| Clean only exact owned replacement resources | `RR:L29`, `RR:L77-L82`, `RR:L96-L101`, `RR:L630-L664` |

## Research and prior council artifacts

| Input | Preserved decision surface |
| --- | --- |
| `review-deep-research-1.md` | §1.9 staged review, evidence/falsification, concrete mode semantics, §1.11 ensemble hypothesis |
| `review-deep-research-2.md` | portable skill shape, false-positive control, bounded experiment |
| `review-deep-research-3.md` | deterministic grounding, specialization hypothesis, adversarial verification deferred to eval |
| proposals/reviews R0–R3 | four-spec body, Decision ledger, rejected/deferred choices |
| both premortems | Program risks, fail-closed coverage, temporary AST bijection |

Focused spec reviewers получают этот документ целиком вместе с frozen user decisions. Их задача — проверить не только внутреннюю полноту, но и отсутствие потерь относительно перечисленных prior artifacts; повторная свободная generation не выполняется.