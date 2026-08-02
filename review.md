# Review: AI-driven development workflow

Проверены реализация и текущие незакоммиченные изменения относительно
`spec/2026-07-24-ai-driven-development-workflow/README.md` и его
authoritative documents. Найдено 3 замечания.

## Findings

### P1 — malformed import-graph contract всё ещё может молча отключить правило

[`templates/python/quality/import_graph.py:255`](templates/python/quality/import_graph.py:255)
разбирает запись через `str.partition()`. Проверяется лишь наличие непустых
левой и правой частей, поэтому, например, `forbidden_edges = ["alpha -> beta -> typo"]`
принимается как пара `("alpha", "beta -> typo")`. Импорт
`alpha -> beta` больше не совпадает с контрактом, gate завершается успешно и
объявленное structural-ограничение фактически пропущено. То же относится к
`independent = ["alpha <-> beta <-> typo"]`.

Это противоречит §40: malformed contract обязан давать FAIL, а не молча
изменять смысл проверки. Требуется требовать ровно один разделитель и
непустые стороны (например, проверкой `entry.count(separator) == 1`), а также
добавить оба случая в `test_the_three_declared_structural_contracts_are_enforced`.

### P1 — HTTPS acceptance test и его TLS fixtures не находятся под Git

[`tests/spec-input.test.mts:28`](tests/spec-input.test.mts:28) безусловно читает
`tests/fixtures/localhost-cert.pem` и `localhost-key.pem`, но сам тест и оба
PEM-файла отсутствуют в `git ls-files` (сейчас это untracked files). В
результате чистый clone молча не запускает заявленную HTTPS acceptance-проверку.
Если закоммитить только тест, `readFileSync` завершит suite ошибкой `ENOENT` до
выполнения тестов HTTPS.

Это оставляет без проверки требования §20 к HTTPS input и нарушает §40:
authoritative local QC в fresh detached worktree обязан запускать полный
версированный suite. Следует добавить test и безопасную тестовую пару PEM в
Git либо генерировать её в temp directory внутри теста; второй вариант не
должен оставлять файлы в репозитории.

### P2 — `meta-o e2e result` выдаёт ложный предварительный PASS

Skill предписывает перед сдачей результата вызвать `meta-o e2e result`
([`skills/test-e2e/SKILL.md:96`](skills/test-e2e/SKILL.md:96)). Но реализация
[`src/cli/commands/gates.mts:498`](src/cli/commands/gates.mts:498) сверяет лишь
наличие planned IDs среди `scenarios`, digest и отсутствие не-passed status.
Она не проверяет `selectedScenarioIds`, `selectionRationale` и не отклоняет
сценарии вне плана. Поэтому такой command может напечатать `pass: true` для
payload, который затем отвергнет `run record-e2e` в
[`src/cli/commands/results.mts:511`](src/cli/commands/results.mts:511).

Completion этим напрямую не обходится, поскольку `record-e2e` строже, но
проверка, на которую опирается worker skill, сообщает неверный результат и
создаёт лишний прогон/неясную диагностику. Лучше извлечь общую валидацию E2E
payload и применять её в обеих командах; добавить CLI-test, который доказывает
одинаковый отказ для пустого/несовпадающего `selectedScenarioIds` и пустого
`selectionRationale`.

## Проверки

- `npm run typecheck` — успешно.
- `python3 -m unittest tests/test_quality_gates.py` из `templates/python` —
  успешно: 56 tests.
- `npm test` и `make qc` — успешно в текущем workspace. Результат не снимает
  P1: HTTPS test и PEM fixtures в нём неотслеживаемые.
