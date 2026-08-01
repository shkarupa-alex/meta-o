# 00 — Master workflow

## Purpose

Этот документ задаёт исполнимый lifecycle одной feature. Нормативный источник:
[master-spec](./2026-07-24-ai-driven-development-workflow-council-brainstorm.md).
При конфликте действует master-spec.

## Inputs

- canonical Git project root;
- путь или HTTPS URL immutable feature-spec;
- Herdr либо Omnigent adapter, прошедший capability smoke;
- подтверждённый пользователем ModelSet;
- стартовые опции `reuseScan` и `handoff`;
- tracked `Makefile`, `.quality/qc-manifest.json`,
  `docs/architecture/e2e.md` и `docs/architecture/e2e.json`.

Оркестратор проверяет доступность и SHA-256 спеки, но не оценивает её качество.
Исходные bytes копируются в immutable external blob текущего run.

## Preflight

Оркестратор обязан:

1. Найти root через `git rev-parse --show-toplevel`, вычислить canonical
   `realpath` и project key.
2. Проверить ownership, mode и отсутствие symlinks в project state под
   `~/.meta-o`.
3. Создать atomic `state.json` и immutable spec blob.
4. Показать сохранённый/default ModelSet и спросить «эти?».
5. Спросить, включать ли reuse scan и handoff.
6. Проверить clean рабочее дерево, backend capabilities, `Makefile`,
   `make qc`, QC manifest и E2E contract.
7. Если обязательного project contract нет, предложить пользователю разрешить
   executor создать/настроить его. Без разрешения — `PAUSED_MISSING_TOOLS`.

Preflight не валидирует feature-spec и не меняет её.

## Lifecycle

```text
AWAITING_MODEL_SET
  → PREFLIGHT
  → [SOLUTION_SCAN]
  → EXECUTING
  → LOCAL_QC
  → SMOKE_PREFLIGHT
  → REVIEW_STABILIZATION
  → E2E_STABILIZATION
  → FINALIZE_METADATA
  → COMPLETE
```

Executor реализует весь scope, тесты и knowledge sync, удаляет tracked
feature-spec после интеграции устойчивых требований и создаёт локальный clean
candidate commit. Push, remote branch, PR и Git tag без явной просьбы
пользователя запрещены.

Для каждого gate создаётся отдельный fresh detached worktree candidate commit.
До и после gate `git status --porcelain --untracked-files=all` обязан быть
пустым. Результат привязан к:

```text
(commit_oid, snapshot_digest, e2e_plan_digest)
```

Commit OID — provenance; identity проверенного содержимого — snapshot digest.

## Gate order

1. E2E tester формирует selection plan по готовому candidate.
2. `make qc`.
3. Короткий E2E smoke: build/boot/health.
4. Два независимых reviewers проверяют один snapshot и полноту selection plan.
5. Review findings исправляются батчами; после batch выполняются QC и оба
   review. Heavy E2E внутри этого цикла не запускается.
6. После двух review PASS E2E tester выполняет весь selected set.
7. E2E failures исправляются батчами; после batch выполняются QC и E2E, но не
   review каждого мелкого fix.
8. После стабилизации текущего контура повторяется другой контур, если его
   attestation относится к старому snapshot.
9. Completion требует QC, оба review и selected E2E PASS на одном digest.

Количество циклов не ограничено и само по себе не вызывает эскалацию
пользователю.

## Snapshot digest

Digest строится по sorted `path + mode + Git blob OID` всех tracked files.
Для `docs/architecture/e2e.json` используется canonical JSON projection,
исключающий только `scenarios[*].last_run`. Catalog, scenario IDs, links, tags
и `always_required` входят в digest.

Изменение code, tests, config, knowledge, purpose или E2E catalog инвалидирует
attestations. Rebase/squash идентичного tree — нет.

## Completion

После общего PASS executor:

1. обновляет только `e2e.json.scenarios[*].last_run`;
2. запускает `make verify-e2e-metadata`;
3. доказывает guard-проверкой, что metadata commit не меняет другие paths или
   catalog fields;
4. переводит run в `COMPLETE`;
5. останавливает оставшиеся worker sessions;
6. удаляет весь `runs/<run-id>/`.

Отдельный completion report, findings archive, screenshots и raw logs не
создаются. Человек читает project knowledge либо обычный Git diff.

## Pauses and terminal states

| State | Условие | Выход |
|---|---|---|
| `PAUSED_EXTERNAL` | Недоступна внешняя зависимость/E2E environment | Повторить preflight после восстановления |
| `PAUSED_QUOTA` | Backend сообщил quota/reset | `status/read/reconcile`, затем native wake |
| `PAUSED_MISSING_TOOLS` | Нет project contract/tool | Пользователь разрешает setup |
| `PAUSED_MODEL_UNAVAILABLE` | Модель недоступна | Resume либо новый подтверждённый ModelSet |
| `PAUSED_TECHNICAL_DISPUTE` | Reviewer/executor не согласны | Fresh technical adjudicator |
| `PAUSED_ORCHESTRATOR_BUDGET` | Контекст близок к пределу | Fresh orchestrator принимает generation |
| `PAUSED_BACKEND_UNCERTAIN` | Side effect нельзя доказать | Reconcile или остановка; blind resend запрещён |
| `STOPPED_SPEC_IMPOSSIBLE` | Spec технически невыполнима | Только новая spec/run по решению пользователя |
| `FAILED_BACKEND` | Нет completion-critical capability | Исправить backend/adapter и повторить suite |
| `CANCELLED` | Пользователь отменил run | Best-effort stop и cleanup |

Timeout reviewer не ослабляет gate: session заменяется, review повторяется.

## Acceptance tests

- Crash после каждого transition восстанавливается по `state.json` без
  transcript.
- Crash между подготовкой и подтверждением backend operation не вызывает
  повторной отправки без reconcile.
- Mutating gate признаётся invalid.
- Два review разных snapshots не дают общий PASS.
- E2E fix не запускает review до стабилизации E2E-loop.
- Финальный snapshot имеет четыре подтверждения: QC, Reviewer A, Reviewer B,
  E2E.
- После `COMPLETE` внешние run artifacts отсутствуют, project settings остаются.
