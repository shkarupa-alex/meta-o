# §A-DELIVERY-01 — Task bytes доставляются только в доказанный agent prompt

## Решение

Meta-O резолвит один абсолютный `orca` binary, читает из него непустые bundled
guides `orchestration` и `orca-cli`, фиксирует version и использует тот же binary
весь Run. Guides не устанавливаются в harness home.

До task bytes создаётся terminal без payload, public `tui-idle` и version-matched
observation обязаны доказать process identity, normal agent prompt и отсутствие
Claude trust UI/shell prompt. Только затем создаётся/inject'ится один Dispatch.
Composed start разрешён лишь при публичном доказательстве, что payload удержан до
той же readiness. Wrapper является единственным владельцем unsandboxed posture;
fallback не дублирует flags. Неоднозначность делает route unsupported.

Решение служит §B-PROOF-01, §B-PORTABILITY-01, §B-PORTABILITY-06 и
§B-PORTABILITY-07. Без §A-DELIVERY-01 task может исполниться shell или попасть в
trust UI, а guide/version и posture ownership перестают быть доказуемыми.

Upstream Issue для отдельного публичного trust-UI state сейчас
`unsupported`: точный duplicate в публичном tracker не найден, а установленные
host CLI не имеют рабочей аутентификации (`gh` возвращает 401, `glab auth
status` не завершает bounded probe). До появления canonical URL route обязан
fail closed. Смежный пробел аудита effective worker identity уже ведётся в
[Orca issue #16527](https://github.com/stablyai/orca/issues/16527).
