# Backlog

Everything deferred, blocked, deliberately not done, or left unfixed for any
reason. Each entry says why, what it costs in practice, and the next step when
one is known. Nothing here is a commitment and nothing here is groomed by a
feature run.

## Open

### Both end-to-end runs work and neither has reached two PASS

**Why.** Phase 1 item 5 asks for a small feature end to end through both backend
skills. Both ran, in scratch projects, on 2026-08-06 and 07: framing → spec →
executor session → QC → frozen SHA → two independent reviewers, at least one on
another vendor → findings verbatim → new SHA → every gate again. The Herdr route
went through seven candidates, the Omnigent route through six. `docs/e2e.md` records
what each round found and what the two runs establish.

**Practical impact.** The loop is not a story: every round on both routes found
something a green `make qc` did not, twice one vendor passed a candidate the other
then failed on a real defect, and one round caught an acceptance criterion that had
been _deleted_ rather than satisfied. What is still missing is the end state — no
candidate has two PASS in the same round, so nobody can point at a feature that came
out the other end verified. The reason is legible rather than mysterious: reviewers
that probe by mutation raise the bar every round, and severity has been falling
(wrong behaviour → contract holes → unpinned guards) without reaching zero.

Four structural gaps remain, and they are separate from convergence. Both runs
happened in scratch projects. **This session was the orchestrator, reading the
authored skills, rather than a separately launched `mo-herdr` / `mo-omnigent`
following its packaged copy** — so what these runs exercise is the methodology, and
the shipped artefact is still unproven end to end; that gap is worth naming louder
than the other three, because a reader can otherwise take Phase 1.5 as evidence about
the thing users install. The Omnigent route ran the whole lifecycle without a goal,
because it has no transport for one — fixture O1, a property of the route rather than
a gap to close here. And that route's executor turns from round 3 on landed in a
reviewer's conversation (fixture O9), so its rounds prove the gate but not executor
continuity; the skill rule is fixed, the run is not re-done.

**Next step.** Keep the loop running on one of the two fixtures until a round ends
with two PASS; separately, run one feature with the orchestrator launched from an
installed skill rather than from this session, which is the only way Phase 1.5 stops
being a methodology demonstration; then repeat in a real repository. All three are
runs, not code changes.

### The Omnigent review gate cannot run unattended, and both E2E rounds bypassed that

**Why.** §8 of the spec makes the native `session export` the review gate's evidence
on this route, and `addendum-02` deliberately does not extend the stdout-capture
permission to it. The export needs a full conversation id; the REPL prints it
truncated, no non-interactive surface prints it at all, and a 16-character prefix is
refused outright (fixture O10). So the gate needs a human to paste the id from
Omnigent's own picker.

**Practical impact.** Every Omnigent review round is a `needs_attention` handback
rather than a step an unattended run completes — the route still runs the lifecycle,
but not without a person at the two review boundaries of each round. And this
project's own Omnigent run did not do that: it read plain stdout instead, which is the
substitution §8 forbids, so its five completed rounds are off-contract as gate results
even though their findings were real and confirmed by the fixes they produced.

**Next step.** Either measure a sanctioned non-interactive source for the full id — if
a future Omnigent prints it on a headless run, or accepts a prefix, the whole
limitation disappears — or re-run the route with the `needs_attention` step actually
taken, so a completed round exists that the contract admits. Both are runs; the skill
already states the rule.

### Phase 2 was executed before Phase 0, on explicit instruction

**Why.** The spec orders capability fixtures first, and for a good reason: an
unproven route should not be treated as supported. The user asked for the
destructive simplification with nothing deferred, so the control layer was
deleted first and the fixtures are being closed after.

**Practical impact.** The old enforcement was gone while the evidence justifying its
replacement was still missing. That gap has narrowed: the Herdr routes now have
per-provider retrieval evidence and the recovery, review-loop and framing behaviours
have been demonstrated. It has not closed — the Omnigent route fails its
slash-command fixture, so the goal-driven lifecycle has no transport there at all.

**Next step.** Close `docs/phase-0-fixtures.md` row by row. If a fixture fails,
the escape hatch is that the deleted control layer is intact in Git history and
any single piece can be lifted back out — but only with a named reason recorded in
`docs/architecture/`, never "just in case", which is the architecture the spec was
removing.

### The Phase 0 fixtures that remain open, after the 2026-08-06 run

**Why.** Most rows now have evidence: §H for three providers on both surfaces, §G
except the trust step, §O except two rows, §W, §M and §R in full. In §P, the
Claude and Codex wrapper files are verified, but no actual Herdr, hook or harness
surface has supplied its own posture evidence. What is still open needs a real
surface capture, something this machine cannot supply, or a confirmed
personal-config change:
I3–I5 need the repository pushed; §Q needs real Python and TypeScript projects; G3b
needs a workspace that has never been trusted; H7b needs a host-window resize (the
pane-split resize is now measured on all three routes and changes nothing) — and note
that H7b measures Herdr rather than any provider, so it is open on **every** route at
once and no route is literally fully answered until it is closed; H6 needs a
provider that truly repaints; H9 on the OpenCode route needs a compaction that route
has never been through; O6 needs a paused Omnigent session; O7 needs a verified
launch posture inside the actual Omnigent harness — and its throwaway `CODEX_HOME`
inside the working directory makes inherited configuration doubtful; P4a/P4b need
checks inside every claimed surface after remediation; P2c/P3c/P4c need an
OpenCode wrapper or verified native posture.

**Practical impact.** Each open row keeps the affected launch surface unsupported
for the gate it feeds — the remote installs are unverified, no tooling profile has
been wired up on a real project, and unattended provider posture is unaccounted
for. What is no longer true is the blanket statement that nothing is proven.

**Next step.** Work the remaining rows when their preconditions exist: push the
repository (I3–I5), pick a real Python and a real TypeScript project (§Q), and settle
O7 by finding out how Omnigent resolves the provider binary.

### Claude and Codex non-interactive surfaces do not resolve the wrappers first

**Why.** The wrapper files exist and `~/bin` is present, but first resolution
differs by shell mode. On 2026-08-07, the user's `~/.zprofile` ran
`brew shellenv` after the system login profile and prepended `/opt/homebrew/bin`;
`zsh -lc` therefore put it before `~/bin`, while the interactive profile
prepended `~/bin` again. The canonical zsh matrix exits 1 on that divergence,
while bash exits 0 and finds the wrappers in all four modes because its login
profile has no corresponding Homebrew prepend. A `zsh -c` probe launched from an
interactive parent inherited its already-modified `PATH` and did not prove a
hook's environment. `zsh -lic` likewise resembles a Herdr login pane but is not
evidence captured inside that pane. Phase 0 P4a/P4b therefore keep every actual
launch surface `unknown` while recording the failing login diagnostic.

**Practical impact.** A script, hook or backend launched without the interactive
`PATH` can bypass both wrappers and lose the intended permission, approval,
sandbox, environment, prompt and other fixed arguments. It may then stop for
confirmation or run under different instructions despite an interactive session
working.

**Next step.** With explicit user confirmation, place each wrapper-directory
prepend after every other applicable `PATH` initializer as required by
`mo-setup §3`, then re-check first resolution and required fixed
behaviour inside each real surface. If the user declines, keep those surfaces
unsupported where the bare launch is proven and `unknown` otherwise, and record
that decision here.

### The OpenCode route has no `PATH` wrapper, so its posture is unaccounted for

**Why.** The local wrapper rows in §P were first written up as one row per command
and closed as a "qualified pass" — two providers of three. That framing was wrong
in exactly the way this project exists to refuse, so the rows are now per provider:
P2a/P2b and P3a/P3b are closed for the Claude and Codex wrapper files, while
**P2c/P3c/P4c are open** because every checked shell finds only
`/opt/homebrew/bin/opencode` and no native posture is verified.

**Practical impact.** On the OpenCode route nothing in `PATH` supplies the fixed
permission, approval, sandbox, environment or prompt behaviour the wrappers may
supply for the other two. It either comes from OpenCode's own configuration —
unread and unverified — or from nowhere, and an unattended run there is operating
on an unknown posture. An orchestrator must say the wrapper is absent rather than
report "wrappers verified".

**Next step.** Either add an `opencode` wrapper alongside the other two, or verify
a named provider-native posture with credential-safe, key-filtered queries against
`opencode.json` / `~/.config/opencode/`. Record which required keys supply the
behaviour and cite evidence for each launch surface without dumping their values.
Naming native configuration without proving it is how the qualified pass happened
in the first place.

### The business framing grows without a proven answer, and its rules have no gate

**Why.** `shared/references/methodology.md §2.1` requires the user's intent to be
kept verbatim, because a spec is a lossy compression and the loss is undetectable
without the original. Two questions stay open. First, growth: recording every
request verbatim in one file makes it long, and the source this rule came from
names the risk out loud — an encyclopedia every agent re-reads and nobody
maintains. The answer is now specified rather than merely mentioned — the split is
`docs/business/index.md` plus one file per piece of work, the per-feature file is
where a framing goes once that split exists, and a second monolithic
`docs/business.md` beside the tree is forbidden — but no project has ever run
split, so the resolution rule is written and unexercised. Second, none of §2.1 has
a gate: "the reviewer read the framing", "no secret was pasted verbatim" and "the
standalone review refused to converge without a framing" are all properties of a
session, and no `make` target sees any of them. They are fixtures R4, R5 and R6, and
all three passed on 2026-08-06 — which is evidence about three sessions, not a gate.

**Practical impact.** On a long-lived project the framing may become the document
people skip, which is the failure it exists to prevent, only slower. A reviewer can
still skip it with nothing noticing — the protection is that the skill tells it to
return `UNKNOWN` on completeness and forbids convergence on that round. The secret
rule has the sharpest consequence of the three: it is the only §2.1 rule whose
violation is irreversible, because a credential written verbatim and pushed is
compromised no matter what the next commit removes.

**Next step.** Use it on two or three features and see whether the index split is
needed before building tooling for it. If a mechanical gate for
secrets is ever wanted, it is `gitleaks` (or an equivalent maintained scanner) in
CI — not a regex over Markdown written here, which the contract forbids and which
would be exactly the kind of home-grown checker lens 8 exists to reject.

### The Claude catalog depends on an SDK these skills cannot install

**Why.** The Claude CLI has no listing subcommand — `claude models` is forwarded
to the interactive CLI and would start an agent turn on the prompt "models". The
authoritative surface is `@anthropic-ai/claude-agent-sdk`'s
`query(...).supportedModels()`, answered from the control-protocol handshake. But
these skills install by directory copy through apm or `npx skills`, with no
`npm install` step, so the SDK cannot be a hard dependency. It is resolved at
runtime — from this module, then the current project, then the global npm root —
and its absence is reported.

Codex and OpenCode need no SDK: `codex debug models` and `opencode models` are
real listings, and both are used.

**Practical impact.** Where the SDK does not resolve, `--catalog` reports the gap
for the Claude route and `--check-upgrades` sees only what the last 31 days of
sessions contain, so a newer generation the user has not run yet is not proposed.
Separately, the SDK returns aliases (`opus`, `sonnet`, `haiku`, `opus[1m]`)
rather than versioned ids, and an alias carries no generation to compare — so on
the Claude route the upgrade check is driven by session history even when the SDK
is present.

**Next step.** Either bundle the SDK (the `brain-council` skill does exactly this
with esbuild, at the cost of a ~100k-line committed artefact and a real build
step), or wait for a listing subcommand on the CLI. Bundling is not obviously
worth it for one route's catalog; revisit if a second helper needs an SDK too.
An authenticated API catalog is not a substitute — it needs credentials and a
network, and a settings editor should need neither.

### The Claude catalog probe drives an SDK handshake in a way the SDK does not document

**Why.** `query(...).supportedModels()` answers from the control-protocol
handshake, so the prompt must exist without ever producing a turn. The helper
passes an async generator that awaits a promise which never settles, then yields
— deliberately unreachable code — and races the call against a 20 s timeout,
interrupting and closing the query in a `finally`. It works on the SDK version
tested here, and it was confirmed empirically that no turn is sent. It is still a
shape the SDK's own documentation does not describe.

**Practical impact.** An SDK release that requires the first prompt value before
completing the handshake would turn this from "answers in under a second" into
"times out after 20 s" — once per `--catalog` on the Claude route, and, since
`--set` now verifies against the catalog, once per attempt to save a Claude role
too. So the blast radius includes a settings write that appears to hang for 20 s
in the middle of preflight, not only a slow listing. It still fails to a reported
gap rather than to a wrong answer or a spent turn, and `--force` skips the probe
entirely.

**Next step.** If it starts timing out, prefer any listing surface the CLI grows
over making the handshake trick cleverer. A second workaround layered on the first
is how a settings editor becomes a client library.

### The installed layout depends on how apm resolves a repository

**Why.** The built tree is at `skills/` and the authored one at `src/skills/`
because that is what apm 0.27.0 and `npx skills` discover. Discovery rules are
theirs, not ours: a future version that also scanned `src/`, or that wanted a
manifest inside the bundle directory, would break the install without changing a
byte here.

**Practical impact.** `tests/install.test.mjs` runs a real `apm install` and
asserts the deployed file list, so a regression is caught by the gate rather than
by a user with half a skill — but only where `apm` is installed, and only for the
local-path install. `npx skills` (I3/I4) and the remote install (I5) are still
unproven here.

**Next step.** Run I3–I5 once the repository is pushed. If a manager changes its
discovery, the fix belongs in the layout and in
`docs/architecture/distribution.md`, not in a per-manager special case.

### `mo-setup` has no worked example of the contract it writes

**Why.** The Python and TypeScript profiles name tools, configs and thresholds,
but the previous generation's `templates/` tree was deleted with its custom
checkers, and a template that ships opinions nobody owns is what got deleted.

**Practical impact.** The first project set up by `mo-setup` will have its
`AGENTS.md` and gate wiring authored from the profile references rather than
copied, so it takes longer and the result varies between projects.

**Next step.** After `mo-setup` has been run against two real projects, see
whether the overlap is worth extracting. Not before — a template written from
zero uses is a guess.

### Some defensive posture checks are intentionally equivalent under black-box mutation

**Why.** `mo-posture.sh` validates name/kind/path consistency once inside each
child probe and again in the parent before accepting a record. Removing only the
child copy can be an equivalent mutant: the parent still returns status 2 for the
same forged record. Likewise, removing one reap/verification operation can be
masked by the remaining process-group termination checks. The deterministic test
therefore calls its 22-mutant campaign selected, not exhaustive, and does not
inflate its count with mutants whose observable contract is unchanged.

**Practical impact.** The shipped behavior is still covered end to end, including
both exported-function naming schemes, option-export detection, failed or empty
`env -0`, absolute paths, status precedence, normal-exit group quiescence, the
launch window, repeated signal delivery and a TERM-resistant descendant. A
future reviewer cannot infer that every duplicated internal guard has an
independently killable black-box mutant merely from the zero-survivor summary.

**Next step.** If either validation layer becomes independently observable,
split its fixture and add layer-specific mutations. Otherwise keep equivalent
survivors named here instead of weakening the second validation just to improve a
mutation score.

### A profile can deliberately escape the managed process group

**Why.** The diagnostic owns one process group per measured shell and terminates
ordinary foreground and background descendants in that group. A profile that
explicitly creates a new session or process group can escape that portable
boundary; discovering and killing arbitrary descendants would require an
OS-specific process supervisor or process-table traversal.

**Practical impact.** A hostile or unusually daemonizing profile can retain a
process after the runner exits, although it cannot keep the deleted private
capture path visible by name. Ordinary background commands, including a
TERM-resistant descendant, are covered by the direct-runner signal regression.

**Next step.** Treat a profile known to daemonize during startup as an unsupported
surface and diagnose it locally. Add an OS-specific supervisor only if a real
backend launch needs one; do not grow this read-only helper speculatively.

## Resolved

### The watchdog helper decision — closed, no helper needed

Fixture W1 passed on 2026-08-06: a session ran a bounded native wait (`sleep 25`) and
then produced another reasoning turn in the same session, 35 s wall clock. So
`mo-watchdog` stays skill-only and the minimal `.mjs` helper is not admitted. If a
provider ever loses that behaviour, this decision is the thing to revisit.

Nothing yet.
