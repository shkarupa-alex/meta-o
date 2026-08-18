# Project setup contract

This document owns the substantive checks performed by `mo-setup`.

## Knowledge and entry layer

Inspect substance, not file presence. A ready project has:

- business framing that preserves the meaning of the original request and every
  later user intent, with secrets redacted rather than persisted, while the
  complete verbatim ledger stays with the task or spec that is still alive;
- one glossary meaning per project term;
- architecture decisions citing their business reason, each thesis and each
  decision carrying a unique stable id, and each decision naming the thesis ids
  it serves;
- a backlog containing only real deferrals, each with reason, practical impact
  and next step, never active progress;
- E2E scenarios and an acceptance-to-proof mapping;
- a plain-language README explaining purpose, use, constraints, commands and
  links to the knowledge layer;
- concise, useful, byte-identical `AGENTS.md` and `CLAUDE.md` containing project
  outcomes, boundaries, purpose, knowledge, commands, version-control rules and
  a dictation rule: anomalous wording that could materially change scope or
  outcome is clarified with the user rather than silently corrected, while the
  confirmed intent remains verbatim.

Human-facing project knowledge uses the user's language, inferred from the
business framing unless the user chooses another. Code, identifiers, commands,
protocol literals and upstream names remain in their technical language. For a
Russian-speaking project, write a heading such as `## Установка`, but keep
`make mo-qc`, `worker_done`, `needs_attention`, `Herdr` and file paths unchanged.
In a table, translate explanatory columns such as `Назначение`, while preserving
API field names and exact state values. Verbatim user intent always keeps its
original language, including mixed-language messages. These examples resolve
ordinary mixed artifacts; only a genuinely undecidable case belongs in backlog.

Internal Markdown links use a label containing the target document's H1 title,
not its path. Enforce resolution and labels with a mature Markdown AST/link
tool, never a regex Markdown parser.

## Tooling and purpose

Read `package.json`, `pyproject.toml`, task runners and existing config before
proposing changes. Require one deterministic non-mutating aggregate QC command.
Use mature linters and project-owned configuration for complexity and function/
module size when the language supports them. Require purpose explanations for
significant first-party modules, exported APIs, classes, overloads and
architecture boundaries, each naming the architecture decision id it implements;
trivial accessors and generated glue need no ritual prose. A custom checker
requires proof that a plugin/config solution is impossible.

Reviewer checks do not mutate. Any diagnostic that can rewrite tracked files
runs in a disposable location.

## Backend and harness readiness

Detect the active backend from its native environment and status surface. Report
unsupported or ambiguous environments rather than guessing. When explicitly
asked, check all three backend controls and companion skills from
[Backend contract](backend-contract.md).

Companion discovery is backend-native and remains separate from executable
discovery. Herdr may expose an installed `herdr` skill, Orca exposes its
version-matched `orchestration` guide through `orca skills`, and Paseo may expose
its version-matched `paseo` guide either in an active harness directory or its
public application bundle. Name which source was found. Do not require copying
a readable bundled guide into personal configuration merely to make the check
pass.

Run the bundled posture helper for Codex, Claude Code and OpenCode in applicable
launch-parent shells:

```text
scripts/mo-posture.sh --self-check --shell all
scripts/mo-posture.sh --shell <zsh|bash|all> -- codex claude opencode
```

Missing, divergent or unreadable posture is not support. Check workspace trust,
hooks and wrappers without printing secrets. Personal configuration changes
require explicit confirmation.

Backend-wide health does not prove harness readiness. For Paseo, inspect native
provider discovery for Codex, Claude Code and OpenCode and distinguish an empty
catalog from a command failure. Report a missing provider-managed working
directory or failed server boot as the concrete missing capability; do not
create personal Paseo state or restart its daemon without explicit confirmation.

When `mo-watchdog` is installed or expected, require `jq` and `flock` separately
from the three backend controls. Missing JSON parsing or kernel-released locking
makes safe scan or nudge delivery unavailable; report that dependency rather
than treating backend output or concurrency as best effort.

## Isolated setup branch

If tracked project setup must change, do it in a separate
`feature/meta-o-setup` branch based on up-to-date `develop`. Do not mix setup
repair into the user's current feature branch. Show the proposed changes and
their purpose before editing. Preserve equivalent existing conventions.
