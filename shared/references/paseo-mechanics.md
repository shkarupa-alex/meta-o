# Paseo native mechanics

Use the installed `paseo --help` and subcommand help. Require `paseo status
--json`, the intended workspace/working directory, `paseo` on `PATH`, and the
upstream `paseo` companion skill in the active harness skill directory.

## Sessions

Start a visible background agent with an explicit provider, model, posture and
working directory:

```text
paseo run --background --title <title> --provider <codex|claude|opencode> --model <model> --mode <unsandboxed-mode> --cwd <repo> --json <prompt>
```

Use the returned agent ID for every later action. Start both review agents before
waiting for either.

## Delivery, state and questions

```text
paseo send <agent-id> --prompt <message> --json
paseo wait <agent-id> --timeout <seconds> --json
paseo inspect <agent-id> --json
paseo ls --json
paseo permit ls --json
paseo permit allow <agent-id> <request-id> --json
paseo permit deny <agent-id> <request-id> --json
```

Inspect after every wait when more state detail is needed. Distinguish running,
idle/completed, pending permission/question, failed and missing states. Use
`send` for an ordinary answer and `permit allow|deny` only for the exact visible
permission request. Never infer completion from an idle process alone.

## Complete response and diagnostics

The installed public `wait --json` result's settled assistant message is the
complete response for Meta-O. Verify it with a normal fixture and a
three-to-four-screen fixture containing begin/middle/end markers. `inspect` is a
metadata and state surface; it need not repeat the final response. If `wait`
exposes only a preview or no settled assistant message, Paseo is unsupported for
Meta-O until its public surface changes; do not reconstruct a result from
private provider data.

`paseo logs <id>` and `paseo attach <id>` provide whole-session diagnostics.
They do not establish a complete settled response unless the long fixture proves
the public output is complete.

## Cleanup

Archive only exact agents created by the run after their responses are delivered:
`paseo archive <id> --json`. `stop` interrupts and `delete` hard-deletes, so use
them only for an explicitly authorized exact target.
