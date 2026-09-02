# Программа спецификаций для обнуления backlog Meta-O

## Краткое решение

Программа состоит из восьми независимо реализуемых спецификаций: переносимый `find-reuse`, lifecycle intent/spec, evidence-first review core, Meta-O policy и документированные Orca workarounds, upstream Orca issues/capabilities, knowledge integrity gates, watchdog evaluation и lossless closure. Дефект Orca не обязан блокировать всю программу: согласно `§B-PORTABILITY-06`, пункт может быть закрыт либо upstream fix, либо локальным временным обходом, который использует только документированную публичную native-поверхность, имеет заведённый upstream issue, live acceptance и явный критерий удаления.

Обозначения:

- `[R]` — установленное требование;
- `[D]` — архитектурное решение этой программы;
- `[H]` — проверяемая гипотеза.

---

# 1. Архитектура программы

## 1.1. Спецификации и владельцы

| Спецификация | Владелец | Канонический источник | Результат |
|---|---|---|---|
| `SP-01-find-reuse` | автор portable skills | `src/skills/find-reuse/` | независимый reuse research |
| `SP-02-intent-spec-lifecycle` | методология Meta-O | `shared/references/methodology.md`, `mo-orchestrate-orca` | spec materialization, verbatim intent, progress и интеграция reuse |
| `SP-03-review-core` | review methodology | compact review core, `review-protocol.md`, `mo-review-orca` | evidence-first review и evaluation |
| `SP-04-meta-o-orca-policy` | Meta-O | `orca-mechanics.md`, orchestration skills, E2E | работа поверх текущей public Orca surface и временные workarounds |
| `SP-05-orca-upstream` | Orca maintainers и Meta-O reporter | upstream issues, Orca native surface | воспроизводимые issues и предпочтительные upstream fixes |
| `SP-06-knowledge-integrity` | Meta-O QC | architecture/build/lint/tests | purpose, anchors и full-history ID gates |
| `SP-07-watchdog-evaluation` | Meta-O watchdog | watchdog ADR, fixtures, evaluation | capacity regression и local-model go/no-go |
| `SP-08-backlog-closure` | maintainer Meta-O | acceptance и historical closure index | lossless inventory, архив и очистка backlog |

## 1.2. Два допустимых пути закрытия Orca-дефекта

```text
Observed Orca defect
        │
        ├─► reproduce ─► upstream issue ─► upstream fix ─► public E2E ─► close
        │
        └─► reproduce ─► upstream issue ─► documented public workaround
                                      └─► live E2E + removal trigger ─► close
```

Локальный workaround не является заменой upstream issue. Он допустим только при одновременном выполнении условий:

1. issue заведён в upstream Orca на английском;
2. ссылка находится рядом с workaround;
3. используются только public native Orca commands и version-matched `orchestration` companion;
4. private transcript, provider database и Meta-O proxy не используются;
5. workaround выполняет исходный backend contract, а не ослабляет его;
6. есть normal и failure-path tests;
7. определён public probe, после которого workaround удаляется;
8. если workaround не может обеспечить обязательную capability, Orca остаётся unsupported для этого запуска.

Открытый upstream issue после принятого workaround не остаётся локальным backlog: владельцем дальнейшего исправления становится upstream issue. Локальная обязанность удаления выражена рядом с workaround и проверяется при наблюдаемом изменении поведения, без version matrix.

## 1.3. Зависимости

```text
SP-01 find-reuse ───► SP-02 intent/spec lifecycle ───────────────┐
                                                                │
SP-03 review core ──► SP-04 local Orca policy/workarounds ───────┤
                         ▲                 │                     │
SP-05 upstream issues ───┘                 └─► live E2E ─────────┤
                                                                ├─► SP-08 closure
SP-06 knowledge integrity ──────────────────────────────────────┤
SP-07 watchdog evaluation ──────────────────────────────────────┘
```

`SP-04` не ждёт upstream release, если публичный workaround проходит backend contract. Upstream fix становится блокером только там, где ни одна документированная public Orca surface не может обеспечить обязательную capability.

## 1.4. Запрещённые конструкции

[R] Не создаются:

- Meta-O workflow engine или FSM;
- general state store/run registry;
- provider или Orca proxy;
- private transcript reader;
- tracked runtime receipt/review database;
- compatibility alias `mo-reuse`;
- поддержка Herdr/Paseo.

Допустимы:

- temporary specification и progress checklist;
- human-readable current-run evidence;
- permanent historical closure index;
- colocated workaround contract со ссылкой на upstream issue.

---

# 2. `SP-01-find-reuse`

## 2.1. Граница

`mo-reuse` переименовывается в `find-reuse`. Новый skill не знает:

- путей Meta-O;
- layout specification;
- Git branch/commit policy;
- места сохранения результата;
- момента вызова;
- orchestration lifecycle.

Он получает generic business requirements и возвращает исследовательский отчёт.

## 2.2. Артефакты

- `src/skills/find-reuse/SKILL.md`;
- `references/search-process.md`;
- `references/source-adapters.md`;
- `references/candidate-identity.md`;
- `references/quality-gates.md`;
- удаление `src/skills/mo-reuse/`;
- build/install/README migrations;
- generated `skills/find-reuse/`;
- portability tests.

`senior-python` и `senior-jsts` считаются существующими входами.

## 2.3. Вход

```ts
type FindReuseRequest = {
  problem: string;
  business_requirements: Requirement[];
  constraints: {
    languages?: string[];
    runtimes?: string[];
    platforms?: string[];
    package_managers?: string[];
    allowed_licenses?: string[];
    forbidden_licenses?: string[];
    security?: string[];
    performance?: string[];
    integration?: string[];
    forbidden_approaches?: string[];
  };
  repository_root?: string;
  query_seeds?: string[];
  depth?: "normal" | "deep";
};

type Requirement = {
  id: string;
  text: string;
  priority: "must" | "should" | "could";
};
```

## 2.4. Выход

```ts
type FindReuseReport = {
  status: "reuse" | "extend" | "build" | "unknown";
  coverage: SourceCoverage[];
  queries: QueryEvidence[];
  candidate_families: CandidateFamily[];
  decision: string;
  rejected_alternatives: RejectedCandidate[];
  residual_unknowns: string[];
};

type SourceCoverage = {
  source: string;
  applicability: "required" | "applicable" | "not_applicable";
  status:
    | "searched"
    | "missing_tool"
    | "missing_auth"
    | "rate_limited"
    | "unavailable"
    | "skipped_not_applicable";
  recovery_instruction?: string;
};

type CandidateFamily = {
  family_id: string;
  repository?: RepositoryCandidate;
  packages: PackageCandidate[];
  requirement_fit: Array<{
    requirement_id: string;
    fit: "full" | "partial" | "none" | "unknown";
    evidence: string;
  }>;
  provenance: CandidateProvenance[];
  signals: {
    releases: EvidenceValue;
    maintenance: EvidenceValue;
    adoption: EvidenceValue;
    downloads: EvidenceValue;
    security: EvidenceValue;
    license: EvidenceValue;
    integration_cost: EvidenceValue;
  };
};
```

Результат — Markdown с обязательными секциями. Skill не делает commit и не выбирает destination.

## 2.5. Adapter contract

```ts
interface SearchAdapter {
  descriptor(): AdapterDescriptor;
  probe(): ProbeResult;
  authProbe(scope: SearchScope): AuthResult;
  search(query: CapabilityQuery, limit: number): CandidateStub[];
  enrich(candidate: CandidateStub): CandidateSignals;
}

type AdapterDescriptor = {
  id: string;
  ecosystems: string[];
  capabilities: Array<
    "semantic_search" |
    "name_search" |
    "exact_lookup" |
    "downloads" |
    "releases" |
    "maintenance" |
    "reverse_dependencies" |
    "security"
  >;
  required_tools: string[];
  auth_required_for: Array<"public" | "private" | "publish">;
};
```

Ошибки `missing_tool`, `missing_auth`, `rate_limited`, `unavailable`, `malformed_response` и `unsupported_query` отражаются в coverage. Пустая выдача не заменяет ошибку.

## 2.6. Экономичное ядро

Каждый запуск использует:

1. local repository;
2. GitHub и GitLab, если применимы и готовы;
3. registry только для detected ecosystems;
4. optional adapters только по scope.

Все registries поддерживаются каталогом, но не запускаются одновременно.

## 2.7. Coverage matrix

| Источник | Probe/auth | Capability query | Enrichment |
|---|---|---|---|
| Local repository | `rg --version` | `rg --files`; manifests/lockfiles; `rg -n -- "$QUERY"` | dependency versions, existing abstractions, local constraints |
| GitHub | `gh --version`; `gh auth status`; recovery `gh auth login --web` | `gh search repos "$QUERY" --sort stars --order desc --archived=false --limit 30 --json fullName,description,stargazersCount,forksCount,pushedAt,updatedAt,license,url,isArchived` | repository API, releases, contributors, advisories при доступности |
| GitLab | `glab --version`; `glab auth status`; recovery `glab auth login --hostname gitlab.com` | `glab api projects --method GET -f search="$QUERY" -f order_by=star_count -f sort=desc -f simple=true -f per_page=30 -f archived=false` | project, releases, tags, activity |
| npm | `npm --version`; private registry: `npm whoami --registry "$REGISTRY"` | `npm search "$QUERY" --json --searchlimit=30 --prefer-online` | `npm view ... --json`; npm downloads API |
| PyPI | `python3 --version`; `python3 -m pip --version` | hosting queries с `language:Python`; Simple JSON только для normalized name tokens | `pip index versions`; PyPI JSON; pypistats |
| crates.io | `cargo --version` | `cargo search "$QUERY" --limit 30` | `cargo info`; crate API; reverse dependencies |
| Go | `go version` | hosting queries и pkg.go.dev search | `go list -m -json -versions`; repository signals |
| Maven Central | `curl --version` | Solr API с `--data-urlencode "q=$QUERY"` | exact group/artifact, versions, timestamps |
| NuGet | `curl --version` | NuGet search endpoint | registration metadata и downloads |
| RubyGems | `gem --version` | `gem search --remote "$QUERY" --all` | gem API и reverse dependencies |
| Packagist | `composer --version` либо `curl` | Composer/Packagist search | repository, versions, downloads, favers |

PyPI не объявляется semantic search API. Semantic candidates приходят из hosting queries; registry используется для name/exact verification и metrics.

Optional adapters: Codeberg/Gitea, Bitbucket, Swift Package Index, Hex, pub.dev, Conan/vcpkg и private registries.

## 2.8. Установка и auth

Skill не устанавливает tools и не выполняет login. Он:

1. определяет platform/package manager;
2. показывает одну точную install recipe;
3. показывает official installation route;
4. показывает точную auth command;
5. повторно считает источник готовым только после успешного probe;
6. при отсутствии обязательного источника возвращает `unknown`.

## 2.9. Поиск и dedup

Процесс:

1. literal capability query;
2. domain synonyms/protocol names;
3. ecosystem-specific query;
4. broad candidate union;
5. identity normalization;
6. enrichment 10–15 finalists;
7. must-requirement verification;
8. integration-cost comparison;
9. `reuse`, `extend`, `build` либо `unknown`.

```text
repo:<host>:<numeric-project-id>
repo-url:<normalized-canonical-url>
pkg:<ecosystem>:<normalized-name>
family:<canonical-repository-identity>
```

Forks, mirrors и monorepo packages не схлопываются без authoritative evidence. Package и repository связываются `published_from`. Сомнительное соответствие получает `possible_same_as`.

## 2.10. Acceptance

- `mo-reuse` удалён без alias;
- standalone invocation работает вне Meta-O;
- Meta-O paths отсутствуют;
- каждый required/applicable source имеет coverage status;
- missing tool/auth не выглядит как empty search;
- PyPI exact lookup/download fixture реален;
- cross-registry family сохраняет отдельные package identities;
- `build` содержит проверенные alternatives либо доказанное отсутствие applicable candidates;
- output не изменяет repository.

---

# 3. `SP-02-intent-spec-lifecycle`

## 3.1. Первый increment

Первый реально работающий executor создаёт один commit:

1. одна specification;
2. verbatim user ledger;
3. 3–10 outcome-level checklist items;
4. только новые durable business intents;
5. `Reuse research` или доказанное `not_applicable`.

Orchestrator не редактирует product/spec files. Replacement до первого принятого executor turn снова получает initial `/goal`.

## 3.2. Интеграция reuse

```ts
function buildFindReuseRequest(
  verbatimIntent: string,
  requirements: Requirement[],
  architectureConstraints: string[],
  repositoryContext: RepositoryContext
): FindReuseRequest;
```

Executor встраивает returned Markdown в `## Reuse research`. `unknown` блокирует только решение, зависящее от непроверенного обязательного источника.

## 3.3. Progress

Checklist живёт только в temporary spec. В backlog не записываются:

- текущий процент;
- текущий gate;
- номер review round;
- quota/reconnect конкретного запуска.

## 3.4. Удаление spec

1. durable знания перенесены;
2. implementation SHA прошёл gates;
3. spec deletion создаёт новый docs-only SHA;
4. final reviewers получают source commit и точный parent blob;
5. QC и две reviews повторяются;
6. E2E carry-forward используется только по действующему узкому правилу.

Permanent closure index `SP-08` не удаляется.

---

# 4. `SP-03-review-core`

## 4.1. Стадии

### Grounding

Reviewer читает exact SHA, intent/spec, repository instructions, diff и reachable code. History, prior PR/comments и code comments подключаются по risk trigger.

### Risk mapping

Активируются только релевантные классы: correctness, boundaries, concurrency/state, security, compatibility/data, operations и language-specific hazards.

### Discovery

Собираются candidate findings без confidence/severity cutoff. Нулевая выдача допустима.

### Verification

```ts
type EvidenceState =
  | "confirmed"
  | "supported"
  | "unproven"
  | "refuted";
```

Проверяются reachable path, guards, framework semantics, focused test/reproducer и counter-evidence.

### Causality

```ts
type ChangeCausality =
  | "introduced"
  | "exposed"
  | "pre_existing";
```

Blocking finding должен быть вызван/усилен diff либо нарушать обязательный requirement. Pre-existing issue не выдаётся за regression.

### Severity

`P0–P3` назначается после evidence. Confidence разрешён только как routing/evaluation diagnostic. Он не повышает `unproven`.

### Reporting

```ts
type ReviewVerdict = {
  contract: "meta-o.review.v1";
  candidate_sha: string;
  vendor_family: string;
  model: string;
  execution_id: string;
  mode: "fast" | "deep" | "follow_up";
  verdict: "PASS" | "FINDINGS" | "UNKNOWN";
  findings: Finding[];
  checks_run: string[];
  limitations: string[];
};
```

`PASS` с нулём findings валиден при выполненном scope. Существенный `unproven` риск означает `UNKNOWN`.

## 4.2. Modes

- `fast`: optional executor-owned clean-room advisory review;
- `deep`: две независимые vendor-diverse review executions;
- `follow_up`: новые executions на новом SHA в тех же hot sessions.

Reviewer видит собственные предыдущие findings, но не peer output. Специализированные subagents не считаются lifecycle reviewers.

## 4.3. Senior skills

`senior-python` и `senior-jsts`:

- добавляются в build/install/README contract;
- подключаются как optional language lenses;
- не становятся hard dependency `mo-review-orca`;
- не разрешают rewrite вне scope.

## 4.4. Claude plugin

Принимаются repository instructions, history/PR/comment lanes по trigger, eligibility re-check и clean no-comment result.

Отклоняются:

- расхождение «4/5 reviewers»;
- GitHub coupling;
- fixed confidence threshold;
- shallow changed-lines-only scope;
- auto-posting;
- предположение о выполненном CI;
- обязательный fan-out до evaluation.

## 4.5. QC

- один полный serialized `make mo-qc`;
- focused reviewer checks;
- disposable worktree для potentially mutating diagnostics;
- никаких параллельных process-sensitive suites;
- никаких оставленных background processes.

## 4.6. Evaluation

Сравниваются minimal core, concise core, текущий protocol, language/risk lens, verifier, specialist и two-vendor union.

Corpus:

- historical bugs;
- accepted findings;
- controlled mutations;
- clean negatives;
- 20–40 начальных cases;
- held-out subset;
- 3–5 повторов nondeterministic configuration.

Metrics:

- precision/recall;
- severity-weighted recall;
- unique validated findings;
- false positives/duplicates;
- latency/cost;
- finding retention;
- variance.

До запуска фиксируются thresholds. Начальные defaults:

- precision ≥ `0.70`;
- P0/P1 recall не хуже baseline более чем на `5 pp`;
- optional lane добавляет ≥ `10%` relative severity-weighted recall;
- cost ≤ `2×` baseline без отдельного rationale.

Ensemble/specialist hypothesis становится policy только после прохождения thresholds. Persistent findings store не создаётся. Правило «три minor rounds → PASS» запрещено.

---

# 5. `SP-04-meta-o-orca-policy-and-workarounds`

## 5.1. Поддержка определяется поведением

Meta-O не требует новой версии или обязательного `orca capabilities` command. Поддержка определяется действующим `shared/references/backend-contract.md` через:

- native `orca ... --help`;
- version-matched `orca skills get orchestration`;
- public status/worker/terminal/message surfaces;
- live normal и failure fixtures.

```ts
type CapabilityProbeResult = {
  capability: string;
  result: "pass" | "fail" | "unknown";
  public_commands: string[];
  evidence: string[];
  workaround?: WorkaroundContract;
};
```

Это current-run human-readable evidence, не tracked state.

## 5.2. Workaround contract

Каждый локальный обход оформляется рядом с точными командами в `orca-mechanics.md`:

```ts
type WorkaroundContract = {
  observed_defect: string;
  upstream_issue_url: string;
  public_surface: string[];
  applicability: string;
  procedure: string[];
  success_evidence: string[];
  failure_result: "unknown" | "needs_attention" | "unsupported";
  removal_probe: string[];
};
```

Обязательные свойства:

- upstream issue уже существует;
- команды взяты из current `--help` и version-matched companion;
- workaround не читает private transcript;
- не создаёт proxy/state store;
- содержит failure behavior;
- содержит removal probe;
- normal/failure E2E проходят.

## 5.3. Роли

Одновременно:

- один executor session;
- один review-A session;
- один review-B session.

```ts
type ActiveRole = {
  role: "executor" | "review_a" | "review_b";
  task_id: string;
  dispatch_id: string;
  terminal_id: string;
  route: {
    provider: string;
    model: string;
    effort: string;
  };
};
```

Identities берутся из native receipts. Meta-O не сохраняет отдельный run registry и управляет только exact handles текущего run.

## 5.4. Readiness

1. Git подтверждает worktree/branch/SHA.
2. `orca status --json` подтверждает нужную instance.
3. `orca skills list --json` и `orca skills get orchestration` подтверждают companion.
4. model helper получает exact IDs от provider/native source.
5. auth проверяется отдельно для каждого harness.
6. setup владеет posture/wrappers.
7. Meta-O не добавляет posture flags к bare provider command.
8. каждый harness проходит actual start probe.
9. reviewer routes vendor-diverse.

Transport `ready` и `input_accepted` сами по себе недостаточны.

## 5.5. Composed-start workaround

Для false-positive composed start:

1. вызвать documented `worker-start`;
2. проверить public worker и terminal surfaces;
3. если harness не распознан, остановить только exact failed dispatch;
4. использовать documented fallback:

```text
orca terminal create --worktree active --title <title> --command <harness-command> --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms <ms> --json
orca orchestration dispatch --task <task-id> --to <handle> --inject --json
```

5. проверить visible effective model/effort/posture;
6. сохранить low-level session hot до завершения lifecycle;
7. закрыть только exact handle после settled delivery.

Upstream issue требует, чтобы composed receipt стал truthful. Но verified public fallback позволяет не блокировать программу.

## 5.6. Hot sessions

Session и execution различаются логически, даже если текущий Orca CLI использует `dispatch`/`terminal`:

- одна execution на role одновременно;
- reviewer terminal сохраняется между rounds;
- каждый SHA получает новую bounded task/dispatch;
- первый review не получает prior/peer output;
- follow-up получает только собственный предыдущий report;
- replacement создаётся после same-session recovery attempt;
- duplicate role session запрещена;
- exact superseded handle закрывается после замены.

Если supervised worker невозможно сохранить hot, используется documented low-level terminal fallback с exact handle и upstream issue на supervised reuse.

## 5.7. Follow-up delivery workaround

Если `orchestration send` не доказывает привязку owner decision к следующему turn:

1. не принимать немедленный `worker_done` как учитывающий guidance;
2. создать новую bounded task/dispatch в той же hot terminal session;
3. включить owner decision в initial input новой execution;
4. проверить delivery тем же способом, что initial task;
5. связать новый result с новой execution.

Так Meta-O не притворяется, что модель «consumed» queued message. Upstream issue запрашивает явный delivery binding.

## 5.8. Waiting без нового durable API

Используется текущий public loop:

```text
orca orchestration check \
  --wait \
  --types worker_done,escalation,question \
  --timeout-ms <bounded-ms> \
  --json
```

Правила:

1. один foreground waiter;
2. timeout — checkpoint;
3. полный returned batch обрабатывается до следующего wait;
4. completion проверяется до heartbeat/cadence;
5. новые waits повторяются до terminal outcome;
6. polling terminal repaint/title запрещён;
7. последние `N` сообщений не заменяют полный delivery batch.

Если Orca теряет public events между вызовами, workaround не считается достаточным: требуется upstream fix либо другой public command, прошедший redelivery E2E.

## 5.9. Quota/reconnect/refusal

При отсутствии typed events используются только публичные диагностические поверхности:

- `worker-show`;
- public terminal state/read;
- public account/quota command, если он документирован companion;
- visible provider UI.

Поведение:

- exact session сохраняется;
- parallel replacement не создаётся;
- quota ведёт к ожиданию reset либо `needs_attention` на subscription boundary;
- reconnect не считается failure, пока public surface показывает существующую session;
- output refusal повторяется через новую bounded execution и минимальный structured `worker_done`;
- если working/lost невозможно различить, итог `unknown`, а backend для запуска unsupported.

Workaround не может объявить success только по terminal preview.

## 5.10. Settled response fallback

Основной путь — полный `worker_done`.

Если он сломан, `shared/references/backend-contract.md` уже разрешает public terminal read только после квалификации конкретной пары backend/harness:

- одна normal fixture;
- одна long fixture;
- один public read на fixture;
- `BEGIN`, `MIDDLE`, `END` присутствуют;
- alternate-screen boundary rows не потеряны.

При прохождении terminal read временно становится qualifying public workaround для конкретного harness. Рядом обязательно находится upstream issue. Private provider transcript и prompt «repeat your answer» не допускаются.

Если ни `worker_done`, ни квалифицированный terminal read не возвращают полный settled response, Orca unsupported и этот пункт нельзя закрыть.

## 5.11. Resource lifecycle workaround

- supervised worker: только `orca orchestration worker-release`;
- low-level fallback: сохранять exact terminal handle hot и закрывать только его;
- broad terminal/tab close запрещён;
- повторное отсутствие exact resource считается безопасным cleanup result, но не успехом основной task;
- чужие/user-owned resources не трогаются.

Uniform upstream retain/release API желателен, но не блокирует программу, если два текущих public lifecycle пути проходят E2E.

## 5.12. Coordinator recovery

При потере coordinator pane новый coordinator:

1. находит intended Orca instance;
2. читает public run/task/worker identities;
3. проверяет Git candidate SHA;
4. восстанавливает только reasoning projection;
5. продолжает waits по public mailbox;
6. не создаёт новый Meta-O state file.

Если текущая public Orca surface не позволяет однозначно восстановить run и ownership, запуск получает `needs_attention`; upstream issue остаётся обязательным. Atomic takeover — предпочтительный upstream fix, но локальное восстановление через public authoritative state достаточно для закрытия инцидента после live fixture.

## 5.13. Task semantics

```ts
type TaskKind =
  | "work_package"
  | "review_execution"
  | "remediation"
  | "gate";

type TaskOutcome =
  | { status: "completed"; evidence: string[] }
  | { status: "failed"; reason: string; evidence: string[] }
  | { status: "needs_attention"; boundary: string; evidence: string[] }
  | { status: "unknown"; reason: string; evidence: string[] };
```

Partial review stop, cleanup и external gate не означают feature completion.

## 5.14. SHA и compaction

SHA копируется из Git и проверяется:

```bash
git cat-file -e "$CANDIDATE_SHA^{commit}"
test "$(git rev-parse "$CANDIDATE_SHA^{commit}")" = "$CANDIDATE_SHA"
```

После observable context compaction worker в следующей bounded execution перечитывает `AGENTS.md`, spec, review core и candidate SHA. Если compaction невозможно наблюдать, follow-up всегда повторно передаёт эти file-backed anchors как консервативный workaround.

## 5.15. Authority envelope

```ts
type AuthorityEnvelope = {
  allowed_paths: string[];
  allowed_resources: string[];
  allowed_actions: string[];
  forbidden_effects: string[];
  approval_boundaries: string[];
};
```

Запреты узкие: нельзя удалять чужие resources, но обязательный live path не блокируется. Неизвестный destructive effect требует human boundary.

---

# 6. `SP-05-orca-upstream`

## 6.1. Цель

`SP-05` больше не означает «дождаться реализации всех изменений Orca». Его обязательный результат для каждого подтверждённого upstream defect:

1. минимальный reproducer;
2. public commands и observed/expected behavior;
3. English upstream issue;
4. ссылка рядом с local workaround;
5. предпочтительный native contract;
6. removal probe;
7. при доступном upstream fix — regression test и live E2E.

Upstream implementation может продолжаться независимо после закрытия локального backlog, если qualifying workaround уже существует.

## 6.2. Preferred native contract

Предпочтительная upstream модель:

```ts
type OrcaEvent<T> = {
  contract: "orca.lifecycle.v1";
  event_id: string;
  run_id: string;
  session_id: string;
  execution_id?: string;
  sequence: number;
  occurred_at: string;
  type: string;
  payload: T;
};
```

События:

```text
worker_working
worker_question
worker_permission
worker_quota_wait
worker_transport_reconnecting
worker_provider_refusal
worker_context_compacted
worker_done
worker_failed
worker_lost
```

`worker_done` остаётся единственным settled success response.

## 6.3. Preferred start/dispatch

```ts
type StartResult = {
  session_id: string;
  terminal_id: string;
  requested_route: Route;
  effective_route?: Route;
  agent_state:
    | "starting"
    | "detected"
    | "not_detected"
    | "auth_required"
    | "route_unavailable";
  worktree:
    | {
        status: "verified";
        path: string;
        branch: string;
        head_sha: string;
      }
    | {
        status: "not_git_worktree";
        path: string;
      };
};

type DispatchResult =
  | {
      status: "accepted";
      execution_id: string;
      input_state: "bound_to_turn";
      effective_route: Route;
    }
  | {
      status: "rejected";
      error: OrcaError;
    };
```

До `agent_state=detected` task не считается доставленной. Bare shell не может сгенерировать accepted lifecycle event.

## 6.4. Preferred delivery

```ts
type DeliveryResult = {
  message_id: string;
  session_id: string;
  execution_id?: string;
  state: "queued" | "injected" | "bound_to_turn" | "rejected";
  reason?: string;
};
```

`bound_to_turn` означает inclusion в provider input конкретной execution, а не недоказуемое понимание моделью.

## 6.5. Preferred wait

```ts
type WaitResult =
  | {
      status: "events";
      wait_id: string;
      events: OrcaEvent<unknown>[];
    }
  | {
      status: "timeout";
      wait_id: string;
      after_sequence: number;
    }
  | {
      status: "transport_reconnecting";
      wait_id: string;
      retry_after_seconds: number;
    }
  | {
      status: "runtime_lost";
      error: OrcaError;
    };
```

Требуются monotonic sequence, oldest-unacked delivery и idempotent redelivery до acknowledgement.

## 6.6. Preferred resource/takeover contract

```ts
type ReleaseResult =
  | { state: "released"; effect_applied: true }
  | { state: "already_absent"; effect_applied: false }
  | { state: "retained"; effect_applied: false };

type TakeoverResult =
  | {
      status: "accepted";
      generation: number;
      preserved_sessions: string[];
      preserved_unacked_range?: [number, number];
    }
  | {
      status: "rejected";
      error: OrcaError;
    };
```

## 6.7. Error taxonomy

```ts
type OrcaError = {
  code:
    | "E_NOT_GIT_WORKTREE"
    | "E_AGENT_NOT_DETECTED"
    | "E_ROUTE_UNAVAILABLE"
    | "E_AUTH_REQUIRED"
    | "E_INPUT_NOT_EMPTY"
    | "E_MESSAGE_TYPE"
    | "E_SESSION_CLOSED"
    | "E_EXECUTION_SETTLED"
    | "E_REQUIRED_MESSAGE_UNBOUND"
    | "E_RUNTIME_LOST"
    | "E_TRANSPORT_RECONNECTING"
    | "E_HANDLE_NOT_OWNED"
    | "E_GENERATION_CONFLICT"
    | "E_BODY_INCOMPLETE";
  message: string;
  retryable: boolean;
  recovery?: string;
};
```

Это target contract для upstream issue/design. Meta-O не требует его дословного появления, если текущая native surface предоставляет эквивалентное наблюдаемое поведение и проходит общий backend contract.

---

# 7. Orca incident closure matrix

| Инциденты | Локальный public путь закрытия | Upstream issue |
|---|---|---|
| `RR-01/07/08/11/20/21/22`, `RI-39/40` | проверить worker+terminal; при false composed start использовать documented terminal-create/wait/inject fallback | truthful composed receipt и agent detection |
| `RR-18/27` | проверить effective model/effort в visible harness до injection | requested/effective route в receipt |
| `RR-25`, `RI-04/05/07/10/14/16/44/51` | supervised `worker-release`; low-level exact terminal остаётся hot и закрывается отдельно | uniform session retain/release |
| `RR-28`, `RI-02/08/17/35/43` | один foreground `check --wait`, полный batch, повтор после timeout | durable sequence/ack/redelivery |
| `RI-24` | новая bounded dispatch с owner decision как initial input | explicit message-to-execution binding |
| `RI-09/19/22/49/49a` | public worker/account/TUI diagnostics, same-session wait, subscription boundary | typed quota/reconnect |
| `RI-15/27/29` | новая bounded output execution и structured minimal `worker_done` | typed provider refusal и safe body transport |
| `RI-13/18` | full `worker_done`; при дефекте — только квалифицированный public terminal read | byte-complete settled response |
| `RI-20/23/30` | current `--help`, version-matched companion, exact identities/types | clearer native CLI/type enumeration |
| `RI-45` | отклонить dirty input, остановить exact malformed execution, повторить clean session | explicit input-state/clear contract |
| `RI-50` | восстановить run/tasks/workers из public authority | atomic coordinator takeover |
| `RI-33/34/37/41/42` | narrow authority envelope, public preflight и exact ownership | effect observation, где Orca её не предоставляет |

Строка закрывается по workaround path только после upstream issue и live E2E. Если public surface недостаточна, она остаётся открытой до upstream fix.

---

# 8. `SP-06-knowledge-integrity`

## 8.1. Purpose

Machine rule охватывает:

- first-party JS exported functions/classes;
- first-party top-level shell functions;
- исключает generated files, fixtures и private helpers по AST rules.

Purpose comment объясняет назначение, содержит существующий `§A-*` и не содержит transient review/backlog IDs.

Сначала выполняется `find-reuse` mature tooling. Custom checker разрешён только с доказательством, что plugin/config не покрывает fixtures. Markdown не разбирается regex.

## 8.2. Anchor stripping

Authored Markdown сохраняет `§A-*`. Build:

1. разбирает Markdown AST;
2. выбирает prose text nodes;
3. удаляет exact anchor spans;
4. не трогает inline/fenced code;
5. применяет edits по убывающим offsets;
6. проверяет byte-equivalence остальных данных;
7. запрещает anchors в generated distribution.

Tracked manifest не создаётся.

## 8.3. Full reachable-history gate

Проверка только merge base недостаточна. Gate анализирует всю достижимую историю knowledge paths.

```bash
git rev-list --reverse --topo-order HEAD -- \
  docs/business.md \
  docs/architecture
```

Алгоритм:

1. извлечь knowledge blobs для commits и parent edges;
2. AST parser строит defined-ID sets;
3. построить `absent/present` transitions;
4. первое `absent → present` допустимо;
5. повторное `absent → present` для когда-либо встречавшегося ID запрещено;
6. `present → absent` требует removal trailer;
7. continuous edit разрешён;
8. dangling references запрещены.

Это обнаруживает reuse до merge base, remove/re-add в branch и reuse через merge.

```text
Knowledge-Removal: §A-OLD-ID | superseded by §A-NEW-ID
Knowledge-Removal: §B-OLD-ID | requirement retired by <durable reason>
```

Legitimate restoration получает новый ID.

## 8.4. Acceptance

Disposable Git fixtures:

- new ID;
- continuous edit;
- removal с/без trailer;
- reintroduction удалённого ID до merge base;
- branch remove/re-add;
- merge reuse;
- dangling reference.

Tracked baseline не используется.

---

# 9. `SP-07-watchdog-evaluation`

## 9.1. Capacity regression

Fixture:

```text
Selected model is at capacity
```

Проверяются classification, один nudge, dedup при неизменном digest и новый nudge после meaningful state change.

## 9.2. Local model

```text
node tools/eval-watchdog-classifier.mjs \
  --runtime ollama \
  --model <exact-installed-id> \
  --dataset <path> \
  --json
```

Условия:

- runtime/model уже установлены;
- outbound network отключён;
- missing runtime/model только сообщает install/pull instruction;
- pattern остаётся первым;
- model вызывается только для `unclassified`.

Dataset включает quota, capacity, reconnect, refusal, question, working, completion, repaint/heartbeat negatives и ambiguous states.

Go/no-go:

- lower 95% CI macro-F1 improvement ≥ `10 pp`;
- false-positive regression ≤ `1 pp`;
- нет потери recall известных pattern classes;
- p95 ≤ `1 s`;
- failure local model не блокирует pattern path.

Неуспешная гипотеза закрывается ADR с evidence и reversal trigger.

---

# 10. `SP-08-backlog-closure`

## 10.1. Source anchor

Начальный source commit:

```text
41a4898974a6a08eb415cb07ba849575c5964b61
```

Фиксируются Git blob OIDs:

- `docs/backlog.md`;
- `docs/backlog-issues-real-runs.md`.

Если программа стартует с более позднего descendant, он допускается только после доказанного lossless comparison с указанным commit.

## 10.2. Immutable source locators

```ts
type SourceLocator = {
  source_commit: string;
  blob_oid: string;
  path: string;
  node_kind: "heading" | "paragraph" | "list_item";
  heading_path: string[];
  ordinal_within_parent: number;
  byte_start: number;
  byte_end: number;
};
```

Canonical form:

```text
git-mdast:<blob-oid>:<path>@bytes=<start>:<end>
```

AST positions и Git blob bytes являются authority. Synthetic `RR/RI/BW` ID — удобный label, но не единственное доказательство provenance.

## 10.3. Permanent closure index

```text
docs/references/backlog-closure-2026.md
```

```ts
type ClosureRow = {
  id: string;
  source: SourceLocator;
  summary: string;
  owner_spec: string;
  root_cause: string;
  disposition:
    | "implemented"
    | "temporary_workaround"
    | "merged_duplicate"
    | "upstream_fixed"
    | "hypothesis_rejected"
    | "context_only";
  durable_destinations: string[];
  proof: ProofReference[];
  merged_into?: string;
  upstream_issue_url?: string;
  removal_probe?: string[];
};
```

Для `temporary_workaround` обязательны:

- upstream issue;
- path к colocated workaround;
- normal/failure E2E;
- removal probe;
- отсутствие private surface;
- доказательство соответствия backend contract.

Closure index сохраняется на final SHA. Program spec/checklist могут быть удалены только после него.

## 10.4. Raw archive

```text
docs/references/resolved-orca-real-runs-2026.md
```

Архив byte-identical исходному blob:

```bash
git show "<blob-oid>" > <temporary-source>
cmp <temporary-source> docs/references/resolved-orca-real-runs-2026.md
```

Historical marker хранится отдельно, чтобы не изменить исходные байты.

## 10.5. Closure checker

`mo-qc` проверяет:

- каждый исходный AST node покрыт;
- locator разрешается против blob;
- byte range соответствует node;
- полны `B-01..05`, `BW-01..17`, `RR-01..33`, `RI-01..51`, `RI-49a`;
- один primary owner;
- `merged_into` существует и не образует cycle;
- disposition имеет обязательный proof;
- workaround имеет issue/removal probe/E2E;
- proof paths и test names существуют;
- архив совпадает с source blob;
- active backlog entries отсутствуют.

Checker использует real Markdown AST и Git objects, не regex и не baseline.

## 10.6. Очистка

- `docs/backlog.md` сохраняет правила и пустой `## Открыто`;
- real-runs current ledger удаляется либо становится zero-entry stub;
- raw evidence остаётся в archive;
- closure index остаётся;
- `docs/acceptance.md` ссылается на closure index;
- test больше не требует `entries.length > 0`, но валидирует будущие entries.

---

# 11. Lossless inventory

## 11.1. Верхний backlog

| ID | Содержание | Owner |
|---|---|---|
| `B-01` | local-model watchdog | `SP-07` |
| `B-02` | symbol-level knowledge chain | `SP-06` |
| `B-03` | distribution anchors | `SP-06` |
| `B-04` | historical removal/reuse | `SP-06` |
| `B-05` | real Orca/review incidents | `SP-02`–`SP-05`, `SP-07` |

## 11.2. Embedded wishes

| ID | Содержание | Owner |
|---|---|---|
| `BW-01` | readiness/cadence/wakeup | `SP-04`, `SP-05` |
| `BW-02` | model helper | `SP-04` |
| `BW-03` | no duplicates, same-session recovery | `SP-04` |
| `BW-04` | exact model IDs | `SP-04`, `SP-05` |
| `BW-05` | setup-owned posture | `SP-04` |
| `BW-06` | existing senior skills | `SP-03` |
| `BW-07` | first spec/checklist commit | `SP-02` |
| `BW-08` | durable intent in first commit | `SP-02` |
| `BW-09` | severity/minor-round policy | `SP-03` |
| `BW-10` | prompt/subagent research | `SP-03` |
| `BW-11` | durable code links | `SP-06` |
| `BW-12` | fast pre-review | `SP-03` |
| `BW-13` | explicit review invocation | `SP-03` |
| `BW-14` | resource naming/ownership | `SP-04` |
| `BW-15` | full response/short TUI | `SP-04`, `SP-05` |
| `BW-16` | capacity nudge | `SP-07` |
| `BW-17` | full ledger processing | `SP-08` |

## 11.3. `RR-01`–`RR-33`

| IDs | Root cause | Owner |
|---|---|---|
| `RR-01`, `RR-07`, `RR-08`, `RR-11` | truthful CLI/worktree/harness | `SP-04`, `SP-05` |
| `RR-02`, `RR-03`, `RR-10` | reading/branch/Git authority | `SP-04` |
| `RR-04`, `RR-05`, `RR-06`, `RR-09`, `RR-32` | intent/spec ownership | `SP-02` |
| `RR-12`–`RR-16` | auth/readiness | `SP-04` |
| `RR-17`, `RR-19`, `RR-29`–`RR-31` | exact model/helper | `SP-04` |
| `RR-18`, `RR-27` | route metadata | `SP-04`, `SP-05` |
| `RR-20`–`RR-22` | false composed start | `SP-04`, `SP-05` |
| `RR-23`, `RR-24`, `RR-26` | role count/fallback | `SP-04` |
| `RR-25` | cleanup | `SP-04`, `SP-05` |
| `RR-28` | wait handle | `SP-04`, `SP-05` |
| `RR-33` | initial `/goal` after replacement | `SP-04` |

## 11.4. `RI-01`–`RI-51`

| IDs | Root cause | Owner |
|---|---|---|
| `RI-01`, `RI-03`, `RI-06` | ownership/partial completion | `SP-04` |
| `RI-02`, `RI-08`, `RI-17` | missed wakeup | `SP-04`, `SP-05` |
| `RI-04` | delivery/cleanup race | `SP-04`, `SP-05` |
| `RI-05`, `RI-44`, `RI-51` | hot sessions/duplicates | `SP-04` |
| `RI-07`, `RI-10`, `RI-14`, `RI-16` | handles/retain | `SP-04`, `SP-05` |
| `RI-09`, `RI-22`, `RI-49`, `RI-49a` | quota visibility | `SP-04`, `SP-05` |
| `RI-11`, `RI-21`, `RI-36` | task/gate semantics | `SP-04` |
| `RI-12` | compaction | `SP-04`, `SP-05` |
| `RI-13`, `RI-18` | settled-response authority | `SP-04`, `SP-05` |
| `RI-15`, `RI-27`, `RI-29` | provider refusal | `SP-04`, `SP-05` |
| `RI-19`, `RI-35` | reconnect/runtime distinction | `SP-04`, `SP-05` |
| `RI-20`, `RI-23`, `RI-30` | CLI/type ambiguity | `SP-04`, `SP-05` |
| `RI-24` | unbound guidance | `SP-04`, `SP-05` |
| `RI-25` | invented SHA | `SP-04` |
| `RI-26`, `RI-28`, `RI-31`, `RI-32` | QC process contamination | `SP-03` |
| `RI-33`, `RI-34`, `RI-37`, `RI-41`, `RI-42` | authority/effects | `SP-04`, `SP-05` |
| `RI-38` | posture/PATH | `SP-04` |
| `RI-39`, `RI-40` | false/contradictory completion | `SP-04`, `SP-05` |
| `RI-43` | truncated mailbox processing | `SP-04`, `SP-05` |
| `RI-45` | dirty terminal input | `SP-04`, `SP-05` |
| `RI-46`–`RI-48` | false liveness signals | `SP-04` |
| `RI-50` | coordinator recovery | `SP-04`, `SP-05` |

Каждый incident сохраняет отдельный immutable locator, даже если объединён с общим root cause.

---

# 12. Порядок реализации

## Phase 1 — автономные изменения

1. `SP-01`: `find-reuse`.
2. `SP-06`: knowledge integrity.
3. `SP-07`: watchdog regression/evaluation.
4. `SP-03`: review core и senior skill integration.

## Phase 2 — methodology

5. `SP-02`: intent/spec lifecycle.
6. Review evaluation выбирает compact core.

## Phase 3 — Orca defects без ожидания всех upstream fixes

7. Для каждого incident group воспроизвести defect.
8. Завести English upstream issue.
9. Проверить наличие public workaround.
10. Если workaround удовлетворяет backend contract — документировать рядом с issue и добавить E2E.
11. Если не удовлетворяет — соответствующая capability остаётся upstream blocker.
12. Реализовать `SP-04` поверх native commands и квалифицированных workarounds.
13. Upstream fixes из `SP-05` могут выполняться параллельно и заменяют workarounds по removal probe.

## Phase 4 — closure

14. Зафиксировать source blob OIDs.
15. Построить AST locator inventory.
16. Заполнить permanent closure index.
17. Архивировать ledger byte-for-byte.
18. Очистить active backlog.
19. Пройти QC, две reviews и E2E на final SHA.
20. Удалить temporary program spec; новый deletion SHA снова проверить.

---

# 13. Machine-checkable Definition of Done

Программа завершена только если:

1. Permanent closure index присутствует на final SHA.
2. Все rows имеют immutable Git/AST locator.
3. Locators разрешаются против source blobs.
4. Покрыты `B-01..05`, `BW-01..17`, `RR-01..33`, `RI-01..51`, `RI-49a`.
5. Нет orphan nodes и duplicate primary ownership.
6. Каждый duplicate сохраняет собственный locator/context.
7. Raw ledger byte-identical исходному blob.
8. `docs/backlog.md` имеет ноль открытых entries.
9. Current real-runs ledger имеет ноль активных incidents.
10. `mo-reuse` отсутствует вне historical evidence.
11. `find-reuse` standalone и не знает Meta-O layout.
12. `find-reuse`, `senior-python`, `senior-jsts` проходят build/install tests.
13. Knowledge gate сканирует всю reachable history.
14. Anchor stripping не меняет code nodes.
15. Capacity fixture проходит.
16. Local-model hypothesis имеет go/no-go ADR.
17. Review core прошёл evaluation.
18. Для каждого Orca defect существует upstream issue.
19. Каждый `temporary_workaround` имеет public commands, normal/failure E2E и removal probe.
20. Ни один workaround не использует private transcript или Meta-O proxy.
21. Обязательная backend capability доказана upstream fix либо qualifying public workaround.
22. Полный settled response доказан `worker_done` либо квалифицированным public terminal read.
23. На одном full SHA проходят:

```bash
make mo-qc
make mo-test
make mo-smoke
```

24. На том же SHA получены два независимых vendor-diverse `PASS`.
25. Applicable E2E относится к тому же SHA либо имеет допустимый docs-only carry-forward.
26. Final result содержит exact SHA и QC/review/E2E evidence.
27. Program spec может быть удалена, но closure index, upstream links и historical raw archive остаются.
28. Permanent backlog test разрешает будущие правильно оформленные entries.
29. Open upstream issue с qualifying workaround не считается локальным backlog, но ссылка и removal trigger остаются рядом с workaround.
30. Если хотя бы одна обязательная capability не имеет ни upstream fix, ни qualifying workaround, backlog не очищается.

---

# 14. Trade-offs

- Qualifying workarounds позволяют не блокировать десятки incident rows на upstream release, но не ослабляют backend contract.
- Upstream issue обязателен даже при хорошем workaround: иначе временный обход станет вечным.
- Public terminal fallback допускается только в уже разрешённой backend-contract форме с normal/long fixtures; private transcript по-прежнему запрещён.
- Новый `orca.lifecycle.v1` остаётся preferred upstream target, а не обязательной версией или скрытой Meta-O dependency.
- `bound_to_turn` предпочтительнее недоказуемого `consumed`; до upstream поддержки Meta-O использует новую bounded execution.
- Permanent closure index необходим, чтобы final SHA сохранял lossless proof.
- Full-history scan дороже merge-base comparison, но только он обнаруживает старое reuse.
- Широкий adapter catalog `find-reuse` сочетается с узким per-run activation.
- Review specialization включается по risk или после evaluation, а не превращает core в prompt wall.

---

# 15. Отвергнутые варианты

- поддержка Herdr/Paseo;
- Meta-O workflow engine/state store;
- private transcript fallback;
- Orca/provider proxy;
- ожидание всех upstream releases при наличии qualifying workaround;
- workaround без upstream issue;
- workaround, ослабляющий обязательный backend contract;
- version-pinned compatibility matrix;
- compatibility alias `mo-reuse`;
- автоматическая установка/login;
- всегда запускать все registry adapters;
- confidence вместо evidence;
- обязательные 4/5 reviewers;
- принудительные subagents;
- universal review round cap;
- persistent findings database;
- удаление closure index до final SHA;
- history gate только от merge base;
- переписывание raw ledger;
- недоказуемый `consumed` status.

---

# 16. Консервативные предположения

- `§B-PORTABILITY-06` разрешает локальное закрытие upstream defect только через связку issue + временный documented workaround.
- `docs/backend-capabilities.md` остаётся главным ограничителем: workaround обязан предоставить ту же публично наблюдаемую capability.
- `worker_done` — основной settled-response transport; public terminal read является узким квалифицированным fallback.
- Исходный anchor — `41a4898974a6a08eb415cb07ba849575c5964b61`, если не выбран доказанный lossless descendant.
- Historical closure index имеет именованных acceptance/QC/audit consumers.
- Ollama — evaluation runtime, не production dependency.
- Existing `senior-python`/`senior-jsts` не пересоздаются.
- External issue publication, tool installation, credentials и destructive live actions остаются human boundaries будущего исполнения.
- Если пользовательская авторизация на upstream issue недоступна, связанные строки не объявляются закрытыми.
- Непроверенная review/watchdog гипотеза закрывается только experiment verdict.
