# AI-driven development workflow — комплект спецификации

> **SUPERSEDED — 2026-08-05.** Этот комплект больше не нормативен. Его заменяет
> [`spec/2026-08-05-ai-driven-development-workflow-revision/`](../2026-08-05-ai-driven-development-workflow-revision/README.md).
> Реализация этого комплекта (public `meta-o` CLI, FSM, state store, session
> adapters, snapshot/attestation, installer scripts, семь `*-feature`/`*-project`
> skills) удалена; она остаётся только в истории Git до коммита «doc: new thin
> spec». Каталог сохранён как история решений и как источник формулировок,
> которые новая спека переиспользует.

## Authoritative documents (historical)

1. [Финальная master-spec](./2026-07-24-ai-driven-development-workflow-council-brainstorm.md)
2. [00 — Master workflow](./00-master-workflow.md)
3. [10 — Knowledge layer](./10-knowledge-layer.md)
4. [20 — Orchestration and skills](./20-orchestration-and-skills.md)
5. [30 — Cross-review and E2E](./30-review-e2e.md)
6. [40 — Local QC and Python profile](./40-local-qc-python.md)
7. [50 — Optional multi-project watchdog](./50-watchdog.md)
8. [Decision ledger](./decision-ledger.md)

Внутри этого комплекта master-spec имела приоритет при расхождении, а шесть
numbered-файлов были её implementation-ready decomposition. При расхождении с
ревизией 2026-08-05 приоритет у ревизии.

Остальные файлы каталога — исходные proposals, cross-reviews, pre-mortem,
промежуточный synthesis и audit trail консилиума. В частности,
`spec-review.md` — автоматически изменявшийся рабочий артефакт review job, а не
утверждённая спецификация.

