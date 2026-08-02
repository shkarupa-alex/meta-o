# Architecture — state that survives the process

## §A-EXTERNAL-STATE — Run state lives under `~/.meta-o`, keyed by canonical path

Implements §B-WORKFLOW-02 and §B-CONTROL-01.

Nothing about a run is written into the repository. State lives in
`~/.meta-o/projects/<readable>--<sha256[0:12]>/runs/<run-id>/`, mode `0700` for
directories and `0600` for files.

Two properties drive the key's shape (`src/core/project-key.mts`). It has to be
readable, because a human debugging a stuck run should be able to find the
directory. And it has to be *unique*, because two different paths can easily
produce the same readable form once separators are replaced — so the canonical
`realpath` is hashed and the first 12 hex characters are appended. Moving a
project produces a new key, and migration is explicit; silently adopting another
project's state would be worse than starting over.

Writes are `temp → fsync → rename → fsync(parent)`, and a short advisory
`writer.lock` serialises transitions of *one run only*. Locking a project would
stop two feature branches from progressing independently, which is a normal
thing to want.

Every path component is verified with `lstat` before use: a symlink, a foreign
owner or group/other permissions block the run (`src/core/safe-fs.mts`). Node
exposes no `openat`, so this is checked component-wise plus `O_NOFOLLOW` — a
documented deviation from the ideal dirfd-relative walk.

## §A-CRASH-RECOVERY — A fresh orchestrator resumes from state, never from a summary

Implements §B-WORKFLOW-02.

`state.json` holds current state and nothing else: identity, phase, a monotonic
`stateVersion`, `orchestratorGeneration`, the run's immutable ModelSet, session
handles, compact decisions, the candidate and plan, gate confirmations, *open*
findings only, at most one pending operation, and the pause reason. No task
graph, no transcript, no narrative.

That restriction is the feature. A fresh orchestrator reads it and knows exactly
what to do next, because the next step is computed from it. A handoff document
would be a second source of truth, written by a process that was about to die.

Takeover requires proof that the previous orchestrator is terminal or failed —
and `meta-o run takeover` obtains that proof itself, by asking the backend,
rather than accepting a status the caller declares. It reports what it observed
as `previousStatus` and refuses when the predecessor is still alive. Every
commit then re-checks the generation fence. Two live orchestrators driving one run would issue conflicting
instructions to the same workers — a failure that is silent at first and
expensive later.
