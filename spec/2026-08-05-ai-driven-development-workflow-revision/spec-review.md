# Meta-O vNext: skills-first workflow

## 1. Статус, цель и release boundaries

Это master-spec следующей версии Meta-O. Она заменяет архитектурные решения из `spec/2026-07-24-ai-driven-development-workflow/`. Обратная совместимость с текущими `meta-o` CLI, state, adapters и installer scripts не требуется.

Цель — сохранить сильный агентный workflow без собственного workflow engine:

- отдельный researcher ищет готовые решения до реализации;
- executor доводит полную задачу до clean candidate commit через native `/goal`, где он квалифицирован;
- два независимых reviewer проверяют полный feature diff одного candidate;
- применимый E2E проверяет тот же candidate;
- orchestration выполняется через native Herdr или Omnigent interfaces;
- Git, tracked task/spec, project instructions и native sessions позволяют продолжить работу после ручного restart;
- custom code допускается только для узкой функции, которую нельзя получить через существующий CLI, skill, plugin или config.

Release разделён:

- **Herdr release** требует полностью qualified lifecycle `mo-herdr`, включая обязательный interactive `herdr agent read`/scroll contract для Claude, Codex и OpenCode;
- **Omnigent release** следует отдельно и требует qualified native automation surface;
- неподготовленный Omnigent не блокирует готовый Herdr release;
- `mo-omnigent` до qualification может поставляться только как preview с явным `unsupported`, но не как обещание полного workflow.

Phase 0 — обязательный capability-qualification gate. Провал fixture не разрешает ослаблять review, output completeness или candidate identity.

---

## 2. Нормативные принципы

1. Skills и reasoning являются orchestration layer. Общего executable router, FSM, durable run-state и backend adapter layer нет.
2. Executor не получает methodology skill. Он получает spec/task, project instructions, native goal и полные review findings.
3. Spec после reuse research read-only для executor.
4. Git workflow идентифицируется парой `BASE_SHA + CANDIDATE_SHA`, оба — полные Git SHA.
5. `CANDIDATE_SHA` обязан совпадать с `HEAD`, а tracked, staged и untracked state — быть clean до и после каждого gate.
6. Любой новый candidate SHA либо mutation проверяемого artifact инвалидирует все gates.
7. Reviewer output — полный Markdown без обязательного Structured JSON.
8. `mo-herdr` получает обязательные worker/reviewer turns только через Herdr `agent read` и Herdr-native scroll/visible surfaces. Provider-private JSONL, hooks, rollout files, SQLite и session databases не являются transport contract.
9. Non-interactive Herdr pane может использоваться для diagnostics или дополнительного review, но не заменяет обязательный interactive-agent-read acceptance route.
10. Native CLI не прячется за proxy scripts. Агенту доступен полный Herdr, Omnigent, Git и project task-runner interface.
11. Project-owned manifests, receipts, candidate digests и baselines создаются только при появлении реального внешнего consumer.
12. Ручной restart, безопасный rerun неизвестного gate и точечное вмешательство пользователя являются нормальным recovery.
13. Route, не доказавший completeness, goal, settlement или PATH contract, называется `unsupported`.
14. Reviewers независимы только при различной подтверждённой model lineage, а не просто при разных CLI или billing providers.
15. Phase 0 выбирает только между заранее описанными `available`, `unavailable`, `unsupported` и bounded helper contract; он не может молча породить новый workflow architecture.
16. Время человека дороже дополнительных agent turns, но не дороже correctness: безопасные reruns автоматичны, product decisions и необратимые действия остаются у пользователя.

---

## 3. Выбор архитектурного уровня

| Уровень | Flow | Recovery | Review/E2E | Нестандартные проекты | Стоимость | Verdict |
|---|---|---|---|---|---|---|
| Почти pure skills | Skills вызывают backend, Git и project CLI напрямую | Git/spec/native sessions + rerun unknown gates | Reasoning управляет reviewers и tester | Native task runner обнаруживается динамически | Минимальная | **Выбран** |
| Skills + узкие helpers | То же, но bounded zero-dependency helper закрывает один доказанный native gap | Helper не хранит run state | Допустимы wake или mechanical dist checks | Helper не нормализует project workflow | Низкая | **Разрешён условно** |
| Небольшой workflow engine | Router, FSM, actor registry, gate store, adapters | Automatic replay/takeover | Machine protocols и receipts | Универсальная project model | Высокая | **Отклонён** |

Pure-skills теряет exactly-once delivery, automatic takeover и durable gate registry. Эти гарантии заменяются дешёвыми Git-проверками и fail-closed rerun.

Узкий helper допустим только если:

- fixture доказывает отсутствие native solution;
- helper имеет один independently useful interface;
- не выбирает следующий workflow step;
- не хранит actor, run, candidate, gate или findings state;
- не скрывает native CLI;
- имеет bounded execution и documented exit codes;
- удаляется без изменения methodology.

---

## 4. Целевая архитектура

```text
User
  ├─ mo-herdr
  │    ├─ mo-reuse ──> tracked spec + first spec-only commit
  │    ├─ executor ──> native goal/session + candidate SHA
  │    ├─ mo-review ─> reviewer A + reviewer B
  │    ├─ project QC / deterministic smoke
  │    ├─ mo-e2e ────> only benchmark/browser cases
  │    └─ mo-watchdog (optional wake observer)
  │
  ├─ mo-omnigent ────> тот же lifecycle после native automation qualification
  ├─ mo-review ──────> reusable methodology; requires a qualified backend skill
  └─ mo-setup ───────> knowledge/instructions/QC/provider onboarding
```

Общая methodology хранится в одном canonical source:

```text
src/methodology/methodology.md
```

Backend skills добавляют только backend mechanics, qualified capabilities и version-specific traps.

Dist содержит механически созданные копии canonical reference. Build-time equality check относится только к distribution и не является runtime candidate digest.

Имена с `-orchestrate-`, Paseo и обязательный executor skill отсутствуют.

---

## 5. Final skills и interfaces

| Skill | Trigger | Input | Output | Responsibility |
|---|---|---|---|---|
| `mo-herdr` | Полный workflow в реальном `HERDR_ENV=1` | spec/task, optional `continue` | verified SHA либо `needs_attention` | Native Herdr lifecycle |
| `mo-omnigent` | Полный workflow через qualified native Omnigent automation | spec/task, optional `continue` | verified SHA либо `unsupported`/`needs_attention` | Native Omnigent lifecycle |
| `mo-reuse` | До implementation и при опровергнутом reuse decision | tracked spec/task, repo | research section + spec-only commit | Reuse research |
| `mo-review` | Из orchestrator или standalone | backend skill, artifact identity, routes | два verdict и bounded fix loop | Review methodology |
| `mo-setup` | Новый или неполный project contract | repo, conventions | proposed/applied setup | Knowledge, QC, provider preflight |
| `mo-e2e` | Agentic benchmark или browser testing | identity, docs, scenarios | evidence + PASS/FAIL | Agent-required E2E |
| `mo-watchdog` | Только после opt-in | orchestrator locator | wake/timeout/lost | 1:1 observation |

### 5.1. Workflow handoff

```text
STATUS: complete | needs_attention | unsupported
BASE: <full SHA or none>
CANDIDATE: <full SHA, artifact ID, or none>
SUMMARY: <short outcome>
ATTENTION: <only when needed>
```

Это human handoff, не persisted schema.

### 5.2. Run-local plan

```text
BASE_SHA: <full SHA>
BRANCH: <branch>
QC_COMMAND: <command>
CLEANUP_COMMAND: <command or not-applicable>
SMOKE_COMMAND: <command or not-applicable>
E2E_MODE: none | console | benchmark | browser
BACKEND_SKILL: mo-herdr | mo-omnigent
EXECUTOR: <locator>
REVIEWER_A: <effective route>
REVIEWER_B: <effective route>
```

Plan живёт в conversation. После restart durable source — Git/spec/project docs/native sessions.

---

## 6. Capability qualification

### 6.1. Status vocabulary

- `available` — documented/local surface и fixture PASS;
- `inferred` — косвенный signal, непригодный как gate evidence;
- `unavailable` — surface отсутствует или fixture FAIL;
- `unsupported` — составной route не выполняет обязательный contract.

Source-controlled product matrix:

```text
docs/capabilities/<backend>/<version>.md
dist/skills/<backend>/references/capabilities.md
```

Она содержит product/version facts, но никогда — project actors, candidate SHA, gates или findings.

### 6.2. Capability fixture package

Canonical sources:

```text
tests/capabilities/
  herdr/
    codex-agent-read.test.mts
    claude-agent-read.test.mts
    opencode-agent-read.test.mts
    prompt-transport.test.mts
    path-wrapper.test.mts
  omnigent/
    server-automation.test.mts
    export-completeness.test.mts
    resume.test.mts
    path-wrapper.test.mts
  watchdog/
    next-turn.test.mts
tests/fixtures/capabilities/
docs/capabilities/
```

Commands:

```bash
npm run test:capabilities -- --backend herdr
npm run test:capabilities -- --backend omnigent
npm run test:capabilities -- --case <case-name>
```

Каждый case пишет sanitized Markdown evidence:

```markdown
---
backend: herdr
backend_version: 0.8.0
harness: codex
case: codex-agent-read-long-turn
status: available | unavailable
measured_at: ISO-8601
command_surface: agent-read
---

## Preconditions
...

## Observations
...

## Boundary evidence
...

## Result
PASS | FAIL
```

Fixture runner:

- возвращает `0` только при PASS;
- `1` — asserted capability failed;
- `2` — prerequisite unavailable;
- не изменяет product capability matrix автоматически;
- matrix обновляется отдельным reviewed source change на основании evidence;
- credentials, prompts и transcripts в committed evidence редактируются до безопасного summary.

### 6.3. Backend × harness matrix

| Backend/harness | Subscription | Goal | Resume | Full turn | Last-turn time | Native compact | Cache/TTL | Recommendation | Fallback |
|---|---|---|---|---|---|---|---|---|---|
| Herdr + Codex | local subscription CLI | qualify native `/goal` | native session | mandatory `agent read`; inline launch | inferred from UI unless native signal | use only if documented | unavailable unless native signal | resume while goal/session coherent; fresh after ambiguous compaction | persistent-session fallback |
| Herdr + Claude | local subscription CLI | qualify `/goal` | native resume | mandatory `agent read`/scroll fixture | inferred | native compact only if documented | unavailable | resume while full task context survives; fresh if boundaries/context uncertain | route unsupported for gates |
| Herdr + OpenCode | provider-dependent | unavailable unless added natively | session resume | mandatory `agent read`/scroll fixture | inferred | provider command only if documented | provider-dependent/inferred | resume for short continuity; fresh after unknown replay/compaction | weaker persistent session |
| Omnigent + Codex harness | harness-dependent | qualify transport | export/session metadata | export after native automation qualification | inferred unless events expose it | harness-dependent | unavailable | resume only with exact conversation ID and coherent export | fresh conversation |
| Omnigent + Claude harness | harness-dependent | qualify transport | export/session metadata | export after native automation qualification | inferred | harness-dependent | unavailable | same | fresh conversation |
| Omnigent + other harness | provider-dependent | qualification required | qualification required | qualification required | unavailable by default | unavailable by default | unavailable by default | fresh until proven | unsupported |

Practical policy:

- `resume` выбирается, если exact session locator известен, last task/spec still applicable, no ambiguous compaction occurred и context signal не показывает exhaustion;
- `compact` используется только через documented native command и только если fixture подтверждает survival goal/spec constraints;
- `fresh` выбирается после ambiguous compaction, wrong task history, lost upper boundary, model/provider change или unknown session identity;
- cache/TTL никогда не угадываются по elapsed time;
- отсутствие cache signal влияет только на cost expectation, не на correctness;
- warm session предпочтительна для author fixes и disputes, но не ценой reviewer independence;
- automation cache economics остаётся deferred; textual policy является baseline.

### 6.4. Subscription-first

Route квалифицируется как subscription-first, если:

- запускает authenticated CLI/harness пользователя;
- не требует Meta-O API key;
- не переключается на metered API без явного выбора;
- сохраняет PATH wrapper;
- до запуска видимы harness, transport provider и model.

### 6.5. Release qualification

`mo-herdr` поддерживается только если доказаны:

- creation, prompt, follow-up и settlement;
- resume;
- goal lifecycle;
- full interactive `agent read`/scroll retrieval для Claude, Codex и OpenCode;
- safe full findings transport;
- PATH preservation;
- two independent model lineages.

`mo-omnigent` получает отдельный release только после доказанной native automation surface. Export без prompt/settlement control недостаточен.

---

## 7. Git lifecycle и candidate identity

### 7.1. Repository preflight

Orchestrator:

1. находит repository root;
2. читает branch, status, upstream, remote default branch и recent log;
3. не выполняет `git init` без explicit consent;
4. не stash/reset/clean/checkout/commit чужие изменения;
5. возвращает `needs_attention`, если existing changes нельзя однозначно отделить;
6. не начинает feature commits на default/protected branch;
7. создаёт `meta-o/<slug>` при начале authorized feature workflow на default branch;
8. продолжает однозначную existing feature branch.

Tracked, staged и untracked files делают worktree dirty. Ignored files не входят в Git freeze, но могут влиять на runtime; §7.4 задаёт отдельный environment contract.

### 7.2. `BASE_SHA`

Full feature workflow фиксирует base до spec-only commit:

```bash
git rev-parse HEAD
```

Review scope:

```bash
git diff --find-renames --find-copies "$BASE_SHA...$CANDIDATE_SHA"
git log --oneline "$BASE_SHA..$CANDIDATE_SHA"
```

Standalone base inference:

```bash
DEFAULT_REF="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD)"
git merge-base "$CANDIDATE_SHA" "$DEFAULT_REF"
```

Если `origin/HEAD` отсутствует, допускается configured upstream current branch. Если sources дают разные bases либо base не ancestor candidate, result = `needs_attention`.

### 7.3. Candidate

```bash
git rev-parse HEAD
git status --porcelain=v1 --untracked-files=all
```

Candidate существует только при exact SHA и пустом status.

### 7.4. Freeze и cleanup contract

До и после каждого gate:

```bash
test "$(git rev-parse HEAD)" = "$CANDIDATE_SHA"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

Project cleanup contract — documented combination of:

- `CLEANUP_COMMAND`;
- ignored paths that a gate may create;
- environment/database reset command;
- paths that must be absent before a gate;
- cleanup ownership.

Ignored configuration, local databases или caches, способные изменить behavior, очищаются или изолируются до каждого gate. Если их влияние неизвестно, gate unsupported.

При mutation:

- gate = `unknown`;
- orchestrator определяет originating gate;
- orchestrator может удалить только доказанно ephemeral artifacts, созданные им в documented paths;
- source/config changes передаются author;
- новый accepted artifact создаёт новый candidate;
- все gates повторяются.

Для non-Git artifact новый `ARTIFACT_ID` симметрично инвалидирует оба reviews и E2E.

### 7.5. Restart base recovery

Orchestrator ищет commits, меняющие tracked spec:

```bash
git log --follow --format='%H' -- <spec-path>
```

Candidate first spec commit должен:

- быть самым ранним commit текущей feature, касающимся spec;
- иметь diff только в task/spec files;
- содержать `## Reuse research`;
- предшествовать implementation commits.

Его first parent становится recovered `BASE_SHA`. Если подходят несколько commits или history rewritten, guessing запрещён.

---

## 8. Feature lifecycle

### 8.1. Preflight

Orchestrator:

1. читает task/spec, instructions, task runner, manifests и language config;
2. читает installed backend skill/help;
3. проверяет PATH providers;
4. проверяет capability matrix;
5. определяет base, branch и clean state;
6. выбирает QC/cleanup/smoke/E2E plan;
7. показывает model set одной строкой;
8. предлагает watchdog только перед длинным wait;
9. запускает `mo-reuse`.

Startup interaction:

```text
Models: exec=<...>; research=<...>; reviewA=<...>; reviewB=<...>; e2e=<...>.
Continue, or say “models” to change.
```

Полный catalog показывается только при `models` или meaningful successor evidence.

Invocation без аргументов продолжает работу только при одной однозначной task/spec reality; иначе skill просит указать task.

### 8.2. URL input

URL ingestion разрешён только при следующих условиях:

- HTTPS;
- максимум 5 redirects;
- final URL также HTTPS;
- запрещены loopback, link-local, private network и credential-bearing URLs;
- не используются ambient cookies или credentials;
- text/HTML/Markdown limit — 2 MiB decompressed;
- PDF limit — 10 MiB;
- unsupported content type, malformed content или truncation дают `needs_attention`;
- retrieved content сохраняется в tracked task/spec только после faithful extraction.

Authenticated/private content должен быть передан через user-authorized connector или как supplied content, а не через guessed credentials.

### 8.3. Reuse и первый commit

Если input был text/URL, orchestrator создаёт tracked task/spec с:

- problem;
- acceptance criteria;
- constraints;
- `## Reuse research`.

Researcher меняет только research section, кроме первоначального создания spec.

Первый commit содержит только task/spec и reuse research. Staged diff проверяется до commit.

При опровергнутом reuse decision отдельный researcher обновляет section, создаёт новый spec-only commit, executor rereads spec, новый candidate invalidates gates.

### 8.4. Executor

Executor обязан:

1. прочитать всю spec и instructions;
2. реализовать полный scope;
3. написать behavior-constraining tests;
4. соблюдать reuse decision;
5. выполнить knowledge sync;
6. выполнить typecheck/lint/tests/build/QC/smoke;
7. не ослаблять QC;
8. не менять spec;
9. создать clean candidate;
10. не push/tag/PR без explicit request.

### 8.5. Gate order

Baseline gates выполняются последовательно в одном worktree:

1. QC;
2. deterministic smoke;
3. reviewer A;
4. reviewer B;
5. applicable agent-required E2E;
6. final freeze check.

Reviewer A и B first pass логически независимы: B не получает findings A.

Параллельность разрешена только в отдельных isolated worktrees или read-only clones, каждый pinned на `CANDIDATE_SHA`, с отдельными temp/cache/database paths. Shared mutable worktree parallelism запрещён.

Последовательность выбрана сознательно: она медленнее wall-clock, но предотвращает недиагностируемые cross-gate mutations. Долгие waits выполняются autonomously и не требуют постоянного внимания пользователя.

---

## 9. Native goal lifecycle

Goal живёт до первого executor-owned candidate, удовлетворяющего executor DoD. Перед gates executor settled, goal paused/cleared либо session safely stopped.

```text
/goal Read the complete task at <SPEC_PATH> and applicable project instructions.
Implement the full scope, including behavior-constraining tests and durable
knowledge updates, until there is a clean candidate commit that passes the
discovered project QC and applicable deterministic smoke, or report a real
needs_attention blocker. Keep the spec read-only.
```

Claude goal ≤4,000 characters.

### 9.1. Codex

Qualification проверяет:

- `features.goals`;
- atomic `/goal` from idle;
- observable active state;
- resume survival;
- `/goal pause|resume|clear`;
- no activity after pause;
- `--no-alt-screen` under Herdr.

Перед gates — `/goal pause`; после completion — `/goal clear`.

### 9.2. Claude Code

Qualification проверяет trust, hooks, goal size, activation, resume и deactivation.

Goal evaluator не является QC evidence. Если pause/clear недоступны, executor process должен быть safely stopped. Недоказанная deactivation делает route unsupported для frozen lifecycle.

### 9.3. OpenCode и weaker fallback

При отсутствии native goal:

- persistent executor session;
- completion-oriented prompt;
- premature idle → follow-up;
- native resume;
- explicit weaker classification;
- никакой собственной FSM.

---

## 10. `mo-herdr`

### 10.1. Native control

Precondition — реальный `HERDR_ENV=1`.

Skill использует Herdr actor/pane IDs и проверяет state до prompt. `agent prompt --wait` означает settlement, а не turn boundary.

### 10.2. Mandatory interactive-agent-read route

Для Claude, Codex и OpenCode release acceptance обязателен один и тот же class of transport:

```bash
herdr agent read <actor> --source recent-unwrapped --lines <N>
herdr agent read <actor> --source visible
```

Procedure:

1. record exact actor and exact prompt;
2. wait for settled state;
3. read 200, 400, 800, 1600, 3200 rows;
4. require positive upper boundary: exact echoed prompt or qualified rendered prompt boundary;
5. require positive lower boundary: completed/idle input boundary after response;
6. extract continuous assistant interval;
7. if alternate-screen history requires scrolling, use only qualified Herdr-native scroll surface that does not send keys into agent input;
8. collect visible windows with exactly 32 rendered rows of overlap;
9. each overlap must match uniquely in both adjacent windows;
10. zero or multiple matches make continuity `unknown`;
11. continue until positive prompt boundary is reached;
12. never infer completeness merely because a larger window stopped growing.

Codex запускается с `--no-alt-screen`. Claude/OpenCode may use qualified accessibility/inline modes, but must still be addressed as Herdr agents and read through `agent read`.

If installed Herdr version has no safe scriptable scroll surface and recent history lacks prompt boundary, that provider route is `unavailable`. `attach` и `send-keys` не используются как automated reconstruction.

### 10.3. Additional pane route

Dedicated non-interactive `claude -p`, `codex exec` или `opencode run` pane разрешён для:

- diagnostics;
- additional fact-check;
- experimentation;
- fallback human assistance.

Он не удовлетворяет mandatory interactive-agent-read acceptance и не может один обеспечить Herdr release.

### 10.4. Completeness and retry budget

PASS требует:

- exact actor;
- exact positive upper boundary;
- exact lower boundary;
- continuous response;
- unique overlaps where scrolling occurred;
- no truncation indication;
- complete verdict fields.

Window exhaustion without upper boundary is only `inferred` and never PASS.

Budget:

- one progressive retrieval attempt;
- one rerun on another already qualified interactive configuration;
- then `needs_attention`;
- deterministic failure не повторяется бесконечно.

### 10.5. Findings transport

`MAX_HANDOFF_BYTES` не является фиксированной константой. Для каждого backend/harness он определяется fixture:

```text
min(
  native prompt/input limit,
  direct argv transport limit,
  target context admission,
  largest verified lossless input
) × 0.75 safety factor
```

Transport допускается только через structured direct-argv/process API, где Markdown передаётся отдельным argument value без shell interpolation. Если host предоставляет только shell command string, arbitrary Markdown через command substitution, inline quoting или paste не считается qualified.

Input fixture отправляет approximately 60 KiB Markdown с уникальными tokens в начале, середине и конце. Target должен процитировать все три tokens и digest received byte length. Bracketed-paste placeholder без доказанного раскрытия считается FAIL.

Если verdict превышает qualified capacity:

- он не truncates и не summarizes;
- file handoff, nonce и provider-private transcript не используются;
- route возвращает `needs_attention`.

### 10.6. Fixtures

Для каждого provider:

- >1 viewport, >200, >800 и ~3200 rows;
- prompt boundary retained;
- missing upper/lower boundary;
- unique and ambiguous overlap;
- tool calls before final;
- sequential turns;
- resume/compaction;
- incoming large findings;
- outgoing result over capacity;
- PATH wrapper;
- gate process mutation.

---

## 11. `mo-omnigent`

### 11.1. Omnigent 0.6 reality

Omnigent 0.6 предоставляет:

- interactive `run`;
- interactive `resume`;
- interactive `attach`;
- server lifecycle;
- native `session export`;
- optional native `--log`.

Он не предоставляет documented non-interactive `send`, turn-level `wait`, conversation `status` или session-list automation sufficient for a full orchestrator.

Поэтому Omnigent 0.6 CLI alone не является supported automated backend.

### 11.2. Chosen host/settlement model

Full `mo-omnigent` будет использовать только documented native Omnigent server HTTP/SSE API, если Phase 0 подтвердит:

- public supported API, а не reverse-engineered private endpoint;
- conversation creation;
- exact prompt submission;
- turn-start and turn-settled events;
- follow-up;
- resume;
- cancellation;
- effective harness/model;
- complete export;
- local worker PATH preservation.

Rejected for baseline:

- hosting Omnigent REPL inside Herdr, потому что `mo-omnigent` должен оставаться самостоятельным backend;
- stdin/PTY driver around interactive REPL, потому что это новый adapter/proxy;
- declaring manual REPL equal to automated lifecycle.

Если public server automation не квалифицирована, `mo-omnigent` остаётся preview/manual assistance skill со status `unsupported`; Herdr release продолжается независимо.

### 11.3. Export completeness

Native export:

```bash
omnigent session export --id <conversation-id> --output <temporary-path>
```

Requirements:

- exit 0;
- first record `session_meta`;
- subsequent records `item`;
- parseable through EOF;
- exact last user prompt found once;
- all assistant items until next user/EOF;
- no truncation marker;
- long-export fixture passes.

`omnigent run --log` может использоваться как independent native completeness cross-check. Это Omnigent-owned artifact, не provider-private transcript. Расхождение export/log делает result `unknown`.

Temporary files находятся вне project tree и удаляются после read.

### 11.4. Omnigent fixtures

- server API discovery and version;
- create/send/start/settled/follow-up;
- cancellation;
- exact conversation ID;
- resume;
- long export;
- export/log agreement;
- silent-limit detection;
- harness PATH;
- goal transport/survival;
- premature idle;
- server restart.

---

## 12. `mo-review`

### 12.1. Packaging and backend dependency

`mo-review` independently installable как methodology skill, но standalone execution требует установленного qualified backend skill.

Required input:

```text
BACKEND_SKILL: mo-herdr | mo-omnigent
```

Rules:

- explicit override всегда побеждает discovery;
- без override автоматически выбирается backend только если ровно один qualified backend skill доступен;
- если доступны оба либо ни одного, result = `needs_attention`;
- `mo-review` не копирует backend mechanics;
- common contract лежит в `mo-review/references/backend-contract.md`;
- backend-specific execution принадлежит selected backend skill.

### 12.2. Modes

Orchestrated Git mode:

```text
MODE: git
BACKEND_SKILL: mo-herdr | mo-omnigent
BASE_SHA: <full SHA>
CANDIDATE_SHA: <full SHA>
AUTHOR_LOCATOR: <locator>
REVIEWER_A: <route>
REVIEWER_B: <route>
SPEC_PATH: <path>
```

Standalone artifact mode:

```text
MODE: artifact
BACKEND_SKILL: <skill>
ARTIFACT_PATH: <single file>
ARTIFACT_ID: sha256:<hex>
SPEC_PATH: <path or none>
AUTHOR_LOCATOR: <optional>
```

New artifact digest invalidates every prior verdict.

### 12.3. Route identity and independence

```json
{
  "backend": "herdr",
  "harness": "opencode",
  "transportProvider": "openrouter",
  "modelVendor": "openai",
  "modelLineage": "gpt-x",
  "model": "openai/gpt-x-version",
  "effort": "high"
}
```

Normalization authority, in order:

1. native catalog metadata;
2. documented provider model metadata;
3. explicit user configuration;
4. otherwise `unknown`.

Independence requires different known `modelVendor` and different `modelLineage`. `unknown` cannot prove independence. OpenRouter billing an OpenAI model remains `modelVendor=openai`.

### 12.4. Verdict

```markdown
## Verdict
PASS | FAIL

BASE: <full SHA or none>
CANDIDATE: <full SHA, artifact ID, or none>
WORKTREE: clean | dirty | not-applicable

## Findings
### critical | major | minor: <title>
Evidence, impact, suggested correction.

## Residual risks
...
```

PASS запрещён при unresolved:

- acceptance defect;
- correctness defect;
- security/privacy defect;
- missing behavior-constraining test;
- critical or major finding.

Minor может остаться только если это non-defect suggestion или low-impact maintainability trade-off, оба reviewers либо dispute adjudication согласны, а orchestrator записал rationale. Severity не позволяет скрыть defect.

### 12.5. Lenses

- full scope/business goal;
- correctness/errors/concurrency/security;
- tests;
- QC integrity;
- architecture and necessity;
- reuse;
- knowledge sync;
- purpose/overloads;
- excess tooling/wrappers;
- privacy/dependency risk.

### 12.6. Fix convergence

Maximum — 3 fix rounds per candidate lineage.

- Round 1–2: подтверждённые defects исправляются независимо от severity.
- Начиная с Round 3 новый finding принимается в current scope, если он относится к последнему changed set, является critical/major с concrete evidence либо ранее был невозможно observable.
- Новый minor на untouched code становится residual suggestion или `docs/todo.md`, но не расширяет feature.
- После Round 3 remaining substantive defects дают `needs_attention` с одним consolidated list.
- Новый candidate в каждом round всё равно повторяет all gates.

### 12.7. Disputes and ephemeral reviewers

Preferred path — same native reviewer session.

Если qualified reviewer route ephemeral, «original reviewer» означает тот же effective route/model role, а не обязательно тот же process. Новый process получает:

- original full verdict;
- author rebuttal;
- relevant diff/evidence;
- exact dispute question.

Это сознательная потеря conversational continuity, компенсированная полным textual context.

Reviewer subagent fan-out: 0 small, ≤3 medium, ≤6 large.

---

## 13. `mo-reuse`

### 13.1. Privacy

Conservative default — private. Repo/query считается public только если одновременно:

- current repository public status доказан положительно;
- task terms already public;
- project instructions не запрещают disclosure.

Private queries sanitise internal names, customers, URLs and identifiers.

### 13.2. Network failure

При отсутствии auth/network, rate limit или невозможности безопасной sanitization research получает status `incomplete`.

`build/extend` не выбирается автоматически: это создало бы систематический build bias. Workflow возвращает `needs_attention`, если reuse decision materially affects architecture or dependency choice. Локальная inspection существующих dependencies продолжается.

### 13.3. Search protocol

Default — три adaptive rounds:

1. broad capability/domain;
2. terms/API/standards;
3. gap-focused alternatives/bindings.

Каждый включает:

- GitHub search per project language;
- mandatory Rust search;
- native registries;
- first page up to 30;
- query evolution.

### 13.4. Result

```markdown
## Reuse research

### Existing project capabilities
...

### Search iterations
- Round 1: sources, sanitized queries, result, next change
- Round 2: ...
- Round 3: ...

### Finalists
| Candidate | Fit | License | Maintenance/adoption | Integration/binding cost | Risks |

### Decision
reuse | extend | build | incomplete
...
```

---

## 14. Project commands, knowledge and `mo-setup`

### 14.1. Task-runner precedence

1. existing aggregate;
2. existing scripts/task runner;
3. alias in existing runner;
4. mature tool/config;
5. custom checker only after proven gap.

Make is not universal.

### 14.2. Knowledge layout

Small E2E set:

```text
docs/business.md
docs/glossary.md
docs/todo.md
docs/architecture/
docs/e2e.md
AGENTS.md
CLAUDE.md
```

Large E2E set:

```text
docs/e2e/
  index.md
  <group>.md
```

Use grouped layout when there are more than 5 scenarios, more than 2 environment classes, or selection would otherwise require running irrelevant expensive cases.

`index.md` defines environment, prerequisites, selection, evidence, cleanup and available groups. Each group defines:

- when to select it;
- scenarios;
- commands/actions;
- evidence;
- cleanup.

Tester selects relevant groups, not the whole catalog by default.

### 14.3. Knowledge sync

Knowledge sync means transferring only durable facts made true, false or newly important by the feature:

- business meaning → `docs/business.md`;
- term definitions → `docs/glossary.md`;
- architecture boundaries/decisions → `docs/architecture/`;
- deferred actionable debt → `docs/todo.md`;
- E2E operation → E2E docs.

It happens before candidate creation. The spec is not copied into knowledge docs.

Reviewer verifies:

- new durable facts have a destination;
- stale facts were corrected;
- temporary implementation narrative was not promoted to durable knowledge.

A completed tracked spec remains historical evidence but ceases to be the active operational source after final PASS and knowledge sync. Retirement or archival is a separate docs-only project convention. A text-only task is converted to tracked spec before reuse; otherwise no durable task source exists.

### 14.4. Instructions

`AGENTS.md` contains outcomes, boundaries, purpose, commands, tests, QC integrity, knowledge destinations, spec read-only rule and no unsolicited push/tag/PR.

`CLAUDE.md` uses supported include/link or a short reviewed copy.

Global architecture hygiene across the whole repository is explicitly deferred to a future standalone tool. Feature reviewers inspect affected boundaries but do not pretend to perform exhaustive global architecture auditing.

### 14.5. Wrappers/trust/hooks

Check:

```bash
command -v claude codex opencode
which -a claude codex opencode
```

Verify argument forwarding, permission flags, trust, hooks and worker-side PATH resolution.

### 14.6. Self-hosting boundary

Meta-O applies this methodology to Meta-O itself only after explicit user choice. Reflection never auto-launches self-improvement.

---

## 15. QC profiles

### 15.1. Python

Preserve existing supported stack. Default candidates:

- Ruff;
- mypy or Pyright;
- pytest;
- Import Linter;
- Interrogate where realistic;
- Pylint `too-many-lines` where needed;
- Deptry for proven hygiene problems.

### 15.2. TypeScript compatibility profile

Preserve supported existing ESLint major. Do not migrate ESLint 8/9/10 solely for Meta-O.

Components:

- existing `tsc --noEmit`, `tsc -b` or framework checker;
- existing ESLint flat/legacy format where supported;
- version-compatible `typescript-eslint`;
- `eslint-plugin-jsdoc`;
- `eslint-plugin-boundaries` for import responsibility boundaries;
- existing tests;
- Prettier separate from correctness.

Mechanical defaults:

- file: 450 lines;
- function: 70 lines;
- complexity: error 15, reviewer attention 10;
- statements: 35;
- nesting depth: 4.

Class size 300 lines is a reviewer lens, not a mechanical gate, until a mature qualified plugin exists.

JSDoc fixture config must cover overload AST contexts including:

- `TSDeclareFunction`;
- `TSMethodSignature`;
- implementation signature where present.

Exact selector syntax is version-qualified in `typescript-qc.md`; a config is accepted only if overload fixtures fail when docs are absent.

`eslint-plugin-boundaries` must enforce named element types and allowed dependency directions; presence without configured rules does not satisfy the contract.

### 15.3. Fast profile

- Oxlint type-aware only for supported TypeScript matrix;
- `tsc` remains type source;
- narrow ESLint pass retains JSDoc, overload and boundary rules;
- existing tests remain.

Fallback is compatibility profile.

### 15.4. Fixtures

Verify overload purpose, boundary violation, generated exceptions, typed project graph, compatibility/fast parity and real test execution.

Brownfield baseline is not automatic.

---

## 16. Purpose and architecture contract

Purpose explains:

- why entity exists;
- invariant/responsibility/business role;
- what becomes false or unnecessary if removed.

Implementation restatement is insufficient.

Mechanical presence applies to first-party modules, exported APIs, classes, architecture boundaries and every overload declaration.

Linters check presence/shape; reviewers check meaning.

Formal GRACE `B→A→M` chains and universal grep anchors remain rejected without a consumer. Semantic intent survives through business, architecture and necessity lenses.

Markdown automation uses a mature AST library, never regex parsing.

---

## 17. E2E

| Kind | Owner | Contract |
|---|---|---|
| Deterministic console smoke | Executor | `SMOKE_COMMAND` |
| Agentic benchmark | `mo-e2e` | selected documented groups |
| Browser E2E | `mo-e2e` | browser skill + selected groups |

Verdict:

```markdown
## E2E Verdict

BASE: <full SHA>
CANDIDATE: <full SHA>
SCENARIOS: <groups>
VERDICT: PASS | FAIL

## Evidence
...

## Cleanup
...
```

Help-only target:

```text
AGENT_REQUIRED: not executed
See: docs/e2e.md or docs/e2e/index.md
```

Он завершается code `0` для совместимости с task-runner aggregators. Это сознательный компромисс: CI не может считать такой target E2E evidence. Без отдельного `mo-e2e` verdict agent-required gate остаётся `unknown`, независимо от зелёного informational command.

---

## 18. Models and `~/.meta-o`

```json
{
  "schemaVersion": 1,
  "defaults": {
    "executor": {
      "backend": "herdr",
      "harness": "codex",
      "transportProvider": "openai-subscription",
      "modelVendor": "openai",
      "modelLineage": "gpt-x",
      "model": "model-id",
      "effort": "high"
    }
  },
  "projects": {
    "<sha256(realpath-project-root)>": {
      "roles": {},
      "updatedAt": "ISO-8601"
    }
  },
  "dismissedUpgrades": {
    "<modelVendor>/<model>": {
      "successor": "<modelVendor>/<model>",
      "dismissedAt": "ISO-8601"
    }
  }
}
```

### 18.1. Validation

After project/default inheritance, selected roles require non-empty:

- `backend`;
- `harness`;
- `transportProvider`;
- `modelVendor`;
- `modelLineage`;
- `model`.

`effort` may be null only when harness has no effort control. Empty role objects are valid overrides only if defaults produce a complete route. Unknown fields are preserved but ignored.

Unknown schema or corrupt JSON is never overwritten.

### 18.2. Optimistic single-writer persistence

No long-lived lock/helper is introduced.

Algorithm:

1. read exact original bytes and calculate SHA-256;
2. validate schema and inherited routes;
3. create same-directory `.models.json.tmp.<random>` with mode `0600`;
4. write complete new JSON and fsync;
5. reread current `models.json`;
6. if current hash differs from original, remove only the newly created temp and abort persistence;
7. otherwise atomic rename temp over `models.json`;
8. fsync directory where supported.

Pre-existing orphan temp files are ignored and never deleted automatically. This is optimistic compare-and-swap, not a promise of multi-writer serialization.

### 18.3. Discovery and upgrades

Catalog authority:

1. native supported-model metadata;
2. native catalog command;
3. configured explicit route;
4. recent history only as hint.

History reads provider/model/time metadata, not transcript content.

Successor suggestion requires authoritative replacement/successor metadata or an explicitly maintained lineage map. Lexical guessing is forbidden.

`mo-models.mjs` remains deferred.

---

## 19. Human attention policy

User attention is required only for:

- product meaning or scope;
- irreversible/production action;
- credentials/private data;
- meaningful billing/subscription/model-route change;
- ambiguous branch/base/author;
- incomplete reuse research that changes architecture;
- unavailable required backend capability;
- unresolved substantive defects after 3 fix rounds;
- optional watchdog launch;
- self-hosting Meta-O improvement.

Not required for:

- rerunning unknown gates;
- choosing safe task-runner aliases;
- retrying one transient native operation;
- technical dispute resolvable by evidence;
- cleanup of proven orchestration-owned temp artifacts;
- ordinary model reuse with no successor evidence.

---

## 20. `mo-watchdog`

Watchdog observes one orchestrator, not workers directly.

Observable chain:

1. executor/reviewer/backend settles;
2. native backend changes worker state;
3. orchestrator is expected to read that state and continue;
4. watchdog wakes or pings orchestrator after a bounded interval;
5. orchestrator classifies the worker and decides whether user attention is needed.

Watchdog itself never classifies child completion from orchestrator idle state.

Skill-only baseline uses native wait. Negative fixture permits:

```text
node mo-watchdog.mjs \
  --backend herdr|omnigent \
  --orchestrator-locator <locator> \
  --timeout-ms <default 300000> \
  --poll-ms <default 5000>
```

Output:

```text
STATUS: wake_sent | timeout | lost
LOCATOR: <locator>
DETAIL: <text>
```

Exit codes:

- `0` — wake sent;
- `2` — timeout;
- `3` — locator lost;
- `4` — ping failed;
- `64` — invalid arguments.

Helper proof:

```text
Consumer: mo-watchdog skill
Native gap: native wait did not produce a new observer turn
Why reasoning is insufficient: observer cannot resume itself
Interface: bounded wake of one orchestrator
State written: none
Removal test: delete helper when native next-turn fixture passes
```

---

## 21. Recovery and naming

Herdr names match `[a-z][a-z0-9_-]{0,31}`.

Algorithm:

1. normalized task slug;
2. fallback `task`;
3. six hex chars from absolute spec-path SHA-256;
4. reserve suffix;
5. truncate to 32.

Suffixes: `-exec`, `-ra`, `-rb`, `-e2e`, `-watch`.

Recovery reads Git/spec/docs/native sessions. Ambiguous gates rerun. Ambiguous branch/base/author produces one precise attention item.

User-facing status is only `idle`, `needs_attention` or `unsupported`.

---

## 22. Reflection and knowledge retirement

Reflection occurs only after repeated/systemic failure:

```text
Area/path | incident | why checks missed it | practical risk | proposed follow-up
```

It goes to `docs/todo.md` and does not expand current feature.

Spec remains tracked historical evidence. Mandatory retirement is deferred. A project may later define a docs-only archival convention after knowledge sync and final gates.

Substantive accepted risk receives nearby durable `why` only when future reviewers would otherwise lose the rationale.

---

## 23. Transfer from `execute-feature`

| Requirement | New owner |
|---|---|
| Full scope | spec + goal |
| Read complete task | goal + project instructions |
| Behavior-constraining tests | instructions + review |
| Typecheck/lint/test/build | run-local QC |
| No QC weakening | instructions + review |
| Architecture | instructions + lint + review |
| Purpose | project contract + review |
| Knowledge sync | §14.3 |
| Reuse | `mo-reuse` |
| Clean commit | candidate contract |
| Continuation | native goal/session |
| Full findings | qualified transport |
| No push/tag/PR | instructions |
| Real blockers | attention handoff |

Executor ritual, progress schema and mandatory methodology reading are not transferred.

Optional compact handoff ≤4 KiB is deleted: native session plus exact spec/findings are the handoff. A new summary would create another potentially stale source.

---

## 24. State-origin and loss audit

| State family | Old failure prevented | New recovery | Conscious loss |
|---|---|---|---|
| Run/FSM state | Exact next transition | Inspect Git/spec/sessions | No exact replay |
| Actor registry | Stable actor lookup | Deterministic names + native listing | Ambiguity may require attention |
| Write-ahead delivery | Duplicate prompt fencing | State check + safe rerun | No exactly-once |
| Findings store | Durable machine blockers | Full native session output | Missing verdict reruns |
| Gate receipts | Cross-gate revision proof | SHA pair + freeze | No historical registry |
| Snapshot digest | Worktree mutation detection | Git status before/after | Ignored environment needs cleanup contract |
| Immutable spec copy | Stable executor input | Tracked read-only spec | Rebase/history rewrite changes identity |
| Model state | Repeatable routes | Narrow `models.json` | No run-specific model history |
| Watchdog state | Takeover/liveness | Bounded wake | No deterministic service |
| E2E/adoption manifests | Machine selection | Human-readable docs | No generic external consumer |
| Knowledge plan | Forced sync checklist | Direct docs + review | No machine-countable impact plan |

---

## 25. Tooling audit

| Component | Decision | Replacement |
|---|---|---|
| `meta-o` entry/router commands | delete | Backend skills |
| Feature/session/status commands | delete | Native backend |
| State/write-ahead/takeover commands | delete | Git/spec/session recovery |
| Review/findings commands | replace | `mo-review` |
| QC/adoption commands | replace | Native task runner |
| FSM/routing core | delete | Reasoning |
| Project/run state | delete | Git/spec/sessions |
| Model preferences | keep narrow | `models.json` |
| Model helper | defer | Native catalogs |
| Findings/gate stores | delete | Full Markdown + rerun |
| Git snapshot digest | delete | SHA + freeze |
| Non-Git digest | keep run-local | Artifact identity |
| Worktree helper | delete as default | Native Git when needed |
| Herdr/SessionAdapter | delete | Direct Herdr skill |
| Omnigent adapter | delete | Qualified native server API |
| Paseo | defer outside scope | None |
| Capability suite | replace | §6.2 fixtures |
| `execute-feature` | delete | §23 transfer |
| Reuse skill | replace | `mo-reuse` |
| Review role skill | replace | full `mo-review` |
| Goal wrappers | delete | Native goal |
| PATH approval runtime | delete | User wrappers |
| Context/cache automation | defer | §6.3 textual policy |
| Transcript parser | defer | Native read/export only |
| Installer/update scripts | delete | APM/skills |
| Watchdog service | delete | Skill/bounded wake helper |
| Generic QC wrappers | delete | Mature configs |
| QC/E2E/adoption manifests | delete | Commands/docs/verdicts |
| `KnowledgeImpactPlan` | delete | Knowledge sync |
| Optional ≤4 KiB handoff | delete | Native session + exact sources |
| Code-health baseline | defer | Proven brownfield need |
| Custom import graph | delete | Import Linter/`eslint-plugin-boundaries` |
| Markdown regex parser | delete | Mature AST |
| QC templates | keep in references | §15 |
| Purpose checker | replace | Standard linter + review |
| Global architecture audit | defer | Future standalone user-chosen tool |
| Mandatory spec retirement | defer | Project docs convention |
| Reflection ledger | delete | One todo entry |

General transcript parser boundary: it may be reconsidered only for a new public backend surface with a real consumer. Provider-private transcripts never become an automatic fallback.

---

## 26. Guarantees consciously removed

Removed:

- exactly-once delivery;
- exact orchestrator replay;
- automatic takeover;
- generation fencing;
- immutable spec blob;
- Git snapshot digest;
- rebase-stable attestation;
- gate receipts;
- Structured JSON findings;
- mandatory worktrees;
- durable run state;
- deterministic watchdog service;
- machine-countable blockers;
- mandatory GRACE chain/anchors.

Consequences are explicit: unknown work reruns, rebase invalidates gates, ambiguous recovery asks once, missing full output blocks route.

---

## 27. Pre-mortem against control-layer bloat

| Failure | Signal | Mitigation |
|---|---|---|
| Backend proxy duplication | Scripts mirror native commands | Delete script; keep reference |
| Run plan becomes manifest | Parser/registry appears | Conversation-only plan |
| Capability matrix becomes run state | Actors/SHA appear | Product/version facts only |
| Model helper becomes router | Launches agents | Helper deferred |
| Watchdog becomes daemon | Multiple projects/state | 1:1 bounded wake |
| Retrieval becomes transcript parser | Private files/markers | Native surfaces only |
| QC creates second runner | Make added to non-Make repo | Reuse native runner |
| Failures create receipts | No consumer | Rerun unknown |
| Skills drift | Hand-edited copies | Canonical build copy |
| Phase 0 never finishes | Fixture has no binary result | PASS/FAIL and release split |

Every new helper requires the proof template from §3.

---

## 28. Distribution

```text
dist/
  skills/
    mo-herdr/
      SKILL.md
      references/
        methodology.md
        capabilities.md
    mo-omnigent/
      SKILL.md
      references/
        methodology.md
        capabilities.md
    mo-reuse/
      SKILL.md
    mo-review/
      SKILL.md
      references/backend-contract.md
    mo-setup/
      SKILL.md
      references/python-qc.md
      references/typescript-qc.md
    mo-e2e/
      SKILL.md
    mo-watchdog/
      SKILL.md
      scripts/mo-watchdog.mjs   # conditional
  README.md
  LICENSE
```

Source `apm.yml` не требуется: оба managers поддерживают bare skill bundles. Installation acceptance:

```bash
apm install ./dist --skill mo-herdr --target agent-skills
apm install ./dist --skill mo-review --target agent-skills

npx skills add ./dist --skill mo-herdr -a codex --copy -y
npx skills add ./dist --skill mo-review -a codex --copy -y
```

APM supports installing bare `skills/<name>/SKILL.md` bundles and selecting a skill with `--skill`; `npx skills add` supports local paths and skill selection. [Microsoft APM](https://github.com/microsoft/apm), [Vercel Skills CLI](https://github.com/vercel-labs/skills)

Rules:

- frontmatter only `name` and `description`;
- each skill can be installed separately;
- `mo-review` declares runtime requirement for a qualified backend skill;
- no runtime shared package;
- initial dist lacks `mo-models.mjs`;
- installed skill has no source-repo path dependency;
- build command `npm run build:dist` copies canonical methodology;
- `npm run check:dist` checks byte identity and standalone references;
- no `install.sh`/`update.sh`.

---

## 29. Implementation and migration

### Phase 0A — Herdr qualification

1. Capability runner/evidence format.
2. Claude/Codex/OpenCode interactive agent-read fixtures.
3. Positive boundaries and unique overlaps.
4. Codex inline mode.
5. Incoming/outgoing large transport.
6. Goal activation/deactivation/resume.
7. PATH wrappers.
8. Independent model lineages.
9. Watchdog next-turn.
10. APM/skills install.
11. Python/TypeScript fixtures.

### Phase 1 — Herdr release

1. Canonical methodology.
2. `mo-reuse`, `mo-setup`, `mo-review`, `mo-e2e`.
3. `mo-herdr`.
4. Conditional watchdog.
5. Real feature through qualified Herdr.
6. Destructive deletion of old flow after acceptance.

### Phase 0B — Omnigent qualification

1. Documented public server API discovery.
2. Create/send/settled/follow-up/cancel.
3. Resume and goal.
4. Export/log completeness.
5. PATH/harness identity.
6. Independent reviewers.
7. If unavailable, preserve `unsupported` preview without adapter.

### Phase 2 — Omnigent release

Implement `mo-omnigent` only after Phase 0B PASS.

### Phase 3 — verification

- independent installs;
- Git and non-Git review;
- restart recovery;
- clean QC;
- fail-closed long output;
- no legacy CLI/state dependencies;
- final E2E per released backend.

---

## 30. Acceptance criteria

1. `mo-herdr` without args continues one unambiguous task or requests a task.
2. Executor never reads methodology skill.
3. Native goal is used only after qualification.
4. Goal deactivation is proven before gates.
5. First commit contains only spec/reuse.
6. Reuse is privacy-safe and fails closed when materially incomplete.
7. Review covers exact `BASE...CANDIDATE`.
8. Freeze checks run before/after gates.
9. New SHA/artifact digest invalidates gates.
10. Reviewers have different known model lineages.
11. All gates name the same identity.
12. Claude, Codex and OpenCode mandatory Herdr turns are retrieved through `agent read`/qualified scroll.
13. Positive upper/lower boundaries are mandatory.
14. Window exhaustion alone never proves completeness.
15. Large findings input is verified end-to-end.
16. Retrieval and fix loops are bounded.
17. Omnigent full release waits for native automation, but does not block Herdr release.
18. Omnigent export/log completeness is proven.
19. Standalone `mo-review` requires an explicit or unique qualified backend skill.
20. PASS cannot hide acceptance/correctness/security/test defects as minor.
21. Console smoke stays with executor; browser/benchmark uses tester.
22. Both E2E documentation layouts work.
23. Existing task runner is reused.
24. Knowledge sync is complete before candidate.
25. Python and TypeScript profiles pass fixtures.
26. Purpose review covers overloads.
27. Restart recovery is deterministic or yields one precise attention item.
28. Model routes validate lineage and settings use optimistic CAS.
29. Watchdog only wakes one orchestrator.
30. Every custom helper has proof.
31. Skills install via literal APM and `npx skills` commands.
32. Dist contains no workflow CLI, state, manifests, receipts or proxy adapters.

---

## 31. Decision ledger

### Adopted

| Decision | Rationale | Source |
|---|---|---|
| Skills-first, no workflow engine | Native CLI + reasoning preserve outcome | approach council + user |
| `mo-herdr` and `mo-omnigent` only | Current backend scope | user |
| Independent backend release trains | Omnigent 0.6 must not block qualified Herdr | spec review R2 |
| Executor without methodology skill | Spec/goal/project contract suffice | user + council |
| Mandatory `mo-reuse` and spec-only first commit | Reuse before code anchoring | user |
| Mandatory Herdr interactive `agent read` route | Preserve superseding output constraint | user + spec review R2 |
| Non-interactive pane is supplemental only | It cannot replace required agent-read contract | spec review R2 |
| Full Markdown verdict | No machine JSON consumer | user |
| `BASE_SHA + CANDIDATE_SHA` | Full feature range | spec review R1 |
| Exact standalone merge-base rule | Avoid guessed review scope | spec review R2 |
| Mechanical freeze | Detect mutation without snapshot store | spec review R1 |
| Ignored-state cleanup contract | Ignored runtime state can affect gates | spec review R2 |
| Sequential shared-worktree gates | Prevent cross-gate mutation ambiguity | spec review R2 |
| New SHA or artifact ID invalidates all gates | Fail closed | user + revision |
| Feature branch `meta-o/<slug>` off default branch | Avoid commits to protected/default branch | spec review R1 |
| Spec read-only for executor | Separate product/research ownership | user |
| Conditional E2E tester | Smoke does not need a separate agent | user |
| Two scalable E2E layouts | Small docs remain simple; large suites selectable | task + R2 |
| Existing task runner first | Avoid parallel toolchain | spec review R1 |
| `mo-review` requires qualified backend skill | Keeps methodology reusable without duplication | spec review R2 |
| Explicit backend override before discovery | User can choose Herdr or Omnigent | spec review R2 |
| Run-local digest for non-Git artifact | Stable identity without registry | spec review R1 |
| Model lineage independence | Transport provider is not model vendor | spec review R2 |
| Codex inline launch | Preserves scrollback | spec review R1 |
| Qualified 32-row unique overlap | Literal scroll contract without false continuity | user + R2 |
| Positive upper boundary mandatory | Window exhaustion cannot prove completeness | spec review R2 |
| Derived handoff capacity | Avoid magic 64 KiB limit | spec review R2 |
| Direct-argv transport only | Prevent shell interpolation corruption | spec review R2 |
| Bounded retrieval and three-round fix loop | Prevent infinite retries | spec reviews R1–R2 |
| Strict minor residual policy | Severity cannot hide real defects | spec review R2 |
| Omnigent public server API as required automation model | Avoid Herdr dependency and PTY adapter | spec review R2 |
| Omnigent export plus optional native log cross-check | Detect incomplete export | spec review R2 |
| Goal until first candidate, paused before gates | Freeze executor activity | premortem + review |
| `mo-setup` owns knowledge/QC/provider onboarding | One project contract | user |
| Explicit knowledge sync | Durable facts move before candidate | task + R2 |
| Narrow `models.json` only | No run state | user |
| Extended route identity | Launch, billing and lineage are distinct | spec review R2 |
| Optimistic settings CAS | Safe narrow persistence without helper | spec review R2 |
| Optional 1:1 wake watchdog | Observer without classification/takeover | user + R2 |
| Conditional bounded watchdog helper | Only on failed native next-turn fixture | premortem |
| Bare APM/skills distribution | No unnecessary source manifest | spec review R2 |
| Canonical reference build copy | Independent installs without drift | synthesis |
| Three reuse rounds + Rust | Broad pre-build research | user |
| Private-by-default reuse queries | Remotes do not prove task publicity | spec review R2 |
| Offline material research returns incomplete | Avoid systematic build bias | spec review R2 |
| Bounded HTTPS URL ingestion | Prevent unbounded or private-network fetches | spec review R2 |
| Reviewer subagents 0/3/6 | Risk-proportional depth | synthesis |
| Purpose presence + semantic review | Mechanical check does not replace meaning | user + GRACE |
| Version-preserving TS compatibility profile | Avoid forced ESLint migration | spec review R2 |
| `eslint-plugin-boundaries` for TS | Concrete boundary mechanism | spec review R2 |
| Class size is reviewer lens | No qualified mechanical rule exists | spec review R2 |
| Deterministic actor names | Avoid Herdr collisions | spec review R1 |
| No backward compatibility | Enables real simplification | user |
| Capability matrix is product reference | Backend facts without runtime state | spec review R1 |
| Exact fixture/evidence package | Phase 0 is executable, not another design phase | spec review R2 |
| Subscription-first qualification | Preserve user wrappers/subscriptions | task |
| Informational E2E target exits 0 | Aggregator compatibility; separate verdict remains required | spec reviews R1–R2 |
| Explicit human-attention policy | Human time spent only on real decisions | task + R2 |
| Self-hosting only by user choice | Reflection does not auto-launch work | user |
| Optional compact handoff deleted | Avoid stale duplicate source | spec review R2 |
| Helper proof requirement | Prevent control-layer regrowth | task |

### Rejected

| Decision | Rationale | Source |
|---|---|---|
| Public `meta-o` CLI/router | Proxies existing CLI | user |
| FSM/state/run registry | Git/spec/sessions suffice | user |
| Session adapters | Duplicate native backends | council |
| Structured findings JSON | No consumer | user |
| Verdict file + nonce | Unnecessary transport protocol | user |
| Provider-private retrieval | Violates backend boundary | user |
| Pane process as substitute for mandatory Herdr agent read | Contradicts hard output contract | spec review R2 |
| Completeness from exhausted scrollback | Allows partial PASS | spec review R2 |
| Herdr attach/send-keys reconstruction | Unsafe input/focus behavior | spec review R1 |
| Fixed 64 KiB handoff limit | Unqualified magic number | spec review R2 |
| Shell interpolation of Markdown | Corrupts arbitrary findings | spec review R2 |
| Snapshot digest/receipts for Git | SHA + freeze simpler | user |
| Required worktrees | Not needed for ordinary gates | user |
| Shared-worktree parallel gates | Mutation attribution is ambiguous | spec review R2 |
| Executor skill | Reintroduces ritual | user |
| Separate adjudicator | Existing reviewers/orchestrator suffice | user |
| Unlimited review fix loop | LLM reviewers may continually expand scope | spec review R2 |
| Any-minor residual PASS | Could hide real defects | spec review R2 |
| Generic project AST/import/E2E checkers | Mature tools first | user |
| Universal Make | Breaks non-Make projects | spec review R1 |
| One-provider degraded review | Not independent | spec review R1 |
| Omnigent inside Herdr pane | Makes backend non-independent | spec review R2 |
| Omnigent PTY/stdin adapter | Recreates proxy layer | spec review R2 |
| Manual Omnigent REPL as automated lifecycle | Lacks settlement/control contract | spec review R2 |
| Lexical model-upgrade guessing | Sibling family is not successor | spec review R1 |
| Install/update scripts | Standard managers suffice | user |
| Source `apm.yml` for bare bundle | Not required by chosen install flow | spec review R2 |
| Paseo in current version | Outside scope | user |
| Mandatory GRACE causal-chain/anchors | No consumer; ritual prose | synthesis |
| Automatic build/extend on offline reuse | Biases against reuse | spec review R2 |

### Deferred

| Decision | Admission condition | Source |
|---|---|---|
| `mo-models.mjs` | Zero-dependency contract and real consumer | spec review R1 |
| General transcript parser | New public backend need; never private fallback | user |
| Brownfield baseline | Adoption otherwise impractical | council |
| Mandatory spec retirement | Project convention after knowledge sync | user |
| Multi-project watchdog | Proven need; baseline remains 1:1 | user |
| Future Herdr range/cursor API | Documented and qualified | synthesis |
| Cache economics automation | Native signals and actionable consumer | task |
| Global architecture hygiene tool | Separate user-selected project | task |
| SDK-based model discovery | Dependency and authoritative catalog contract | spec review R1 |
| Omnigent full workflow | Public native automation qualification | spec review R2 |

---

## 32. Qualification blockers and open questions

Архитектурных choices для implementer не осталось; qualification может только подтвердить или отклонить заранее заданный route.

Release blockers:

1. Herdr Claude/Codex/OpenCode interactive agent-read completeness.
2. Safe direct-argv findings transport and measured capacity.
3. Goal activation/deactivation for claimed goal routes.
4. Independent model lineages.
5. Standalone APM/skills installation.
6. Omnigent public server automation for separate Omnigent release.
7. Watchdog next-turn result selects skill-only or defined helper.

Неуспешный blocker не разрешается adapter’ом, private transcript fallback, partial PASS или weaker review.

---

## 33. Primary references

- `docs/references/my-opinion.md`
- `docs/references/grace.md`
- `spec/2026-08-05-ai-driven-development-workflow-revision/task-description.md`
- `spec/2026-08-05-ai-driven-development-workflow-revision/synthesis.md`
- Herdr agent automation: <https://herdr.dev/docs/agent-automation/>
- Claude `/goal`: <https://code.claude.com/docs/en/goal>
- Codex goals and installed feature help
- Omnigent 0.6 installed CLI help
- [Microsoft APM](https://github.com/microsoft/apm)
- [Vercel Skills CLI](https://github.com/vercel-labs/skills)
- GitHub repository search: <https://docs.github.com/en/rest/search/search#search-repositories>
- npm package search: <https://docs.npmjs.com/searching-for-and-choosing-packages-to-download/>
- Cargo search: <https://doc.rust-lang.org/cargo/commands/cargo-search.html>
- PyPI APIs: <https://docs.pypi.org/api/>
- `typescript-eslint`, `eslint-plugin-jsdoc`, `eslint-plugin-boundaries` and Oxlint documentation