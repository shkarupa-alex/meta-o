# §A-SESSION-01 — Orca actors остаются ресурсами исходного project

## Решение

Перед запуском Meta-O строит read-only `ProjectRegistrationSet/1` и
`OwnedResourceSet/1` из version-matched project/repo/worktree/terminal/worker
surfaces. После start и cleanup registration set byte-semantically неизменен;
resource delta содержит только exact-owned handles текущего Run.

Review допускает existing clean isolated worktree исходного project или Orca
`new-child`, доказанно атрибутированный Git project. Shared current worktree,
raw `git worktree add`, `orca repo add`, `new-top-level` и недоказанная remote
placement запрещены. До pair это даёт один `REVIEW-START version=1
status=unsupported reason=<typed-code>`, без reports/namespace/handoff.

Standalone review создаёт только двух reviewers и не присваивает caller/executor.
При `FINDINGS` sessions остаются hot; перед final proof они освобождаются и
создаётся fresh pair. Cleanup затрагивает только сохранённые exact handles; при
partial start сохраняет foreign/ambiguous resources и повторно сравнивает обе
проекции. Visible titles имеют форму `<work-slug>:<role>`.

Решение служит §B-SESSION-01, §B-REVIEW-04 и §B-PORTABILITY-07.
Без §A-SESSION-01 reviewer isolation снова может создавать побочные project
registrations, а exact cleanup и hot/fresh ownership становятся неразличимы.

Публичный Orca gap для нескольких workspace поверх folder project уже ведётся в
[Orca issue #2654](https://github.com/stablyai/orca/issues/2654). Пока он открыт, отсутствие
атрибутированного same-project route даёт `REVIEW-START/1 unsupported`, а не
временную регистрацию нового project.
