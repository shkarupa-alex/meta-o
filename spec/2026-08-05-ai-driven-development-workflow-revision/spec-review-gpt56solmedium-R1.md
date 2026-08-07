## Facts & Constraints (White Hat)

Спецификация правильно выбирает skills-first направление, но пока не является implementation-ready.

1. Herdr full-output contract не доказан. Установленный Herdr 0.8.0 подтверждает, что `--lines N` читает лишь доступный screen/scrollback. Официальная документация прямо говорит: строки alternate screen могут быть безвозвратно отсутствовать, а штатный fallback — попросить агента записать полный ответ в файл. Addendum запрещает этот fallback. Значит §7 описывает экспериментальный алгоритм, а не гарантированный interface. Overlap «нескольких одинаковых строк» не доказывает непрерывность при повторяющемся тексте и не имеет точного размера/termination rule. [Herdr agent automation](https://herdr.dev/docs/agent-automation/)

2. Для Codex `/goal` реально существует, но §6.1 не завершает activation contract. Официальный flow предусматривает `features.goals`, а также `/goal pause|resume|clear`; спецификация не определяет проверку feature flag, точную observable activation evidence через Herdr и правила pause/resume. [Codex: Follow a goal](https://learn.chatgpt.com/use-cases/follow-goals)

3. Claude `/goal` описан точнее, но отсутствуют важные ограничения: condition ограничена 4 000 символами, active goal восстанавливается при resume, а evaluator видит только conversation output. Последнее отражено, первые два — нет в acceptance fixtures. [Claude Code `/goal`](https://code.claude.com/docs/en/goal)

4. Omnigent 0.6.0 локально предоставляет `run`, `resume` и `session export`, но §8 почти целиком передаёт контракт Phase 0. Не определены session creation, actor addressing, отправка follow-up, status retrieval, pagination, JSONL turn selection и PATH verification внутри worker process.

5. §5.4 всегда вызывает `make mo-qc`, тогда как исходная задача требует поддержать проекты без Make через native task runner. §12.3 одновременно называет Make entry обязательным и обещает сначала сохранять существующий task runner — это прямое противоречие.

6. TypeScript раздел отражает разумный compatibility path, но не задаёт требуемые два полноценных профиля. Typed `typescript-eslint` действительно требует project-aware configuration и может заметно увеличить время lint; Oxlint type-aware связан с конкретной TypeScript line и пока заявляет 59 из 61 typed rules. Нужна version/compatibility matrix, а не фраза «может ускорить». [typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting/), [Oxlint type-aware stable](https://oxc.rs/blog/2026-07-22-type-aware-linting-stable.html)

## Risks & Failure Modes (Black Hat)

Критические failure modes:

- Review scope не определён. `mo-review` читает «Git diff названного SHA», но отсутствует `base SHA` или правило merge-base. При feature из нескольких commits reviewer легко проверит только последний commit.
- Candidate freeze существует лишь как инструкция. Нет обязательных проверок до и после каждого gate: `HEAD == candidate`, clean tracked/untracked state, отсутствие mutation от formatter/test/reviewer. Роль с write permissions может незаметно изменить дерево без нового commit.
- Не определено поведение на исходно dirty worktree, default/protected branch, существующих пользовательских изменениях и нескольких feature branches. «Первый spec-only commit» может попасть прямо в `main` или включить чужие изменения.
- `mo-review` архитектурно недоопределён. Как standalone skill он должен создать два cross-vendor reviewer и провести fixes, но backend, executor/author locator и native spawn/read/send mechanism не входят во входной контракт. Это скрытая нерешённая backend-routing задача.
- Non-code review фактически не поддержан: таблица требует candidate SHA, §10 требует Git diff и clean/dirty worktree. Внешний документ, presentation или untracked artifact не имеет такого identity contract.
- Full reviewer response может превысить размер terminal history, CLI argument, shell `ARG_MAX` или context следующего actor. Запрет file handoff/marker принят, но допустимый transport для большого response не задан.
- Reviewer independence формулируется через «другого vendor», однако model schema не содержит нормализованного effective vendor/provider. OpenCode route может скрывать того же underlying model provider.
- Automatic external reuse search способен утечь названия внутренних компонентов и доменные термины в GitHub/registries. Нет privacy rule для private repositories, secret-like query terms и offline/rate-limit behavior.
- Session names `<slug>-exec` не имеют алгоритма slug, collision policy и учёта Herdr-ограничения в 32 символа. При двух похожих features возможна адресация не того actor.
- `mo-models.mjs` рискует стать ровно тем скрытым subsystem, против которого направлена ревизия: отсутствуют CLI signature, stdout schema, exit codes, atomic write/locking, corrupt-file behavior, SDK dependency packaging, source matrix, dedupe identity и successor algorithm.

## Strengths & Benefits (Yellow Hat)

Сильная часть спецификации — последовательное удаление старого control plane:

- нет общего backend adapter, FSM, receipts, snapshot digest и mandatory Structured JSON;
- executor не зависит от methodology skill;
- reuse decision становится читаемой частью spec;
- candidate идентифицируется обычным Git SHA;
- любой новый SHA консервативно инвалидирует gates;
- smoke отделён от browser/benchmark E2E;
- review становится standalone концепцией;
- recovery опирается на Git/spec/native sessions;
- сохранён смысл GRACE: mechanical presence отдельно от semantic purpose review;
- PATH wrappers и Claude workspace trust разведены корректно;
- migration разрешает удалить старый код без compatibility shell.

Это хорошая архитектурная основа. Проблема не в выбранном направлении, а в преждевременном заявлении, что все контракты уже закрыты.

## Alternatives & Creative Ideas (Green Hat)

1. Разделить документ на approved architecture и capability-qualified implementation spec. Phase 0 должен породить короткую зафиксированную capability matrix; только после неё route получает статус supported и точный skill contract.

2. Заменить hardcoded `make mo-qc` на run-local textual command plan:

```text
QC_COMMAND: make mo-qc | npm run mo:qc | just qc | <existing command>
SMOKE_COMMAND: <command or not-applicable>
E2E_MODE: none | console | benchmark | browser
```

Это не persisted state и не новый manifest.

3. Передавать каждому gate пару `BASE_SHA` + `CANDIDATE_SHA`. До и после gate orchestrator проверяет `HEAD`, index и worktree. Reviewer получает `git diff BASE_SHA...CANDIDATE_SHA`, а не неопределённый «diff SHA».

4. Для Herdr сначала уменьшать риск потери истории launch options: например, Codex имеет native `--no-alt-screen`. Для Claude/OpenCode следует проверить analogous accessibility/inline rendering modes. Scroll reconstruction оставлять вторым уровнем, а не baseline.

5. Сделать `mo-review` явно двухрежимным:

- orchestrated: caller передаёт backend, actor locators и base/candidate;
- standalone: skill выбирает доступный native backend и фиксирует author/fix target до первого review.

Если cross-vendor spawning недоступен, результат должен быть `needs_attention`, а не ослабленный «двойной» review одного provider.

6. Отложить `mo-models.mjs` до закрытия source matrix. Первая версия может хранить вручную выбранные model preferences и показывать native backend catalogs по запросу; это честнее недоопределённого discovery subsystem.

## Completeness & Process (Blue Hat)

Прямые обязательные deliverables исходной задачи отсутствуют или существенно неполны:

- нет сравнения трёх архитектурных уровней: pure skills, skills + helpers, workflow engine;
- нет per-backend context/cache/compaction table `available | inferred | unavailable`;
- нет анализа subscription-first поведения Herdr и Omnigent;
- tooling audit не классифицирует все требуемые command groups/components и не объясняет replacement для каждого удаления;
- нет полной карты переноса требований `execute-feature`;
- нет явного списка сознательно потерянных guarantees и их operational consequences;
- нет pre-mortem против повторного wrapper/control-layer bloat;
- TypeScript fast profile не специфицирован как отдельный profile;
- отсутствует точный APM/`skills` package contract и dependency layout для `mo-models.mjs`;
- нет complete test matrix по skills и failure paths;
- `Open questions: отсутствуют` неверно: Herdr completeness, Omnigent export, watchdog runtime и model discovery всё ещё способны изменить реализацию и supported surface.

## Traceability

Decision Ledger существует, и перечисленные adopted/rejected/deferred entries в основном представлены в body.

Однако ledger не является lossless. В нём отсутствуют существенные решения body:

- goal lifetime до первого candidate;
- обязательный clean worktree;
- `make mo-qc` как universal gate;
- exit code 2 для agent-required E2E;
- model schema и helper;
- reviewer subagent limits;
- purpose coverage/exceptions;
- canonical-reference copying;
- three-round reuse algorithm;
- recovery naming convention.

Это reverse-traceability defect: реализация может изменить эти решения, не нарушив ledger.

## Decomposition Readiness

Не готовы к независимой декомпозиции:

- `mo-review` backend/standalone control;
- `mo-models.mjs`;
- conditional watchdog helper;
- Omnigent lifecycle;
- Herdr complete-turn reconstruction;
- non-code artifact identity;
- dist build/copy verification;
- dirty-tree/base-branch/candidate rules;
- Python/TypeScript exact tool configs.

Исполнителю придётся принимать архитектурные решения, а не только реализовывать их.

## Weak-Model Executability

Слабая модель не сможет без догадок определить:

- какой diff reviewить;
- как доказать `/goal` activation;
- как выделить turn boundaries в каждом TUI;
- как выбрать backend для standalone `mo-review`;
- как классифицировать provider/vendor;
- как читать/обновлять `models.json`;
- как определить meaningful model successor;
- когда `mo-e2e` exit 2 является ожидаемым;
- как создать spec из text/URL и кто владеет её acceptance criteria;
- какие exact lint rules/configs реализуют purpose для overloads.

## Contract Completeness

Не хватает схем и error contracts для:

- model routes, roles, inheritance и `dismissedUpgrades`;
- helper CLI arguments/stdout/exit codes;
- corrupt/concurrent settings writes;
- reviewer severities и PASS/FAIL rule;
- base/candidate pair;
- artifact identity для non-code review;
- session naming/collisions;
- search timeout/rate-limit/offline/privacy;
- gate mutation detection;
- Omnigent export pagination/end boundary;
- watchdog locator, polling interval, timeout и notification failure;
- package-manager manifests и helper dependencies.

Итог: направление следует принять, но текущий текст нельзя брать в implementation as-is. Он устранил лишний engine, однако оставил несколько ключевых интеграционных решений внутри Phase 0 и reasoning будущего implementer.

```council-verdict
{
  "schema_version": 1,
  "verdicts": [
    {
      "target_id": "spec-review",
      "approval_score": 4,
      "would_adopt": false,
      "summary": "Спецификация убедительно возвращает skills-first архитектуру и правильно удаляет большую часть прежнего control plane, но пока не является implementation-ready: отсутствуют обязательные capability/context tables и сравнение трёх архитектурных уровней, не определены base-to-candidate review scope и механическая freeze-проверка, standalone mo-review не имеет backend/author contract, Herdr full-turn retrieval остаётся недоказанным, а Omnigent, model helper, watchdog и distribution оставлены на архитектурные решения Phase 0. Ledger хорошо отражает перечисленные решения, но не является lossless относительно body.",
      "phase": "spec-review",
      "confidence": "high",
      "blocking_findings": [
        {
          "id": "",
          "severity": "critical",
          "area": "candidate/review identity",
          "description": "Reviewer получает только candidate SHA; base SHA или правило merge-base отсутствует. Freeze не проверяется до и после gates, поэтому reviewers могут проверить неполный diff или изменённое дерево.",
          "required_change": "Определить BASE_SHA+CANDIDATE_SHA contract, полный diff rule и обязательные HEAD/index/worktree проверки до и после каждого gate."
        },
        {
          "id": "",
          "severity": "critical",
          "area": "mo-review architecture",
          "description": "Standalone mo-review обязан создавать cross-vendor reviewers и вести fix loop, но не имеет backend, actor locator или author/fix-target contract; non-code artifacts также ошибочно требуют Git SHA.",
          "required_change": "Специфицировать orchestrated и standalone modes, backend selection, actor ownership, unavailable-cross-vendor behavior и identity contract для Git и non-Git artifacts."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Herdr result retrieval",
          "description": "Alternate-screen output может отсутствовать в Herdr scrollback; overlap и turn-boundary алгоритм не имеют доказуемых правил, limits или transport strategy для очень большого результата.",
          "required_change": "Закрыть Phase 0 fixture до support declaration, определить per-route rendering/scroll controls, exact overlap/termination rules, prompt-size behavior и fail-closed outcome."
        },
        {
          "id": "",
          "severity": "major",
          "area": "missing mandatory analyses",
          "description": "Нет сравнения трёх архитектурных уровней, per-backend context/cache/compaction table, subscription-first analysis, полного tooling audit, карты execute-feature migration и списка сознательно удалённых guarantees.",
          "required_change": "Добавить все явно обязательные deliverables исходной задачи либо пометить документ как неполный architecture draft."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Omnigent contract",
          "description": "Session creation, addressing, prompts, status, resume, export pagination, full-turn extraction и PATH behavior оставлены будущему Phase 0.",
          "required_change": "После live fixtures зафиксировать конкретный supported-route contract; до этого не объявлять mo-omnigent implementation-ready."
        },
        {
          "id": "",
          "severity": "major",
          "area": "model settings/helper",
          "description": "mo-models.mjs не имеет executable interface, typed schema, source matrix, error/locking behavior, dependency packaging, dedupe identity или successor algorithm.",
          "required_change": "Либо defer helper, либо задать CLI/API contract, schemas, atomicity, source-specific capabilities, privacy rules и complete tests."
        },
        {
          "id": "",
          "severity": "major",
          "area": "project command contract",
          "description": "Lifecycle hardcodes make mo-qc, противореча требованию поддерживать existing non-Make task runners без параллельного toolchain.",
          "required_change": "Определить dynamically discovered QC command; Make alias должен быть project choice, а не universal runtime dependency."
        },
        {
          "id": "",
          "severity": "major",
          "area": "Git lifecycle",
          "description": "Не определены feature base/branch, protected/default branch behavior, initial dirty worktree, unrelated user changes и owner создания tracked spec из text/URL.",
          "required_change": "Добавить conservative Git preflight и ownership rules, исключающие commits в неправильную branch и смешивание пользовательских изменений."
        },
        {
          "id": "",
          "severity": "major",
          "area": "QC profiles",
          "description": "Требуемый TypeScript fast profile отсутствует; exact configs для typed lint, purpose overload coverage, size/class metrics и import boundaries не определены.",
          "required_change": "Описать compatibility и fast profiles как отдельные executable configurations с commands, version constraints, exceptions и fixture tests."
        },
        {
          "id": "",
          "severity": "major",
          "area": "decomposition readiness",
          "description": "Phase 0 способен изменить supported routes и helper architecture, однако Open Questions объявляет blocking questions отсутствующими.",
          "required_change": "Сделать результаты Phase 0 обязательным spec-amendment gate перед Phase 1 и перечислить unresolved conditional contracts."
        }
      ],
      "non_blocking_findings": [
        {
          "id": "",
          "severity": "minor",
          "area": "E2E interface",
          "description": "Exit code 2 для help-only mo-e2e выглядит как command failure и не имеет consumer contract.",
          "required_change": "Определить интерпретацию exit code либо использовать отдельный info target."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "security/privacy",
          "description": "Reuse queries и model-history discovery не имеют правил против утечки private project terms или transcript content.",
          "required_change": "Ограничить discovery metadata и определить privacy-safe query policy."
        },
        {
          "id": "",
          "severity": "minor",
          "area": "traceability",
          "description": "Многие substantive body decisions отсутствуют в Decision Ledger.",
          "required_change": "Добавить reverse traceability audit и занести goal lifetime, gate commands, helper schema, E2E exit behavior и reuse thresholds."
        }
      ],
      "assumptions": [
        "Superseding addendum имеет приоритет над ранними требованиями, включая исключение Paseo и запрет verdict files.",
        "Этот ответ является одним независимым council verdict, поэтому новый multi-model council и запись artifacts не запускались.",
        "Репозиторий и локальные CLI проверялись read-only; отсутствие найденного Omnigent skill не считается доказательством, что его нельзя поставить отдельно.",
        "Phase 0 может честно пометить route unsupported, но такой результат не делает текущий master-spec implementation-ready для обещанного backend."
      ],
      "round": 1,
      "reviewer": "gpt56solmedium"
    }
  ]
}
```

---REVIEW-META---
approval_score: 4
would_adopt: false
