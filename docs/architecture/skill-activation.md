# §A-ACTIVATION-01 — Скилы Meta-O запускаются только по явному графу

## Решение

Любой `mo-*` применяется только по explicit имени пользователя либо из уже
активного `mo-*`, который объявляет exact callee. Frontmatter description
начинается с explicit-invocation clause и не содержит generic review/setup
trigger. Один AST-раздел `## Meta-O calls` содержит только inline-code имена
callee либо `- none`; references вне него не создают hidden edge.

`find-reuse`, `senior-jsts` и `senior-python` сохраняют узкую implicit
applicability. Deterministic lint сравнивает source/generated graph, а live eval
проверяет near-miss prompts.

Решение служит §B-HUMAN-01 и §B-PORTABILITY-03. Без §A-ACTIVATION-01 harness
может самозапустить дорогой lifecycle по общему запросу, а call graph и
non-activation fixtures становятся лишними.
