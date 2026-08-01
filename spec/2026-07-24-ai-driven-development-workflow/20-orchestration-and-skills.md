# 20 — Orchestration and skills

## Purpose

Этот документ задаёт внешний state, роли, skill contracts и backend adapter.
Нормативный источник:
[master-spec §3–§7, §13–§14](./2026-07-24-ai-driven-development-workflow-council-brainstorm.md).

## Boundary

Оркестратор управляет FSM и адресной доставкой, но не читает код, не проводит
review и не пишет реализацию. Herdr/Omnigent владеют sessions, resume и
доставкой событий. Методология не создаёт собственные daemon, event queue,
session DB или control plane.

## External layout

```text
~/.meta-o/
  config.json
  watchdog.json
  projects/
    <readable-canonical-path>--<sha256-prefix>/
      project.json
      settings.json
      runs/<run-id>/
        state.json
        input/spec-<sha256>.md
        findings/
        optional-handoff.md
```

Project key вычисляется из `realpath(git root)`: separators/unsafe characters
заменяются `-`, последовательности схлопываются, readable component обрезается
до 180 UTF-8 bytes, затем добавляется `--` и первые 12 hex SHA-256 canonical
path.

`~/.meta-o` имеет mode `0700`, files `0600`. Каждый path component проверяется
через `lstat`; symlink, чужой owner, слишком широкие права или несовпадающий
`project.json.canonicalPath` блокируют run.

В репозитории нет runtime/config файлов методологии и не требуется `.gitignore`.

## Roles and ModelSet

```ts
interface ModelSet {
  executor: ModelRef;
  reviewerPrimary: ModelRef;
  reviewerCrossVendor: ModelRef;
  e2eTester: ModelRef;
}
```

```text
primary.vendor == executor.vendor
primary.family == executor.family
crossVendor.vendor != executor.vendor
```

Vendor — разработчик базовой модели, family — provider-native base family, а не
CLI/API route. Canonical aliases хранятся в project settings.

При каждом пользовательском start/resume оркестратор показывает набор и
спрашивает «эти?». При «нет» предлагает и сохраняет новый после подтверждения.
Автоматический recovery использует immutable copy ModelSet текущего run.

Worker sessions расходны. Между features они не переносятся; при длинной паузе,
reboot или потере контекста заменяются fresh generation.

## State contract

`state.json` содержит только текущее состояние, а не task graph/transcript:

- run/project/spec identity;
- phase и monotonically increasing `stateVersion`;
- `orchestratorGeneration`;
- immutable run ModelSet;
- sessions/generations;
- compact decisions;
- `KnowledgeImpactPlan`;
- candidate snapshot и E2E plan;
- gate confirmations и только открытые findings;
- максимум одну `PendingOperation`;
- pause reason/resume condition.

Запись: `temp → fsync(temp) → rename → fsync(parent)`. Короткий advisory
`writer.lock` сериализует только transitions одного run. Project-wide locks и
блокировка других branches/runs запрещены.

Takeover разрешён, только когда прежняя orchestrator session доказанно terminal
или failed. Writer сверяет `orchestratorGeneration` перед commit state.

## Backend side effects

Перед `spawn/send/wait/stop`:

1. сохранить `PendingOperation(state=prepared, operationId, requestDigest)`;
2. вызвать adapter;
3. сохранить acknowledgement/receipt;
4. наблюдать эффект через `status/read`;
5. очистить pending operation только после доказанного applied/not-applied.

После crash вызывается `reconcile`. `unknown` переводит run в
`PAUSED_BACKEND_UNCERTAIN`; blind resend и создание дублирующего worker
запрещены. Fresh generation допустима лишь после доказанного terminal старой
session или `not_applied`.

## Adapter interface

```ts
interface SessionAdapter {
  capabilities(): Promise<AdapterCapabilities>;
  spawn(request: SpawnRequest): Promise<SessionRef>;
  send(session: SessionRef, operationId: string, message: string):
    Promise<DeliveryResult>;
  status(session: SessionRef): Promise<SessionStatus>;
  read(session: SessionRef, cursor?: string): Promise<SessionOutput>;
  wait(session: SessionRef, expected: ExpectedState): Promise<WaitResult>;
  resume(session: SessionRef): Promise<SessionRef>;
  reconcile(operation: PendingOperation): Promise<ReconcileResult>;
  stop(session: SessionRef):
    Promise<"stopped" | "already_terminal" | "unknown">;
}
```

Capability matrix использует `supported|degraded|unsupported`. Любая
unsupported completion-critical capability блокирует backend.

Executable suite проверяет acknowledgement, status/read, wait, native resume,
replacement, concurrent completions, reboot recovery и выбранные
Claude/Codex/OpenCode routes. Полный suite запускается после install/backend
update и вручную; короткий smoke — на preflight.

## Skill set

Минимальный общий набор:

- `orchestrate-feature` — FSM, routing, state/recovery;
- `execute-feature` — implementation, tests, knowledge sync, local commits;
- `review-feature` — единый rubric и structured findings;
- `test-e2e` — selection plan, smoke, scenario execution;
- `adopt-project` — brownfield knowledge/purpose adoption;
- `research-reuse` — optional scan;
- `adjudicate-technical` — fresh resolution of a concrete dispute;
- Herdr и Omnigent adapter skills.

Prompts передают роли только необходимый bounded context. Reviewers не получают
executor reasoning или findings друг друга. Оркестратор получает structured
results/evidence references, не полные diffs/logs/transcripts.

Optional handoff создаётся только после стартового согласия, максимум 4 KiB.
Переполнение требует переписать кратко; silent truncation запрещён.

## Installer and updates

`install.sh`/`update.sh` копируют manifests, prompts и заранее
скомпилированные из TypeScript dependency-free `.mjs` helpers в путь, выбранный
разработчиком. На target machine не нужен `npm install`. Скрипты не меняют
projects/hooks и не создают project version pin.

Когда и куда устанавливать/обновлять, решает разработчик. После обновления
adapter проходит capability suite; поломка останавливает preflight и
эскалируется, без скрытого fallback.

## Security

- Пользователь подтверждает внешних model providers для проекта.
- Secrets/tokens/credentials удаляются из prompts и evidence.
- URL specs: HTTPS, ≤3 redirects, ≤10 MiB decompressed.
- Spec bytes не выполняются.
- E2E production запрещён без явного production-safe contract и подтверждения
  пользователя.

## Acceptance tests

- Два project paths с одинаковым readable form получают разные keys.
- Move project создаёт новый key; migration только явная.
- Symlink-подмена state directory блокируется.
- Crash в каждой точке backend side effect не создаёт duplicate action.
- Два параллельных feature branches не блокируют друг друга.
- Fresh orchestrator восстанавливает run без narrative handoff.
- Backend capability regression останавливает preflight.

