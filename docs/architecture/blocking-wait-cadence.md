# §A-WAIT-01 — Один run-wide waiter владеет liveness actors

## Решение

Caller держит одну blocking wait point на active actor set и demultiplex'ит
`worker_done`, `escalation` и `question` по exact handle. Arm равен минимуму
cadence ожидаемых классов: executor до 600000 ms, reviewer/E2E до 300000 ms.
Relevant event будит раньше; quiet timeout разрешает один public liveness
snapshot и немедленное re-arm без сообщения actor или человеку.

Первый transport failure повторяет тот же arm один раз, второй даёт
`UNKNOWN/needs_attention` без restart/release/replace. Backend-order batch
обрабатывается полностью до acknowledgement; foreign/released events
отбрасываются. `sleep`, minute polling и несколько waiter одного actor запрещены.

Решение служит §B-UPTIME-03, §B-UPTIME-05 и §B-CONTROL-04. Без §A-WAIT-01
ранние completion/questions теряются, quiet timeout ошибочно выглядит как сбой,
а повторные poll/wait создают лишнюю нагрузку и гонки ownership.
