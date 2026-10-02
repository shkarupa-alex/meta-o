---
name: mo-debug
description: Use only when the user explicitly requests mo-debug; read a bounded set of the user's own Claude or Codex session logs and classify where Meta-O skills and agents deviated, into a local redacted report.
license: MIT
metadata:
  repository: https://github.com/shkarupa-alex/meta-o
  source_tree: "ccb74c7c27ef9a0554f6a53b14568abf8aed0b1b"
---

# Diagnose your own agent sessions

Start only when the user names `mo-debug`. A request to debug code, to explain
a failure or to review a session in general does not activate it, and no other
skill calls it.

Read [Обратная связь о методологии](references/methodology-feedback.md)
completely: friction you hit goes to the user in your answer, and this skill
writes no Issue.

## What you may read

Take from the user explicit session paths or ids — a Claude session UUID or a
Codex thread id — and a bound: `--since <ISO-8601>`, `--max-records <n>` or
both. Ask for them when they are missing; never search for sessions yourself,
and never open a session log with any other tool. Only the bundled helper reads
them:

```text
node scripts/mo-debug.mjs scan --session <path-or-id> [--session …] \
  [--since <ISO-8601>] [--max-records <n>] \
  [--history <meta-o-checkout>] [--max-history <n>] [--out <new-file>]
```

The helper reads only regular files under `~/.claude/projects/` or
`~/.codex/sessions/` that the invoking user owns; a set `CLAUDE_CONFIG_DIR`
replaces `~/.claude` and a set `CODEX_HOME` replaces `~/.codex`, and each must
be absolute. `foreign_path`, `session_not_found` and
`session_ambiguous` are refusals: the file stayed unread, and you do not try
another way in. `search_incomplete` means a session root could not be reached or
a directory under it could not be read, so the id was neither found nor proven
absent; name the session as unknown. `read_failed` means an owned log was
opened but reading it failed; its events are withheld, so name it as unknown
too. `--history` names a Meta-O Git checkout
used for version attribution. The events and their locators are only in the
report, so always pass `--out` with a path the user names or a new file under
the system temp directory; it must not exist yet and is created with mode
`0600`. `out_exists` means the path is somebody's data: pick another.

The first line is `MO-DEBUG/1 status=<ok|partial|unknown|refused> …`. `partial`
means a bound was reached, a session was refused, an id search was incomplete or
a read failed next to a readable session, or history was incomplete — a shallow
clone, or `history=unreadable` when a Git read failed; `unknown` means no
requested session could be read, because none had a recognized format, its id
search was incomplete or its read failed. Say which, and never present a partial read as complete.

## Classify

Look first at orchestration, then at review: which `mo-*` skill was invoked,
which text was loaded, which helper ran and what typed line it returned, and
what the agent did next. Put each deviation into exactly one category:
`skill_text_defect`, `agent_deviation`, `backend_defect`, `harness_defect` or
`unknown`, and cite the event's locator from the report. A
deviation you cannot tie to a record is `unknown`.

A `skill` line gives the loaded version. `version=source_tree:<id>` with a
commit range means the complete loaded file equals, byte for byte, a committed
file carrying that build stamp; `body_match` is a byte-exact match of a loaded
body without a stamp; `unknown` is unknown: never attribute the currently
installed text, or the current commit, to a historical session. `stamp=<id>` is
only the stamp the session showed; a partial read, an edited file, a stamp that
no commit carries, or a scan without `--history` stays `version=unknown`,
because a locally built or edited skill carries a stamp too.

## What leaves this skill

Only the local report: the helper's typed lines, your classification and, when
the user wants one, a local draft of an external report. Every excerpt you
quote comes from the helper's redacted output; never copy a raw session line, a
secret, an absolute path or a private message body. An excerpt that ends at
`[REDACTED:<kind>]` lost the rest of that line to redaction after a credential
key; the missing words are not evidence of a defect. Redaction recognizes known
token shapes and keyed values, not every password, so ask the user to read the
report before sharing it. This skill publishes
nothing and creates no Issue: filing the draft is a separate step of an
explicitly activated lifecycle skill that routes external work, and only with
the user's permission to publish.

The read is not evidence that a review, QC or orchestration step ran; that
evidence comes from the backend's public surfaces only.

## Meta-O calls

- none
