# Herdr native mechanics

Use only commands documented by the installed `herdr --skill` and `--help`
surfaces. Require `HERDR_ENV=1`, the intended workspace ID, an interactive
orchestrator pane, `herdr` on `PATH`, and the installed upstream `herdr` skill.

## Discovery and visible sessions

Read `herdr status`, `herdr workspace list`, `herdr tab list`, `herdr agent
list`, and relevant command help before mutation. Confirm the injected workspace
and repository working directory. Create visible tabs/panes with `--no-focus`
where supported. Start each harness in its own visible pane:

```text
herdr agent start <name> --kind codex --pane <id> --timeout 300000 -- <args>
herdr agent start <name> --kind claude --pane <id> --timeout 300000 -- <args>
herdr agent start <name> --kind opencode --pane <id> --timeout 300000 -- <args>
```

Pass the selected model and unsandboxed posture using that harness's documented
arguments. A successful start proves interactive readiness, not task success.
Before the first prompt, confirm through public detection or visible output that
the exact harness TUI and effective posture are present. A prompt receipt is not
delivery proof: confirm the initial task appears once or produces a settled
response. If public output proves the task never appeared, wait for true
readiness and retry that exact initial prompt once. If delivery is ambiguous, do
not resend it.

## Delivery, state and questions

```text
herdr agent prompt <name> <text> --wait --until idle --until done --until blocked --timeout <ms>
herdr agent wait <name> --until idle --until done --until blocked --until unknown --timeout <ms>
herdr agent get <name>
herdr agent list
```

`blocked` or a harness question visible through public agent/pane state is a
question boundary. Answer with an ordinary `agent prompt`. Do not blindly
resubmit after an ambiguous timeout: inspect state first. `unknown`, a missing
agent or a process mismatch is not success.

A harness-native `/goal` may remain active and repeat an already produced answer
instead of settling. Judge this only from the public agent state and visible
response. When the requested work is complete but the goal remains active, send
one ordinary follow-up asking the executor to mark that goal complete. Do not
invent a completion grammar or resend the original task.

## Complete response and diagnostics

Use the public settled-response field returned by `herdr agent get` when the
installed version exposes it. If it does not, use the documented public agent
read surface only when a live acceptance fixture proves it contains the entire
settled final response. In the current public surface,
`herdr agent read --source recent-unwrapped` can serve that role only after both
normal and long fixtures pass. Other `visible|recent` reads are whole-session
diagnostics or bounded terminal views by default; they are not proof of complete
response retrieval without that fixture.

Never use private transcripts, hooks, direct provider processes or undocumented
session storage. Verify normal and three-to-four-screen responses with explicit
begin/middle/end markers. Missing markers make the result `unknown`.

## Reviews and cleanup

Create reviewer panes first, then start both reviewers before waiting for either.
Retrieve both complete responses independently. Keep sessions visible until the
barrier and delivery succeed. Clean up only exact panes/tabs/agents created by
this run and only when ownership is certain.
