---
name: mo-setup
description: Bring a project up to the contract the Meta-O workflow needs — docs/business, glossary, backlog and architecture, byte-identical AGENTS.md and CLAUDE.md, make mo-qc and its gates, E2E docs, and a provider wrapper/trust/hook preflight. Use for a new project, or when an existing one is missing part of that contract.
license: MIT
---

# Give the project a contract

Idempotent, and safe to re-run. Before changing anything, show the proposed diff
and say what each piece is for. Never overwrite an existing convention: if the
project already has an equivalent under a different name, ask whether to add an
alias rather than replacing what works.

Read `references/purpose-and-architecture.md` before proposing any purpose or
documentation gate — it defines what those gates are actually checking.

## 1. Knowledge and instructions

Default layout:

```text
docs/business.md
docs/glossary.md
docs/backlog.md
docs/architecture/
docs/e2e.md                 # or docs/e2e/index.md + group files
AGENTS.md
CLAUDE.md
```

`business`, `glossary` and `backlog` live at the top of `docs/`. Do not create a
`docs/knowledge/` layer and do not introduce a knowledge-impact plan; both were
tried and both turned into ritual.

`docs/business.md` holds two things, in this order: the **business framing** — the
user's original request and every later clarification, kept verbatim — and the
durable theses derived from it. Say that in the file itself, because the two get
confused and the framing is the half that gets "tidied" into a summary. When one
file stops being readable, split it the way E2E splits: `docs/business/index.md`
plus one file per piece of work, with the durable theses in the index — and from
then on the framing for a task goes in that task's file, never into a fresh
`docs/business.md` beside the tree. Two files claiming to be the framing is worse
than one long one, because a reviewer reads whichever it finds first.

One thing never goes in verbatim: a **secret**. This file is committed and pushed,
so a token, password, key, connection string with credentials, private URL,
customer data or PII is stored as a marker that keeps the meaning —
`[REDACTED: deployment token]` — with the rest of the sentence word for word. Write
that rule into the file you create, so the next person recording a request reads it
before pasting.

The methodology's §2.1 owns the rules; this skill only creates the place they live.

Who writes what, and when:

| File                 | Holds                                                         | Written by                                            |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| `docs/business.md`   | the recorded business framing, and why the product exists      | whoever takes the request, then the executor          |
| `docs/glossary.md`   | the project's vocabulary, one meaning per term                | executor, when a term enters or shifts                |
| `docs/architecture/` | boundaries and decisions, each traceable to a business reason | executor, when a boundary or decision changes         |
| `docs/backlog.md`    | everything deferred, blocked or knowingly left unfixed        | anyone, the moment they defer it                      |

The spec stays tracked. Durable knowledge is transferred by the executor
**before** the candidate commit, not archived afterwards.

## 2. `AGENTS.md` and `CLAUDE.md`

Both files carry the **same short, stable project contract**: desired outcomes,
the architecture / purpose / knowledge theses, and the project's commands. They
carry no executor methodology and no constraint that belongs to a single feature
run.

They are created and kept **byte-for-byte identical**:

```bash
cmp -s AGENTS.md CLAUDE.md || echo "project instructions have diverged"
```

The provider CLI reads whichever file it prefers, by itself. That is exactly why
an orchestrator never copies the contract into a prompt, and why the two files
must not drift: one provider would silently be working to a different contract.

Both files must state, explicitly, that **anything deferred, deliberately not
done, blocked, or left unfixed for any reason goes into `docs/backlog.md`**, with
its reason, its practical impact and the next step if one is known.

## 3. Provider wrappers, trust and hooks

Read `references/methodology.md §2` step 4 first. It owns the shell-mode probes,
credential-safe launch-mechanism inspection, `unknown` rules and surface-scoped
verdict. This section owns only remediation.

Judge `PATH` by the executable that resolves first, never by whether a directory
is present somewhere in the list. If a wrapper exists but loses precedence,
inspect the actual startup order: the **last** applicable `PATH` prepend wins.
Place the wrapper-directory prepend after every other `PATH` initializer in each
startup file read by a planned surface. Those initializers may include
`brew shellenv`, `mise` / `asdf` / `pyenv` initialization, an explicit
`path_helper`, or a direct assignment. Cover every relevant shell mode; for
example, ordinary and login zsh may require separate final prepends, and a
`.zprofile` prepend must follow later lines such as `brew shellenv`, not merely
follow `/etc/zprofile`. Re-run the methodology's full mode matrix and the actual
launch surface; do not infer success from a file edit.

If an alias or function carries required arguments, obtain only the redacted
definition described by the methodology. Propose an executable wrapper that runs
the real provider binary, supplies every required fixed launch behaviour named by
the methodology and passes all caller arguments through (`"$@"` or equivalent),
or a named provider-native configuration that supplies the same behaviour. Keep
protected environment and prompt values in their existing secure source; never
copy them into displayed output or a new wrapper. Name every intentional
difference before proposing a supported verdict.

The wrapper and shell profiles live outside the repository. Show a redacted but
otherwise exact wrapper/profile diff or ready-to-run commands and ask for
explicit confirmation before writing either one. If the user declines, make no
personal-configuration change: keep the affected launch surfaces `unsupported`
where failure is proven and `unknown` otherwise, and record the gap in the
project's `docs/backlog.md` with its impact and next remediation step.

The local wrappers on the author's machine live in `~/bin/claude` and
`~/bin/codex`. They are a reference for that machine only; absolute paths never
go into portable project docs.

For Claude, additionally check workspace trust for the current project root, and
where the hooks come from. An untrusted workspace goes through the one-time
interactive native trust dialog — this skill does not edit the private
`~/.claude.json` on the user's behalf, and does not promise to work around a
managed policy. Managed `disableAllHooks` / `allowManagedHooksOnly` cannot be
overridden by a wrapper; say so rather than trying.

## 4. Make and QC aliases

One aggregate entry is mandatory:

```text
make mo-qc
```

Conditional entries, created only where the gate really exists:

```text
make mo-typecheck
make mo-lint
make mo-test
make mo-build
make mo-smoke
make mo-e2e
```

Read the `Makefile`, the package scripts and any task runner **first**. When an
equivalent command already exists under another name, ask whether to add an
alias. When a gate is genuinely missing, propose a mature tool plus a
project-owned config — see `references/qc-python.md` and
`references/qc-typescript.md`. A custom wrapper or checker is written only after
a plugin or config solution has been shown to be impossible, and that proof goes
in the commit message.

`make mo-e2e` for browser or benchmark suites pretends nothing. It prints help
starting with `AGENT_REQUIRED: not executed`, names the docs, the commands and
the cleanup, and exits 2. `mo-qc` does not depend on it.

## 5. E2E docs

- a small set: `docs/e2e.md`;
- a large set: `docs/e2e/index.md` plus one file per group.

The index describes the environment, the prerequisites, how a group is selected,
what counts as evidence, and cleanup. Each group file explains when to choose it.
A tester runs the relevant groups, never the whole catalogue by default.

## 6. What this skill does not create

No `.quality/` manifest, no adoption manifest, no receipts, no digests, no
baselines. A project-owned manifest is created when a real external consumer
appears and can be named; in the baseline there is none.
