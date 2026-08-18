# §A-POSTURE-01 — У provider posture один probe и обязательные consumers

## Решение

`shared/scripts/mo-posture.sh` — единственный владелец zsh/bash launch-resolution
diagnostic. Сборка byte-for-byte копирует его во все три orchestration skills и
`mo-setup`: каждая установка остаётся самодостаточной без provider proxy.

Consumers запускают его напрямую из установленного каталога:

```text
scripts/mo-posture.sh --self-check --shell all
scripts/mo-posture.sh --shell <zsh|bash|all> -- <selected-providers>
```

Probe классифицирует command kind и первый path во всех применимых shell modes.
Он не запускает provider, не меняет configuration, не хранит run state и не
решает, поддерживается ли backend. Missing, divergent, malformed или incomplete
evidence не доказывает поддержку. Реальные harness readiness, model activation,
trust, permission behavior и unsandboxed posture остаются live checks.

## Бизнес-причина

Launch posture должен быть детерминированным без wrapper над native provider CLI.
Один bounded read-only helper у всех consumers предотвращает drift и не
превращает личное shell behavior в угаданную prose-рецептуру.

Решение служит §B-PORTABILITY-01, §B-PORTABILITY-07 и §B-CONTROL-04: работа идёт
на уже настроенном harness без прокси, чужой интерфейс не угадывается, а лишний
управляющий слой не заводится. Если §A-POSTURE-01 отменяется, копии probe в
четырёх скилах и его self-check удаляются, а диагностика возвращается в прозу
каждого скила по отдельности.

## §A-POSTURE-02 — Граница безопасности

Script владеет одной process group и читает private NUL-framed child evidence.
Он не печатает provider secrets или bodies alias/functions. Dynamic Claude model
discovery отдельно использует документированный lifecycle Agent SDK и не
накладывает на provider дополнительный platform-specific no-fork sandbox.

Изменения личного wrapper или shell profile требуют явного подтверждения
пользователя. Агент не печатает protected definition; пользователь передаёт
подтверждённое credential-free или redacted представление.

Это §B-HUMAN-01 в конкретном виде: личная конфигурация меняется только с явного
подтверждения пользователя, а secrets не печатаются вообще.
