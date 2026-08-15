# Paseo native mechanics

Use the installed `paseo --help` and subcommand help. Require `paseo status
--json`, the intended workspace/working directory, `paseo` on `PATH`, and the
upstream `paseo` companion skill. Prefer an installed active-harness copy. When
that is absent, Paseo's version-matched public application bundle is an
acceptable separate companion source if its complete `skills/paseo/SKILL.md`
can be read; on packaged macOS this is
`/Applications/Paseo.app/Contents/Resources/skills/paseo/SKILL.md`. Report the
companion missing only when neither source is readable. Do not install personal
skills without explicit confirmation.

Read the discovered companion guide completely before choosing a provider or
creating a session, and follow its current preference-discovery requirements.
A path check alone does not establish that the controlling agent knows Paseo's
semantics.

Preflight each selected harness through Paseo's native provider surface, not
from daemon health alone:

```text
paseo provider ls --json
paseo provider models <codex|claude|opencode> --json
```

A provider-discovery failure is actionable readiness evidence, not an empty
catalog. In particular, an OpenCode server that cannot enter Paseo's managed
working directory is not launch-ready even while `paseo status --json` reports
the provider available. A direct successful launch may prove readiness when
catalog discovery alone is unavailable; record which public evidence was used.
Also resolve the provider executable through the daemon's effective `PATH`.
A user shim that injects an interactive flag before OpenCode's `serve`
subcommand can turn the provider server into a TUI and make discovery time out.
Prefer the native executable earlier in the daemon's `PATH`, then restart the
daemon with explicit authority; do not silently rewrite a user's shared shim.

## Sessions

Start a visible background agent with an explicit provider, model, posture and
working directory:

```text
paseo run --background --title <title> --provider <codex|claude|opencode> --model <model> --mode <unsandboxed-mode> --cwd <repo> --json <prompt>
```

Use the returned agent ID for every later action. Start both review agents as
native harness instances and put each review brief or its accessible file path
in `run`'s prompt argument; never generate or run a shell script that invokes the
reviewer harness. Start both before waiting for either.

## Delivery, state and questions

```text
paseo send <agent-id> --prompt <message> --no-wait --json
paseo wait <agent-id> --timeout <seconds> --json
paseo inspect <agent-id> --json
paseo ls --json
paseo permit ls --json
paseo permit allow <agent-id> <request-id> --json
paseo permit deny <agent-id> <request-id> --json
```

Follow-ups and answers use `--no-wait`: delivery must return immediately so the
orchestrator can continue servicing questions and permissions. Track completion
with a separate `wait` and then `inspect`; never turn `send` into the wait. Before
sending, retain the public `UpdatedAt` value exposed by `inspect`; inspect again
immediately after the send receipt. Accept completion only after either a
non-idle state was observed before the final idle state, or a later `UpdatedAt`
advance beyond that immediate post-send receipt and `wait` includes the new
prompt with its settled message. An unchanged identity and idle state may be the
previous response, so it is `unknown`, not success. After that evidence,
distinguish running, idle/completed, pending permission/question, failed and
missing states. Use `send` for an ordinary answer and `permit allow|deny` only
for the exact visible permission request. Never infer completion from an idle
process alone.

## Complete response and diagnostics

`wait --json` proves settlement and returns a public `message` timeline. Its
`Last 5 activity items` bound limits the number of items, not the bytes within
one text item. Locate the latest exact prompt as its `[User]` item and take the
following unlabeled text item as that prompt's settled assistant response;
labelled `[Thought]` items are not response bytes. If the latest prompt or its
following text item is absent or ambiguous, retrieval is `unknown`.

Qualify this boundary for every selected harness only after a normal fixture
and a three-to-four-screen fixture contain intact begin/middle/end markers in
that one item. Codex, Claude Code and OpenCode passed both fixtures through the
Paseo 0.3.1 public `wait --json.message` surface on 2026-08-15; this observation
does not waive the current run's fixtures. `inspect` is a metadata and state
surface; it need not repeat the final response. Do not reconstruct a result from
private provider data.

`paseo logs <id>` and `paseo attach <id>` provide whole-session diagnostics.
They do not establish a complete settled response unless the long fixture proves
the public output is complete.

## Cleanup

Archive only exact agents created by the run after their responses are delivered:
`paseo archive <id> --json`. `stop` interrupts and `delete` hard-deletes, so use
them only for an explicitly authorized exact target.
