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

## Complete response and diagnostics

Use the public settled-response field returned by `herdr agent get` when the
installed version exposes it. If it does not, use the documented public agent
read surface only when a live acceptance fixture proves it contains the entire
settled final response. `herdr agent read --source visible|recent` is a
whole-session diagnostic or bounded terminal view by default; it is not proof of
complete response retrieval without that fixture.

Never use private transcripts, hooks, direct provider processes or undocumented
session storage. Verify normal and three-to-four-screen responses with explicit
begin/middle/end markers. Missing markers make the result `unknown`.

## Reviews and cleanup

Create reviewer panes first, then start both reviewers before waiting for either.
Retrieve both complete responses independently. Keep sessions visible until the
barrier and delivery succeed. Clean up only exact panes/tabs/agents created by
this run and only when ownership is certain.
