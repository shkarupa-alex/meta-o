# Программа спецификаций для обнуления backlog Meta-O

## Краткое решение

Программа состоит из восьми независимо реализуемых спецификаций: переносимый `find-reuse`, lifecycle intent/spec, evidence-first review core, Meta-O policy поверх Orca, upstream Orca contract, knowledge integrity gates, watchdog evaluation и lossless closure. Полное обнуление допускается только на final SHA, содержащем постоянный исторический closure index с точными Git/AST-locators каждого исходного требования и инцидента; временная program spec может быть удалена, но доказательство покрытия остаётся проверяемой частью репозитория.

Обозначения:

- `[R]` — установленное требование;
- `[D]` — принятое здесь проектное решение;
- `[H]` — проверяемая гипотеза, которая не становится архитектурным фактом до эксперимента.

---

# 1. Архитектура программы

## 1.1. Спецификации и владельцы

| Спецификация | Владелец | Канонический источник | Основной результат |
|---|---|---|---|
| `SP-01-find-reuse` | автор portable skills | `src/skills/find-reuse/` | независимый от Meta-O reuse research |
| `SP-02-intent-spec-lifecycle` | методология Meta-O | `shared/references/methodology.md`, `mo-orchestrate-orca` | materialization spec, verbatim intent, progress lifecycle, внешняя интеграция `find-reuse` |
| `SP-03-review-core` | review methodology | compact shared core, `review-protocol.md`, `mo-review-orca` | evidence-first review, modes и evaluation |
| `SP-04-meta-o-orca-policy` | Meta-O | `mo-orchestrate-orca`, `orca-mechanics.md`, `docs/e2e.md` | роли, hot sessions, recovery, gates и authority |
| `SP-05-orca-public-contract` | upstream Orca | native public Orca surface | truthful lifecycle, delivery, wait, recovery и takeover |
| `SP-06-knowledge-integrity` | Meta-O QC | architecture docs, build/lint/tests | symbol-purpose, anchor stripping, history/reuse gates |
| `SP-07-watchdog-evaluation` | Meta-O watchdog | watchdog ADR, fixtures, evaluation report | capacity regression и local-model go/no-go |
| `SP-08-backlog-closure` | maintainer Meta-O | `docs/acceptance.md`, permanent historical closure index | lossless inventory, архивирование ledger, очистка backlog |

Это минимальное разделение по владельцам. Объединение `SP-04` и `SP-05` смешало бы Meta-O policy с изменениями чужого control plane; объединение `SP-08` с feature-спецификациями позволило бы удалить backlog раньше появления полного доказательства.

## 1.2. Зависимости

```text
SP-01 find-reuse ───► SP-02 intent/spec lifecycle ───────────────┐
                                                                │
SP-03 review core ──► SP-04 Meta-O Orca policy ─► live E2E ─────┤
                         ▲                                      │
SP-05 Orca contract ─────┘                                      ├─► SP-08 closure
                                                                │
SP-06 knowledge integrity ──────────────────────────────────────┤
SP-07 watchdog evaluation ──────────────────────────────────────┘
```

Критический путь:

1. `SP-03` фиксирует semantics review.
2. `SP-05` предоставляет необходимые публичные Orca capabilities.
3. `SP-04` использует их без private fallbacks.
4. Полный lifecycle проходит live Orca E2E.
5. `SP-08` доказывает покрытие и очищает backlog на final SHA.

`SP-01 → SP-02`, `SP-06` и `SP-07` выполняются параллельно с upstream Orca.

## 1.3. Что программа не создаёт

[R] Запрещены:

- workflow engine или FSM Meta-O;
- general run registry или state store;
- provider proxy;
- tracked runtime manifest, receipt или review database;
- private transcript как источник settled result;
- поддержка Herdr/Paseo;
- compatibility alias для `mo-reuse`.

Допустим постоянный `docs/references/backlog-closure-2026.md`: это не runtime manifest, а исторический requirement-to-proof index. Его именованные потребители — `docs/acceptance.md`, final reviewers, `mo-qc` closure test и maintainer, проверяющий, почему конкретный исходный инцидент больше не является backlog.

---

# 2. `SP-01-find-reuse`

## 2.1. Цель и границы

[R] `mo-reuse` переименовывается в `find-reuse` и перестаёт знать:

- `docs/business.md`;
- `docs/acceptance.md`;
- layout Meta-O specification;
- feature branches и commit policy;
- место встраивания результата;
- кто и когда вызывает skill.

Skill отвечает только за исследование существующих решений. Meta-O отвечает за вызов, подготовку контекста, сохранение результата и lifecycle spec.

## 2.2. Артефакты

- `src/skills/find-reuse/SKILL.md`;
- references:
  - `search-process.md`;
  - `source-adapters.md`;
  - `candidate-identity.md`;
  - `quality-gates.md`;
- удалённый `src/skills/mo-reuse/`;
- обновлённые build/install/README tests;
- generated `skills/find-reuse/`;
- test, запрещающий Meta-O-specific paths и orchestration vocabulary внутри portable skill.

`senior-python` и `senior-jsts` уже существуют и не создаются этой спецификацией.

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

`problem` формулирует capability, а не заранее выбранный package. `business_requirements` должны быть generic и самодостаточными.

## 2.4. Выход

Фактический результат — Markdown с обязательной структурой:

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
    | "unavailable"
    | "skipped_not_applicable";
  recovery_instruction?: string;
};

type QueryEvidence = {
  source: string;
  query: string;
  command_or_api: string;
  result_count: number;
  retrieved_at: string;
  limitation?: string;
};

type CandidateFamily = {
  family_id: string;
  repository?: RepositoryCandidate;
  packages: PackageCandidate[];
  requirement_fit: RequirementFit[];
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

type RequirementFit = {
  requirement_id: string;
  fit: "full" | "partial" | "none" | "unknown";
  evidence: string;
};
```

`EvidenceValue` всегда содержит источник или `unavailable`; отсутствие данных не превращается в ноль.

## 2.5. Adapter contract

Adapters — инструкции и reusable helpers skill, не новый project runtime.

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

type ProbeResult =
  | { status: "ready"; tools: Array<{ name: string; version: string }> }
  | { status: "missing"; install_instruction: string }
  | { status: "unsupported"; reason: string };

type AuthResult =
  | { status: "authenticated"; account?: string }
  | { status: "not_required" }
  | { status: "required"; login_instruction: string };
```

### Ошибки

- `missing_tool`: источник не считается исследованным;
- `missing_auth`: поиск не выполняется, возвращается точная инструкция;
- `rate_limited`: фиксируется частичное coverage;
- `unavailable`: не маскируется пустой выдачей;
- `malformed_response`: кандидат не принимается без повторной проверки;
- `unsupported_query`: adapter явно сообщает, что умеет только name/exact lookup.

## 2.6. Экономичное ядро

Каждый запуск использует:

1. local repository;
2. GitHub и GitLab source search, если tool/auth готовы;
3. registry adapters только для detected или явно разрешённых ecosystems;
4. optional hosting/registry adapters только по scope.

Все registry adapters входят в поддерживаемый каталог skill, но не запускаются на каждой задаче.

## 2.7. Coverage matrix

| Источник | Capability | Probe/auth | Поиск произвольного `query` | Exact lookup и enrichment |
|---|---|---|---|---|
| Local repository | semantic/name через исходники и manifests | `rg --version` | `rg --files`; `rg -n -- "$QUERY"`; разбор manifests/lockfiles | dependency version, existing adapters, repository constraints |
| GitHub | repository semantic search | `gh --version`; `gh auth status`; recovery `gh auth login --web` | `gh search repos "$QUERY" --sort stars --order desc --archived=false --limit 30 --json fullName,description,stargazersCount,forksCount,pushedAt,updatedAt,license,url,isArchived` | `gh api repos/{owner}/{repo}`; releases, contributors, advisories при доступности |
| GitLab | repository name/description search | `glab --version`; `glab auth status`; recovery `glab auth login --hostname gitlab.com` | `glab api projects --method GET -f search="$QUERY" -f order_by=star_count -f sort=desc -f simple=true -f per_page=30 -f archived=false` | project, releases, tags, activity |
| npm | registry semantic/name search | `npm --version`; public auth не нужен; private: `npm whoami --registry "$REGISTRY"` | `npm search "$QUERY" --json --searchlimit=30 --prefer-online` | `npm view "$PKG" name version description license repository homepage time dist-tags maintainers --json`; npm downloads API |
| PyPI | name discovery и exact lookup; официального semantic API нет | `python3 --version`; `python3 -m pip --version` | hosting search с `language:Python`; Simple JSON используется только для normalized name-token discovery, не выдаётся за semantic search | `python3 -m pip index versions "$NAME"`; `https://pypi.org/pypi/$NAME/json`; pypistats recent/overall |
| crates.io | registry semantic/name search | `cargo --version` | `cargo search "$QUERY" --limit 30` | `cargo info "$CRATE"`; crates.io crate/reverse-dependencies API |
| Go modules | hosting semantic + pkg.go.dev name/text search | `go version` | GitHub/GitLab с Go filter; pkg.go.dev search, HTML разбирается HTML parser | `go list -m -json -versions "$MODULE@latest"`; repository releases/license; downloads — `unavailable` |
| Maven Central | Lucene search | `curl --version` | `curl -fsSG https://search.maven.org/solrsearch/select --data-urlencode "q=$QUERY" --data rows=30 --data wt=json` | exact `g:"GROUP" AND a:"ARTIFACT"`, versions/timestamps |
| NuGet | registry semantic/name search | `curl --version` | `curl -fsSG https://azuresearch-usnc.nuget.org/query --data-urlencode "q=$QUERY" --data take=30 --data prerelease=false` | registration endpoint, versions, total downloads |
| RubyGems | registry name/text search | `gem --version` | `gem search --remote "$QUERY" --all` и RubyGems search API | gem metadata и reverse dependencies |
| Packagist | registry semantic/name search | `composer --version` или `curl --version` | `composer search "$QUERY" --format=json` либо Packagist search API | package API: source, releases, downloads, favers |

PyPI policy:

- официальный Simple API может искать только по normalized names после локальной фильтрации;
- semantic candidates приходят из hosting search и domain query variants;
- PyPI JSON подтверждает точный package;
- download metrics берутся из внешнего pypistats и так маркируются;
- `pip_search` не является обязательным tool и не устанавливается автоматически.

### Optional adapters

- Codeberg/Gitea:
  `curl -fsSG https://codeberg.org/api/v1/repos/search --data-urlencode "q=$QUERY" --data-urlencode limit=30`;
- Bitbucket;
- Swift Package Index;
- Hex;
- pub.dev;
- Conan/vcpkg;
- private source hosting и registries.

## 2.8. Tool installation policy

Skill не выполняет установку. Для отсутствующего tool он:

1. определяет platform и доступный package manager;
2. выбирает одну проверяемую recipe из adapter descriptor;
3. печатает точную команду, например `brew install gh`;
4. печатает official manual-install route;
5. помечает coverage incomplete;
6. продолжает по независимым источникам.

Установка, login и subscription никогда не считаются выполненными без нового успешного probe.

## 2.9. Query process

1. Сформировать literal capability query.
2. Добавить domain synonyms и protocol names.
3. Добавить ecosystem-specific variant.
4. Выполнить broad union без popularity cutoff.
5. Дедуплицировать identities.
6. Обогатить максимум 10–15 наиболее релевантных families.
7. Проверить must-requirements.
8. Сравнить интеграционную стоимость.
9. Выдать `reuse`, `extend`, `build` или `unknown`.

Popularity применяется только после capability fit.

## 2.10. Identity и дедупликация

```text
repository:
  repo:<host>:<numeric-project-id>
  fallback: repo-url:<normalized-canonical-url>

package:
  pkg:<ecosystem>:<ecosystem-normalized-name>

family:
  family:<canonical-repository-identity>
```

Правила:

- `.git`, known default ports и URL credentials удаляются;
- GitHub owner/repository нормализуются case-insensitive;
- PyPI использует PEP 503;
- npm использует canonical scoped name;
- NuGet и RubyGems применяют их registry normalization;
- fork/mirror остаётся отдельным repository до authoritative upstream evidence;
- monorepo packages остаются отдельными packages;
- package связывается с repository через `published_from`;
- сомнительное совпадение получает `possible_same_as`;
- repository и package signals сохраняют собственную provenance.

## 2.11. Acceptance

- rename выполнен без alias;
- standalone invocation возможен вне Meta-O repository;
- Meta-O paths отсутствуют;
- каждый required/applicable source имеет status;
- missing tool/auth не выглядит как ноль результатов;
- PyPI fixture демонстрирует реальный exact lookup и downloads;
- один repository с npm/PyPI/crates package объединяется в family, но package identities не теряются;
- `build` содержит минимум два проверенных альтернативных family либо доказанное отсутствие applicable candidates;
- output не делает commit и не выбирает destination.

---

# 3. `SP-02-intent-spec-lifecycle`

## 3.1. Контракт первого increment

Первый работающий executor создаёт один commit, содержащий:

1. одну specification;
2. исходный user ledger дословно;
3. `Implementation checklist` из 3–10 outcome-level пунктов;
4. новые durable business intents, если они действительно появились;
5. `Reuse research` либо доказанное `not_applicable`.

Orchestrator не редактирует этот commit. Replacement до первого реально принятого executor turn считается тем же initial dispatch и получает initial `/goal`.

## 3.2. Внешняя интеграция `find-reuse`

Meta-O отвечает за:

```ts
function buildFindReuseRequest(
  verbatimIntent: string,
  businessRequirements: Requirement[],
  architectureConstraints: string[],
  repositoryContext: RepositoryContext
): FindReuseRequest;
```

Executor вызывает skill, получает Markdown и встраивает его в `## Reuse research`.

`unknown` блокирует только решение, зависящее от непроверенного обязательного источника. Отсутствие одного optional adapter не блокирует весь lifecycle, если coverage достаточен и limitation зафиксирован.

## 3.3. Progress

Checklist живёт только в временной spec:

- backlog не используется для progress;
- gate state не записывается в backlog;
- orchestrator не создаёт task tree;
- executor отмечает outcomes по мере завершения.

## 3.4. Удаление specification

После переноса durable знаний и готовности результата:

1. implementation SHA проходит QC/review/E2E;
2. spec deletion создаёт новый docs-only SHA;
3. verbatim ledger остаётся доступен в parent Git blob;
4. final review нового SHA получает точный source commit и parent blob;
5. QC и две reviews повторяются;
6. E2E carry-forward разрешён только по действующему docs-only контракту.

Program closure index из `SP-08` не удаляется вместе со spec.

## 3.5. Acceptance

- spec создаётся executor, а не orchestrator;
- verbatim input восстанавливается byte-for-byte;
- checklist не превышает 10 outcomes;
- reuse result имеет coverage evidence;
- durable intent читается без удалённой spec;
- deletion SHA имеет самостоятельные QC и reviews.

---

# 4. `SP-03-review-core`

## 4.1. Архитектура review

Review разделяется на семь стадий.

### 1. Grounding

Reviewer проверяет:

- exact full SHA;
- clean worktree;
- intent/spec/verbatim ledger;
- repository instructions;
- diff;
- reachable callers/callees;
- schemas/config/tests.

History, prior PR/comments и code comments открываются по risk trigger, а не включаются в обязательный prompt wall.

### 2. Risk mapping

Активируются только применимые classes:

- correctness;
- boundary/error handling;
- state/concurrency;
- security;
- compatibility/data migration;
- operational behavior;
- language-specific hazards.

### 3. Discovery

Reviewer собирает candidate findings без раннего severity/confidence cutoff. Отсутствие findings валидно.

### 4. Verification

```ts
type EvidenceState =
  | "confirmed"
  | "supported"
  | "unproven"
  | "refuted";
```

Проверяются reachable path, guards, runtime semantics, focused test/reproducer и counter-evidence.

### 5. Causality

```ts
type ChangeCausality =
  | "introduced"
  | "exposed"
  | "pre_existing";
```

Blocking finding должен быть вызван/усилен diff либо нарушать текущий обязательный requirement. Pre-existing проблема не маскируется под regression.

### 6. Severity

Severity `P0–P3` назначается после evidence.

Numeric confidence:

- не заменяет evidence;
- может отправить candidate на повторную verification;
- не повышает `unproven`;
- не является lifecycle gate.

`unproven`, влияющий на verdict, означает `UNKNOWN`.

### 7. Reporting

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

type Finding = {
  severity: "P0" | "P1" | "P2" | "P3";
  location: string;
  invariant: string;
  trigger_path: string;
  impact: string;
  evidence_state: "confirmed" | "supported";
  evidence: string;
  causality: ChangeCausality;
  smallest_fix: string;
  proof_after_fix: string;
};
```

Нулевая `findings` вместе с полным выполнением review даёт `PASS`, а не подозрительный пустой результат.

## 4.2. Modes

- `fast`: optional executor-owned clean-room advisory review перед lifecycle gate;
- `deep`: два независимых vendor-diverse reviewers;
- `follow_up`: новая execution на новом SHA в тех же hot sessions.

Reviewer в follow-up видит собственный предыдущий report и delta, но не peer report. Значительное semantic изменение возвращает полный `deep`.

Специализированные subagents одного reviewer не считаются отдельными gate reviewers.

## 4.3. `senior-python` и `senior-jsts`

- существующие skills входят в build/install/README;
- подключаются как optional language lenses;
- не являются обязательной зависимостью standalone `mo-review-orca`;
- mixed-language change может активировать оба;
- не разрешают массовую перепись вне current scope.

## 4.4. Claude plugin

Принимаются идеи:

- repository instructions;
- history/PR/comment evidence по trigger;
- eligibility re-check;
- отсутствие публикации при чистом результате.

Не принимаются:

- несогласованность 4/5 reviewers;
- GitHub-only coupling;
- confidence threshold как evidence;
- shallow changed-lines-only reachability;
- auto-posting;
- предположение, что CI уже выполнил необходимые проверки;
- обязательный fan-out без evaluation.

## 4.5. QC isolation

- полный `make mo-qc` выполняется один раз отдельным gate;
- reviewers используют focused non-mutating checks;
- process-sensitive tests не идут параллельно в общем worktree;
- потенциально mutating diagnostic идёт в disposable worktree;
- reviewers не оставляют фоновых процессов.

## 4.6. Evaluation

[H] Проверяются:

1. minimal core;
2. concise core;
3. текущий длинный protocol;
4. core + language/risk lens;
5. core + independent verifier;
6. core + specialist;
7. two-vendor union.

Corpus:

- реальные historical bugs;
- accepted review findings;
- controlled mutations;
- clean negatives;
- минимум 20–40 cases;
- 3–5 повторов nondeterministic configurations;
- held-out cases, не используемые при редактировании prompt.

Metrics:

- precision;
- recall;
- severity-weighted recall;
- unique validated findings;
- false-positive и duplicate rates;
- latency;
- time-to-first-finding;
- tokens/cost;
- retention after verification;
- variance.

До первого запуска evaluation report фиксирует adoption thresholds. Начальные defaults:

- precision ≥ `0.70`;
- P0/P1 recall не хуже baseline более чем на `5 pp`;
- optional lane добавляет ≥ `10%` relative severity-weighted recall;
- стоимость ≤ `2×` baseline без отдельного rationale.

Thresholds — evaluation policy, не business architecture. Если hypothesis не проходит, lane отвергается и backlog считается закрытым доказанным решением.

Tracked `findings.json` не создаётся.

## 4.7. Acceptance

- один compact core используется всеми modes;
- external orchestration policy не встроена в portable language skills;
- два reviewer остаются независимыми и vendor-diverse;
- ни один `unproven` finding не опубликован как defect;
- clean result даёт PASS;
- no universal round cap;
- правило «три minor rounds → PASS» отсутствует;
- evaluation не объявляет ensemble benefit без измерений.

---

# 5. `SP-04-meta-o-orca-policy`

## 5.1. Capability preflight

Перед использованием lifecycle Meta-O получает native Orca capability response:

```ts
type OrcaCapabilities = {
  contract: "orca.lifecycle.v1";
  features: {
    truthful_agent_detection: boolean;
    effective_route: boolean;
    durable_delivery: boolean;
    durable_wait: boolean;
    public_worker_done: boolean;
    typed_recovery: boolean;
    hot_session_reuse: boolean;
    idempotent_release: boolean;
    coordinator_takeover: boolean;
  };
};
```

Если обязательная capability отсутствует, run не маскируется workaround. Meta-O сообщает конкретный unsupported boundary.

Это native Orca response с именованным потребителем `mo-orchestrate-orca`, не Meta-O manifest.

## 5.2. Роли

Одновременно существуют максимум:

- один executor session;
- один review-A session;
- один review-B session.

```ts
type ActiveRole = {
  role: "executor" | "review_a" | "review_b";
  session_id: string;
  current_execution_id?: string;
  terminal_id: string;
  route: {
    provider: string;
    model: string;
    effort: string;
  };
  context_epoch: number;
};
```

Это transient projection публичного Orca state в reasoning, не tracked state.

Meta-O воздействует только на exact handles текущего run.

## 5.3. Readiness

До initial dispatch:

1. repository является Git worktree;
2. branch не запрещена;
3. `HEAD` получен из Git;
4. bundled model helper выдаёт exact IDs;
5. provider auth подтверждён;
6. setup-owned posture исправен;
7. Orca сообщает requested/effective route;
8. reviewer routes vendor-diverse;
9. нужные capabilities доступны.

Запрещены guessed aliases, unapproved OpenCode fallback и добавление posture flags orchestration skill.

## 5.4. Session и execution

Session — hot provider context. Execution — один bounded task на одном candidate SHA.

```ts
type SessionState =
  | "starting"
  | "ready"
  | "busy"
  | "waiting_recovery"
  | "closed"
  | "lost";

type ExecutionState =
  | "created"
  | "input_bound"
  | "running"
  | "waiting_question"
  | "waiting_quota"
  | "reconnecting"
  | "settled"
  | "failed"
  | "unknown";
```

Инварианты:

- одна active execution на session;
- first review execution не содержит peer или prior-review context;
- remediation создаёт новый executor execution;
- новый SHA создаёт новые review executions в прежних reviewer sessions;
- session не закрывается после отдельного `worker_done`;
- replacement не создаётся до recovery attempt;
- replacement сохраняет role/model/effort, если пользователь не выбрал другое;
- superseded exact handle освобождается или явно остаётся `cleanup_pending`.

## 5.5. Waiting

Во время активного lifecycle orchestrator не завершает turn final response.

Алгоритм:

1. получить last acknowledged sequence;
2. вызвать durable wait до сообщения или 10 минут;
3. обработать весь oldest-first batch;
4. ack through последний обработанный sequence;
5. применить typed state transitions;
6. re-arm wait;
7. timeout создаёт один checkpoint, но не failure.

Heartbeat, TUI repaint, cursor и title не являются authority. Нельзя смотреть только последние `N` сообщений.

## 5.6. Task semantics

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

Остановка review slice не завершает feature. Cleanup success не исправляет incomplete mandatory phase.

## 5.7. Owner message

Meta-O принимает результат как учитывающий owner decision только если Orca связал сообщение с execution до начала соответствующего provider turn:

```ts
type MessageBinding = {
  message_id: string;
  execution_id: string;
  state:
    | "queued"
    | "injected"
    | "bound_to_turn"
    | "rejected";
};
```

`bound_to_turn` означает проверяемое включение сообщения в provider input, а не недоказуемое утверждение о том, что модель «поняла» текст.

## 5.8. SHA

Каждая review execution получает exact SHA. Результат должен вернуть тот же SHA.

```bash
git cat-file -e "$CANDIDATE_SHA^{commit}"
test "$(git rev-parse "$CANDIDATE_SHA^{commit}")" = "$CANDIDATE_SHA"
```

Любой invented, abbreviated или несовпадающий SHA даёт `UNKNOWN`.

## 5.9. Recovery

Для quota/reconnect/refusal:

1. сохранять session;
2. ждать typed event;
3. не создавать parallel duplicate;
4. повторить delivery в той же session, если Orca подтверждает безопасность;
5. использовать body-file для output retry;
6. при отсутствии public settled response вернуть `UNKNOWN`.

Private transcript может использоваться только upstream разработчиком для диагностики Orca, но не Meta-O как источник verdict.

## 5.10. Compaction

После `context_compacted` новый turn получает:

- `AGENTS.md`;
- current spec;
- applicable core;
- candidate SHA;
- собственные предыдущие findings в follow-up.

`worker_done` должен ссылаться на текущий `context_epoch`; иначе результат `UNKNOWN`.

## 5.11. Authority envelope

```ts
type AuthorityEnvelope = {
  allowed_paths: string[];
  allowed_resources: string[];
  allowed_actions: string[];
  forbidden_effects: string[];
  approval_boundaries: string[];
};
```

Нельзя запрещать весь live path. Запрещаются конкретные чужие resources и destructive effects. Наблюдаемость не означает технический sandbox: при отсутствии public effect evidence опасный E2E получает `UNKNOWN`.

---

# 6. `SP-05-orca-public-contract`

## 6.1. Versioned event envelope

Все lifecycle events имеют общий envelope:

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

`sequence` монотонен внутри run. Повторная доставка того же `event_id` idempotent.

Upstream specification обязана сопоставить этот schema с текущими native Orca commands. Если существующий command можно расширить, новый verb не создаётся. Meta-O proxy запрещён.

## 6.2. Truthful start

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
```

До `agent_state=detected` execution input не принимается. Bare shell output никогда не классифицируется как `worker_done`.

## 6.3. Dispatch

```ts
type DispatchRequest = {
  session_id: string;
  kind: "work_package" | "review_execution" | "remediation";
  body_file: string;
  candidate_sha?: string;
  required_message_ids?: string[];
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

Input non-empty state должен либо отклонять inject, либо требовать явного documented clear action. Silent concatenation запрещена.

## 6.4. Delivery

```ts
type DeliveryState =
  | "queued"
  | "injected"
  | "bound_to_turn"
  | "rejected";

type DeliveryResult = {
  message_id: string;
  session_id: string;
  execution_id?: string;
  state: DeliveryState;
  reason?: string;
};
```

Required message должен быть `bound_to_turn` соответствующей execution до принятия settled result.

## 6.5. Runtime events

```ts
type WorkerLifecycleEvent =
  | OrcaEvent<{ state: "working" }>
  | OrcaEvent<{ question_id: string; body: string }>
  | OrcaEvent<{ request_id: string; body: string }>
  | OrcaEvent<{ vendor: string; reset_at?: string }>
  | OrcaEvent<{ since: string; attempts: number; last_error: string }>
  | OrcaEvent<{ stage: "input" | "output"; reason: string }>
  | OrcaEvent<{ epoch: number }>
  | WorkerDoneEvent
  | OrcaEvent<{ reason: string }>
  | OrcaEvent<{ reason: string }>;

type WorkerDoneEvent = OrcaEvent<{
  candidate_sha?: string;
  body: string;
  body_bytes: number;
  context_epoch: number;
}>;
```

Конкретные `type`:

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

`worker_done` остаётся единственным settled success response. Диагностическое `completed` отдельно не вводится.

## 6.6. Wait и acknowledgement

Native public surface должен реализовать:

```ts
type WaitRequest = {
  run_id: string;
  after_sequence: number;
  timeout_seconds: number;
};

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

Ack:

```ts
type AckRequest = {
  run_id: string;
  through_sequence: number;
};
```

Требования:

- oldest-unacked FIFO;
- reconnect не теряет events;
- одинаковый event может быть redelivered до ack;
- Meta-O processing idempotent по `event_id`;
- `runtime_lost` не используется для временного transport disconnect;
- response не обрезает batch по «latest N».

## 6.7. Settled body

- принимается file/stdin transport, исключающий shell interpolation;
- body возвращается полностью;
- `body_bytes` сверяется в fixture;
- `reportPath` без полного публичного body недостаточен;
- TUI summary диагностический;
- capability rejection не может сопровождаться успешным body.

## 6.8. Resource lifecycle

```ts
type ReleaseResult =
  | { state: "released"; effect_applied: true }
  | { state: "already_absent"; effect_applied: false }
  | { state: "retained"; effect_applied: false };
```

Один canonical session/terminal handle поддерживается на composed и low-level surfaces. Повторный release безопасен.

## 6.9. Coordinator takeover

```ts
type TakeoverRequest = {
  run_id: string;
  coordinator_terminal_id: string;
  expected_generation: number;
};

type TakeoverResult =
  | {
      status: "accepted";
      generation: number;
      preserved_sessions: string[];
      preserved_unacked_range?: [number, number];
    }
  | {
      status: "rejected";
      error: {
        code: "E_GENERATION_CONFLICT" | "E_TERMINAL_NOT_FOUND";
        message: string;
      };
    };
```

Это Orca control-plane state, не новый Meta-O store.

## 6.10. Error taxonomy

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

Unknown status strings и contradictory status/body combinations считаются protocol errors.

## 6.11. E2E

Upstream tests и Meta-O live scenarios покрывают:

1. folder workspace;
2. bare shell;
3. fabricated `worker_done`;
4. exact requested/effective route;
5. stale auth/account refresh;
6. non-empty terminal input;
7. long byte-exact response;
8. required message bound to execution;
9. reconnect с redelivery до ack;
10. runtime lost;
11. quota с reset time;
12. input/output refusal;
13. compaction epoch;
14. hot session через два review SHA;
15. idempotent release;
16. coordinator takeover;
17. provider capability rejection;
18. question/reply bridge;
19. observed unsafe effect;
20. incomplete mandatory phase.

Пока capability и E2E отсутствуют, соответствующая closure row остаётся открытой.

---

# 7. `SP-06-knowledge-integrity`

## 7.1. Purpose contract

Machine rule распространяется на:

- first-party JS exported functions/classes;
- first-party top-level shell functions;
- исключая generated files, fixtures и private helpers по явным AST-based правилам.

Comment обязан:

- объяснять назначение;
- ссылаться на существующий `§A-*`;
- не ссылаться на transient review/backlog IDs.

Сначала выполняется `find-reuse` mature tooling. Если ESLint/ast-grep/tree-sitter configuration не покрывает fixtures, минимальный custom checker допустим только вместе с доказательством этого ограничения в commit message, как требует project contract.

Markdown не разбирается regex.

## 7.2. Distribution anchors

В authored Markdown anchors разрешены. Build:

1. разбирает Markdown AST;
2. выбирает только prose text nodes;
3. удаляет exact `§A-*` token spans;
4. не меняет inline/fenced code;
5. применяет edits по убывающим byte offsets;
6. проверяет byte-equivalence всего, кроме перечисленных spans;
7. проверяет отсутствие anchors в generated output.

Manifest удалённых anchors не хранится.

## 7.3. Полная history gate

Предыдущая проверка только относительно merge base недостаточна: она не видит ID, удалённый до merge base и затем повторно введённый. Поэтому gate сканирует всю достижимую историю knowledge paths.

### Алгоритм

1. Получить все commits, меняющие business/architecture knowledge:

```bash
git rev-list --reverse --topo-order HEAD -- \
  docs/business.md \
  docs/architecture
```

2. Для каждого commit и каждого parent edge извлечь Markdown blobs через Git.
3. AST parser строит множество определённых `§B-*` и `§A-*`.
4. Для каждого ID строятся presence transitions по parent edges.
5. Новое `absent → present` допустимо только если ID никогда не встречался ни в одном ancestor.
6. Если ID уже встречался, затем отсутствовал и снова появился, gate отклоняет commit независимо от совпадения текста.
7. `present → absent` требует trailer в commit, где произошло удаление.
8. Continuous presence с редактированием текста допустимо.
9. Semantic подмена без удаления остаётся reviewer finding.

Это ловит:

- reuse ID, удалённого задолго до merge base;
- remove/re-add в feature branch;
- reuse через merge;
- dangling references после удаления.

Legitimate restoration использует новый ID; исключение для повторного использования не вводится.

### Removal trailer

```text
Knowledge-Removal: §A-OLD-ID | superseded by §A-NEW-ID
```

или:

```text
Knowledge-Removal: §B-OLD-ID | requirement retired by <durable reason>
```

## 7.4. Acceptance

Disposable Git fixture содержит:

- первоначальное добавление;
- непрерывное редактирование;
- удаление без trailer;
- удаление с trailer;
- reintroduction после нескольких historical commits до merge base;
- remove/re-add внутри branch;
- merge с уже удалённым ID;
- dangling link;
- brand-new ID.

Gate не использует tracked baseline.

---

# 8. `SP-07-watchdog-evaluation`

## 8.1. Pattern regression

Дословный fixture:

```text
Selected model is at capacity
```

Проверяет:

- классификацию;
- один nudge;
- отсутствие второго nudge при неизменном private digest;
- новый nudge после meaningful state change;
- нормальное восстановление.

## 8.2. Local-model experiment

Local model не заменяет pattern и не создаёт daemon.

```text
node tools/eval-watchdog-classifier.mjs \
  --runtime ollama \
  --model <exact-installed-id> \
  --dataset <path> \
  --json
```

Предусловия:

- `ollama` установлен;
- exact model присутствует в `ollama list`;
- outbound network отсутствует;
- missing tool/model даёт инструкцию, но ничего не устанавливает.

Dataset:

- quota;
- capacity;
- reconnect;
- provider refusal;
- question;
- working;
- completion;
- repaint/heartbeat hard negatives;
- ambiguous/unknown examples.

Go/no-go:

- нижняя граница 95% bootstrap CI улучшения macro-F1 на ambiguous/unseen ≥ `10 pp`;
- actionable false-positive rate ухудшается не более чем на `1 pp`;
- известные pattern classes не теряют recall;
- p95 ≤ `1 s` на указанной машине;
- runtime failure безопасно возвращает pattern/unclassified.

При успехе local model вызывается только после `pattern=unclassified`. При неуспехе ADR фиксирует rejected hypothesis и reversal trigger. Оба исхода закрывают wish честно.

---

# 9. `SP-08-backlog-closure`

## 9.1. Source anchor

Closure начинается с фиксированного source commit:

```text
41a4898974a6a08eb415cb07ba849575c5964b61
```

Из него извлекаются Git blob OIDs исходных:

- `docs/backlog.md`;
- `docs/backlog-issues-real-runs.md`.

Если implementation branch содержит более поздние изменения этих файлов до начала программы, specification фиксирует новый source commit и отдельно доказывает, что он является потомком указанного SHA без потери элементов.

## 9.2. Не synthetic IDs, а точные source locators

Каждая closure row содержит immutable locator:

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

Canonical textual form:

```text
git-mdast:<blob-oid>:<path>@bytes=<start>:<end>
```

`heading_path` и ordinal помогают человеку; `blob_oid` и byte range являются machine authority.

### Извлечение

- Markdown разбирается существующей real AST library;
- позиции переводятся в byte offsets исходного blob;
- `B-*` назначаются открытым backlog headings;
- `BW-*` назначаются paragraph/list nodes внутри Orca backlog item;
- `RR-*` назначаются исходным pre-heading incident items по document order;
- `RI-*` назначаются incident headings по document order;
- единственный вложенный heading получает `RI-49a`;
- exact bytes locator должны совпасть с archived source blob.

Порядковый synthetic ID больше не является единственным доказательством происхождения.

## 9.3. Permanent closure index

Создаётся:

```text
docs/references/backlog-closure-2026.md
```

Он остаётся на final SHA и содержит:

```ts
type ClosureRow = {
  id: string;
  source: SourceLocator;
  summary: string;
  owner_spec: string;
  root_cause: string;
  disposition:
    | "implemented"
    | "merged_duplicate"
    | "upstream_fixed"
    | "hypothesis_rejected"
    | "context_only";
  durable_destinations: string[];
  proof: ProofReference[];
  merged_into?: string;
};

type ProofReference =
  | { type: "test"; path: string; test_name: string }
  | { type: "knowledge"; path: string; architecture_id?: string }
  | { type: "e2e"; scenario_id: string }
  | { type: "upstream"; project: string; issue_or_change: string; released_version?: string }
  | { type: "archive"; locator: string };
```

Правила:

- ровно один primary owner;
- `merged_duplicate` требует `merged_into`;
- duplicate row сохраняет свой source locator и context;
- `upstream_fixed` требует публичный upstream reference и E2E;
- `hypothesis_rejected` требует evaluation report/ADR;
- `context_only` допустим только для факта запуска, из которого не следует отдельное требование, и требует rationale;
- ни одна row не закрывается только ссылкой на commit message.

Closure index не удаляется после завершения. Удаляются только program spec и progress checklist.

## 9.4. Raw ledger archive

Исходный ledger переносится byte-for-byte:

```text
docs/references/resolved-orca-real-runs-2026.md
```

Historical status описывается в отдельном index paragraph, не изменяющем archived bytes.

Проверка использует source blob:

```bash
git show "<blob-oid>" > <temporary-source>
cmp <temporary-source> docs/references/resolved-orca-real-runs-2026.md
```

В implementation command запрещено полагаться только на path в текущем commit.

## 9.5. Closure checker

`mo-qc` проверяет:

- каждый expected source AST node покрыт ровно одной primary row;
- каждый locator разрешается в исходном blob;
- byte range соответствует node;
- IDs полны: `B-01..05`, `BW-01..17`, `RR-01..33`, `RI-01..51`, `RI-49a`;
- `merged_into` существует и не образует cycle;
- disposition имеет требуемый proof type;
- proof paths/test names существуют;
- активные backlog files не содержат открытых entries;
- archived ledger совпадает с source blob.

Checker использует Markdown AST и Git objects, не regex и не отдельный baseline.

## 9.6. Очистка текущих файлов

После прохождения всех closure rows:

- `docs/backlog.md` сохраняет правила и пустой `## Открыто`;
- `docs/backlog-issues-real-runs.md` удаляется либо остаётся zero-entry stub;
- historical raw text остаётся в archive;
- permanent closure index остаётся на final SHA;
- `docs/acceptance.md` ссылается на closure index как evidence программы.

Существующий test, требующий `entries.length > 0`, меняется:

- ноль entries разрешён;
- будущая entry по-прежнему обязана содержать reason, impact и next step;
- постоянного требования «backlog всегда пуст» нет.

---

# 10. Lossless inventory

## 10.1. Верхний backlog

| ID | Содержание | Owner | Proof class |
|---|---|---|---|
| `B-01` | local-model watchdog | `SP-07` | evaluation + ADR + fixture |
| `B-02` | knowledge chain только module-level | `SP-06` | AST symbol fixtures |
| `B-03` | anchors остаются в distribution | `SP-06` | source/output AST tests |
| `B-04` | history не ловит removal/reuse | `SP-06` | full reachable-history Git fixtures |
| `B-05` | Orca/review real-run failures | `SP-02`–`SP-05`, `SP-07` | closure rows и E2E |

## 10.2. Embedded wishes

| ID | Содержание | Owner |
|---|---|---|
| `BW-01` | readiness/cadence/wakeup | `SP-04`, `SP-05` |
| `BW-02` | общий model helper | `SP-04` |
| `BW-03` | no duplicates, same-session recovery | `SP-04` |
| `BW-04` | exact models, no aliases | `SP-04`, `SP-05` |
| `BW-05` | setup-owned posture | `SP-04` |
| `BW-06` | existing senior skills | `SP-03` |
| `BW-07` | first spec/checklist commit | `SP-02` |
| `BW-08` | durable intent in first commit | `SP-02` |
| `BW-09` | severity/minor-round policy | `SP-03` |
| `BW-10` | review research/subagents | `SP-03` |
| `BW-11` | durable code-comment links | `SP-06` |
| `BW-12` | fast pre-review | `SP-03` |
| `BW-13` | explicit review invocation | `SP-03` |
| `BW-14` | role-based resource ownership | `SP-04` |
| `BW-15` | full public report/short TUI | `SP-04`, `SP-05` |
| `BW-16` | capacity watchdog | `SP-07` |
| `BW-17` | обработать весь ledger | `SP-08` |

Каждая строка в постоянном closure index получает конкретный `git-mdast:` locator.

## 10.3. `RR-01`–`RR-33`

| IDs | Root cause | Primary owner |
|---|---|---|
| `RR-01`, `RR-07`, `RR-08`, `RR-11` | truthful CLI/worktree/agent detection | `SP-05` |
| `RR-02`, `RR-03`, `RR-10` | bounded reading, branch и Git authority | `SP-04` |
| `RR-04`, `RR-05`, `RR-06`, `RR-09`, `RR-32` | intent/spec materialization ownership | `SP-02` |
| `RR-12`, `RR-13`, `RR-14`, `RR-15`, `RR-16` | auth/readiness/guessed commands | `SP-04` |
| `RR-17`, `RR-19`, `RR-29`, `RR-30`, `RR-31` | exact model/effort/helper discovery | `SP-04` |
| `RR-18`, `RR-27` | stale/effective route metadata | `SP-05` |
| `RR-20`, `RR-21`, `RR-22` | receipt/fake completion | `SP-05` |
| `RR-23`, `RR-24`, `RR-26` | excess workers/unapproved fallback | `SP-04` |
| `RR-25` | cleanup lifecycle | `SP-05` |
| `RR-28` | wait without durable handle | `SP-05` |
| `RR-33` | replacement initial goal | `SP-04` |

## 10.4. `RI-01`–`RI-51`

| IDs | Root cause | Primary owner |
|---|---|---|
| `RI-01`, `RI-03`, `RI-06` | ownership и partial completion | `SP-04` |
| `RI-02`, `RI-08`, `RI-17` | missed wakeup | `SP-04` |
| `RI-04` | delivery/cleanup race | `SP-05` |
| `RI-05`, `RI-44`, `RI-51` | hot sessions и duplicate cleanup | `SP-04` |
| `RI-07` | resume/handle validation | `SP-05` |
| `RI-09`, `RI-22`, `RI-49`, `RI-49a` | quota visibility | `SP-05` |
| `RI-10`, `RI-14`, `RI-16` | retain failures | `SP-05` |
| `RI-11` | budget/task semantics | `SP-04` |
| `RI-12` | context compaction | `SP-05`, policy в `SP-04` |
| `RI-13` | TUI против public settled response | `SP-04` |
| `RI-15`, `RI-27`, `RI-29` | provider refusal | `SP-05` |
| `RI-18` | incomplete/unsafe long body | `SP-05` |
| `RI-19` | reconnect recovery | `SP-05` |
| `RI-20` | task/dispatch ambiguity | `SP-05` |
| `RI-21` | work package/review/gate semantics | `SP-04` |
| `RI-23`, `RI-30` | invalid message types | `SP-05` |
| `RI-24` | guidance not bound to execution | `SP-05` |
| `RI-25` | invented SHA | `SP-04` |
| `RI-26`, `RI-28`, `RI-31`, `RI-32` | QC process contamination | `SP-03` |
| `RI-33`, `RI-34` | destructive/config provenance | `SP-04` |
| `RI-35` | transport/runtime confusion | `SP-05` |
| `RI-36` | incomplete phase marked success | `SP-04` |
| `RI-37` | implicit side effect | `SP-04` |
| `RI-38` | duplicate posture/PATH wrapper | `SP-04` |
| `RI-39` | repeated fake completion | `SP-05` |
| `RI-40` | contradictory capability/result | `SP-05` |
| `RI-41` | deletion of foreign resources | `SP-04` |
| `RI-42` | overbroad prohibition | `SP-04` |
| `RI-43` | truncated mailbox polling | `SP-04`, durable delivery в `SP-05` |
| `RI-45` | dirty terminal input | `SP-05` |
| `RI-46`, `RI-47`, `RI-48` | cadence/seed/cursor false signals | `SP-04` |
| `RI-50` | coordinator takeover | `SP-05` |

Повторные инциденты сохраняют отдельные locators и context. Общий root cause не поглощает distinct evidence.

---

# 11. Порядок реализации

## Phase 1 — автономные increments

1. `SP-01`: `find-reuse`.
2. `SP-06`: knowledge integrity.
3. `SP-07`: watchdog regression/evaluation.
4. `SP-03`: review core и senior skill integration.

Каждый coherent increment получает отдельный commit и relevant tests.

## Phase 2 — methodology

5. `SP-02`: intent/spec lifecycle.
6. Review evaluation фиксирует выбранный compact core.

## Phase 3 — Orca

7. `SP-05` делится внутри upstream repository на capability increments:
   - truthful start/worktree;
   - delivery/wait;
   - settled response;
   - typed recovery;
   - session lifecycle/takeover;
   - effect observation.
8. Каждый increment имеет native Orca tests.
9. `SP-04` внедряет policy только поверх доступных public capabilities.
10. Live Meta-O E2E проверяет полный lifecycle.

## Phase 4 — closure

11. Зафиксировать source commit и blob OIDs.
12. AST-extractor строит locator inventory.
13. Каждая row получает implementation и proof.
14. Raw ledger архивируется byte-for-byte.
15. Permanent closure index добавляется в repository.
16. Активный backlog очищается.
17. Final SHA проходит QC, две reviews и applicable E2E.
18. Временная program spec удаляется только после появления permanent closure index; deletion SHA снова проходит final gates.

---

# 12. Machine-checkable Definition of Done

Программа завершена только если:

1. Permanent closure index присутствует на final SHA.
2. Каждая row содержит immutable `git-mdast:` locator.
3. Locators разрешаются против исходных Git blobs.
4. Покрыты ровно:
   - `B-01..B-05`;
   - `BW-01..BW-17`;
   - `RR-01..RR-33`;
   - `RI-01..RI-51`;
   - `RI-49a`.
5. Нет orphan source nodes.
6. Нет двух primary rows для одного node.
7. Каждый duplicate имеет собственный locator и `merged_into`.
8. Каждый disposition имеет допустимый proof.
9. Raw ledger byte-identical source blob.
10. `docs/backlog.md` имеет ноль открытых entries.
11. Real-runs current ledger имеет ноль активных incidents.
12. `mo-reuse` отсутствует вне historical evidence.
13. `find-reuse` standalone и не знает Meta-O layout.
14. `find-reuse`, `senior-python`, `senior-jsts` проходят build/install tests.
15. Knowledge gate сканирует всю reachable history, включая ancestors до merge base.
16. Anchor stripping не меняет code nodes.
17. Watchdog capacity regression проходит.
18. Local-model hypothesis имеет go/no-go ADR.
19. Review core прошёл evaluation и остаётся evidence-first.
20. Все требуемые Orca public capabilities доступны.
21. Orca E2E не использует private transcript.
22. На одном full SHA проходят:

```bash
make mo-qc
make mo-test
make mo-smoke
```

23. На том же SHA есть два независимых vendor-diverse `PASS`.
24. Applicable E2E относится к тому же SHA либо удовлетворяет действующему docs-only carry-forward.
25. Final result содержит exact SHA и ссылки на QC/review/E2E.
26. Program spec может быть удалена, но closure index и archived raw evidence остаются на final SHA.
27. Permanent backlog test разрешает будущие правильно оформленные entries и не требует вечной пустоты.

---

# 13. Основные trade-offs

- Постоянный closure index предпочтительнее удаления временной matrix: без него final SHA не доказывал бы lossless closure. Он допустим, потому что имеет конкретных потребителей и хранит историю требований, а не runtime state.
- Full reachable-history scan дороже merge-base comparison, но только он ловит повторное использование ID, удалённых до merge base. Knowledge corpus мал, поэтому цена приемлема.
- Orca contract задаётся versioned schemas и error semantics, но не навязывает новый verb там, где можно расширить существующий native command. Это сохраняет implementability и запрет proxy.
- `bound_to_turn` выбран вместо расплывчатого `consumed`: первый статус проверяем транспортом, второй приписывал бы модели недоказуемое понимание.
- Registry catalog широк, но фактический run активирует только detected adapters. Это обеспечивает coverage без бесконечного поиска.
- Review core короткий, а taxonomy/language material подключается по risk. Prompt wall не становится default, но полезная специализация не теряется.
- Local model допускается только как measured fallback для `unclassified`; pattern и typed state остаются authority.

---

# 14. Риски и меры

| Риск | Мера |
|---|---|
| Upstream Orca задержит программу | отдельная critical-path specification; backlog не очищается раньше public capability и E2E |
| Closure index станет новым general state | только immutable historical mapping, никаких run transitions; именованные acceptance/QC/audit consumers |
| AST locators сломаются после переноса ledger | locators привязаны к immutable source blob OID и byte ranges |
| Reuse до merge base останется незамеченным | полный ancestor scan и transitions по parent edges |
| История станет медленной | path-limited Git walk; parse только commits, менявшие knowledge paths; без tracked cache |
| `find-reuse` завысит coverage PyPI | capability metadata различает semantic, name и exact lookup |
| Source tool отсутствует | explicit missing status и install/login instruction; никакого silent success |
| Orca schemas разойдутся с текущим CLI | обязательная compatibility table в upstream spec и native capability negotiation |
| «consumption» невозможно доказать | проверяемый `bound_to_turn` с execution ID |
| Session context загрязнится | first clean execution, own-history-only follow-up, typed compaction epoch |
| QC будет запущен параллельно | отдельный serialized gate и disposable diagnostics |
| Evaluation переобучится | held-out bugs, mutations, negatives и repeated runs |
| Архив примут за текущие требования | `docs/references/`, historical marker и durable destinations в closure index |
| Local model нарушит privacy/determinism | network off, exact installed model, pattern-first fallback |
| Будущий backlog будет запрещён | permanent test валидирует форму, но разрешает новые entries |

---

# 15. Отвергнутые варианты

- поддержка Herdr/Paseo;
- Meta-O workflow engine или state registry;
- private transcript fallback;
- compatibility alias `mo-reuse`;
- автоматическая установка или login;
- всегда активировать все registry adapters;
- всегда искать Rust;
- confidence threshold вместо evidence;
- четыре/пять обязательных reviewers без evaluation;
- принудительные review subagents;
- universal round cap;
- «три minor rounds → PASS»;
- persistent findings database;
- переписывание исходного ledger;
- удаление closure matrix до final SHA;
- history gate только от merge base;
- недоказуемый transport status `consumed`;
- Meta-O wrapper над Orca CLI.

---

# 16. Консервативные предположения

- upstream Orca изменения входят в программу; локальный proxy недопустим;
- historical closure index является допустимым durable knowledge artifact с именованными потребителями;
- исходным anchor служит `41a4898974a6a08eb415cb07ba849575c5964b61`, если implementation не зафиксирует более поздний lossless descendant;
- raw ledger архивируется без изменения байтов;
- Ollama — только первый evaluation runtime, не обязательная production dependency;
- `senior-python` и `senior-jsts` считаются существующими входами;
- exact provider/model/effort, credentials, subscription и destructive live actions остаются предусмотренными human boundaries;
- ни одна внешняя установка, issue publication или изменение upstream repository не считается выполненным без отдельной авторизации;
- неподтверждённая review/watchdog гипотеза закрывается только experiment verdict, а не декларацией.