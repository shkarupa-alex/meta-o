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
- a branch-local feature backlog whose temporary entries have reason, practical
  impact and next step, plus a project-owned non-mutating `MO-BACKLOG/1` closure
  command and G0/GC/G1/G2 rules in the entry contract. Accepted repair installs
  the shipped checker as the project's own `tools/mo-backlog.mjs` and calls it
  with that project's whole notebook schema — path, title, open heading and
  every entry field — because half a schema silently checks a foreign notebook
  against the supplier's wording;
- a short commands-and-papercuts document, `docs/papercut.md` by default and any
  equivalent accepted on content, linked from `AGENTS.md`, whose writing rule is
  narrow on purpose: a frequent or routine command hung or failed and the cause
  is known, so one short line records what it does, what it is for and what did
  not work; a stale line is removed by the change that made it wrong; one-off
  incidents and methodology friction belong elsewhere and would be lost here;
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
protocol literals and upstream names remain in English. For a Russian-speaking
project, write a heading such as `## Установка`, but keep `make mo-qc`,
`worker_done`, `needs_attention`, `Orca` and file paths unchanged. In a table,
translate explanatory columns such as `Назначение`, while preserving API field
names and exact state values. Verbatim user intent always keeps its original
language, including mixed-language messages. These examples resolve ordinary
mixed artifacts; only a genuinely undecidable case belongs in backlog.

Internal Markdown links use a label containing the target document's H1 title,
not its path. Enforce resolution and labels with a mature Markdown AST/link
tool, never a regex Markdown parser.

## Knowledge id history

Current-tree checking and history checking are different claims. The tree shows
the identifiers agree now; the history shows no meaning was redefined and no
identifier deleted unnoticed on the way here. Neither proves the other, so a
ready project states both.

Guessing is forbidden, which makes the absence of a declaration `unknown` rather
than "probably none". A ready project declares the stage in `AGENTS.md`, or in
the document `AGENTS.md` names as its quality contract, as a level-two section
whose heading contains `Knowledge id history` and which holds:

- exactly one fenced block containing exactly one command line — the history
  stage;
- exactly one line naming the project's authoritative quality command;
- exactly one YAML record with the key `history_cutoff_sha`, the project's lower
  boundary.

Parse that section with a real Markdown AST, never with a regular expression
over the document. If the section is missing, or any of those counts is not
exactly one, the result is `history=unknown` with `cutoff=none` and no guess.

The stage must be a substring of the declared quality command: a stage that
exists but is not part of the authoritative check is not a gate. Its presence is
proven by behaviour in a disposable clone, never by running the project's full
quality command and never by touching the candidate worktree.

The entry contract also states the authorization grammar the stage enforces: a
commit trailer with the verbs `remove`, `reuse` or `editorial`, and a matching
`knowledge_id_change` record in the same commit. A boundary and its commit ids
belong to the project that owns them and are never copied from the supplier.

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

Verify `.orca/` and `spec/` separately with `git check-ignore -v --no-index` and
prove the matching ignore source is tracked with `git ls-files --error-unmatch`.
Global or `.git/info/exclude` coverage is a setup gap.

Discover GitHub/GitLab CI from authenticated hosting metadata, then parse only
tracked local YAML and literal local includes/reusable workflows with `js-yaml`.
Return a bounded `CI-Coverage/1` outcome: `covered`, `config_present`,
`no_ci_surface` or `unknown`. `covered` requires candidate/MR and applicable
merge-group/train reachability, non-optional execution and proven required
policy. Dynamic/remote includes, expressions or unreadable settings are
`unknown`. Show an exact proposed patch but never modify CI YAML or server-side
protection without a separate request.

## Backend and harness readiness

Detect Orca from its native environment and status surface. Report unsupported
or ambiguous environments rather than guessing. When explicitly asked, check the
control and companion skill from [Backend contract](backend-contract.md).

Companion discovery remains separate from executable discovery. Resolve one
absolute Orca binary and require both `orca skills get orchestration --json` and
`orca skills get orca-cli --json` to return non-empty version-matched guides. Do
not install copies into harness homes.

Check `orca`/`orca-cli` separately from the upstream `orchestration` companion
and record each result independently. Orca exposes its version-matched
`orchestration` guide through the native skill surface.

Run the bundled posture helper for Codex, Claude Code and OpenCode in applicable
launch-parent shells:

```text
scripts/mo-posture.sh --self-check --shell all
scripts/mo-posture.sh --shell <zsh|bash|all> -- codex claude opencode
```

Missing, divergent or unreadable posture is not support. Check workspace trust,
hooks and wrappers without printing secrets. Personal configuration changes
require explicit confirmation.

Backend-wide health does not prove harness readiness. Use Orca's documented
launch and observation surfaces to verify every selected harness. Before task
bytes, distinguish a normal agent prompt from Claude trust UI and a shell
prompt; an ambiguous public surface makes that route unsupported. Verify one
owner of unsandboxed posture so a fallback never duplicates wrapper flags.
`terminal create --title` and `terminal rename` set the tab title: prove a
stable title under `visualLayouts[].root.tabs[].title` from
`terminal list --include-visual-layouts --json`, not from `terminals[].title`,
which a running harness repaints.

Inspect `ProjectRegistrationSet/1` and `OwnedResourceSet/1`. A folder/no-project
context without existing same-project isolated worktrees is a typed placement
gap; setup may recommend a Git-capable project, but project/repository
registration mutation requires separate confirmation outside review start.

When `mo-watchdog` is installed or expected, require `jq` and `flock` separately
from the Orca control. Missing JSON parsing or kernel-released locking makes
safe scan or nudge delivery unavailable; report that dependency rather than
treating backend output or concurrency as best effort.

## Isolated setup branch

If tracked project setup must change, do it in a separate `feature/meta-o-setup`
branch based on up-to-date `develop`. Do not mix setup repair into the user's
current feature branch. Show the proposed changes and their purpose before
editing. Preserve equivalent existing conventions.
