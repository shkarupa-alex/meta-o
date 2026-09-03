/**
 * Bind every closure obligation to one named, executable assertion.
 *
 * The temporary closure map used to close 514 of its 736 rows with a proof
 * command that never touched them. In a skills-first project the instruction
 * text is the implementation, so an obligation-level proof is an assertion that
 * fails when that specific rule leaves the shipped bundle — one named test per
 * obligation, addressable as `--test-name-pattern "^<id> "`.
 *
 * Protects §A-MEMORY-03.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

const DOCS = {
  mech: read("shared", "references", "orca-mechanics.md"),
  bcon: read("shared", "references", "backend-contract.md"),
  life: read("shared", "references", "methodology.md"),
  rev: read("shared", "references", "review-protocol.md"),
  wdog: read("shared", "references", "watchdog.md"),
  proj: read("shared", "references", "project-setup.md"),
  purp: read("shared", "references", "purpose-and-architecture.md"),
  e2e: read("docs", "e2e.md"),
  caps: read("docs", "backend-capabilities.md"),
  acc: read("docs", "acceptance.md"),
  biz: read("docs", "business.md"),
  glos: read("docs", "glossary.md"),
  wclass: read("docs", "architecture", "watchdog-local-classifier.md"),
  wdedup: read("docs", "architecture", "watchdog-nudge-deduplication.md"),
  ident: read("docs", "architecture", "knowledge-identifiers.md"),
  evalp: read("docs", "architecture", "evaluation-model-policy.md"),
  ensem: read("docs", "architecture", "review-ensemble-boundary.md"),
  reuse: read("docs", "architecture", "reuse-evidence.md"),
  jsgate: read("docs", "architecture", "javascript-quality-gate.md"),
  settled: read("docs", "architecture", "settled-final-response.md"),
  first: read("docs", "architecture", "skills-first.md"),
  frskill: read("src", "skills", "find-reuse", "SKILL.md"),
  orcskill: read("src", "skills", "mo-orchestrate-orca", "SKILL.md"),
  revskill: read("src", "skills", "mo-review-orca", "SKILL.md"),
};

const OBLIGATIONS = [
  // docs/backlog.md
  [
    "O-BL-01",
    "a local watchdog classifier stays a bounded rejected experiment",
    {
      wclass: [/эксперимент|experiment/iu],
      wdog: [/optional local classifier is a bounded credential-free experiment/],
    },
  ],
  [
    "O-BL-02",
    "symbol-level purpose reaches every exported declaration and names the shell boundary",
    {
      ident: [/exported function\/class declarations несут JSDoc/, /machine-checked module header/],
      jsgate: [/jsdoc/i],
    },
  ],
  [
    "O-BL-03",
    "generated skills contain no source-only architecture anchor",
    {
      ident: [/mo:source-anchor/],
    },
  ],
  [
    "O-BL-04",
    "id deletion and reuse are caught across the whole commit graph",
    {
      ident: [/Knowledge-ID-Change/, /semantic_enforcement_sha/, /ссылки от\s+cutoff/u],
    },
  ],
  [
    "O-BL-05",
    "a real review run has a pair barrier, hot remediation and a fresh final pair",
    {
      life: [/keep both remediation reviewer sessions hot/, /two fresh independent reviewers/],
      e2e: [/B19/],
    },
  ],
  [
    "O-BL-06",
    "review is evidence-first with defined modes and textual severity",
    {
      rev: [
        /Candidate verification/,
        /`fast` is for bounded low-risk work/,
        /P0` — a reachable emergency/,
      ],
    },
  ],
  [
    "O-BL-07",
    "an ensemble of reviewers stays deferred behind a registered differential eval",
    {
      ensem: [/differential/iu],
    },
  ],
  [
    "O-BL-08",
    "production comments cite durable contracts, never review finding ids",
    {
      rev: [/never finding ids/],
    },
  ],
  [
    "O-BL-09",
    "an advisory self-review is bounded and escalates in place",
    {
      rev: [/Escalate `fast` or\s+`follow_up` to effective `deep`/],
      life: [/`fast` is advisory or explicitly standalone/],
    },
  ],
  [
    "O-BL-10",
    "the review skill runs only on an explicit request",
    {
      revskill: [/description:.*review/is],
    },
  ],
  [
    "O-BL-11",
    "owned roles use stable titles and foreign tabs survive",
    {
      mech: [/Stable titles are/, /Never close unnamed human tabs/],
    },
  ],
  [
    "O-BL-12",
    "the authoritative report is the complete worker_done, and the TUI is a projection",
    {
      settled: [
        /полное orchestration message `worker_done`/u,
        /bounded\s+preview не доказывают полный final response/u,
      ],
      mech: [/complete `worker_done` body is the settled final response/],
    },
  ],
  [
    "O-BL-13",
    "a capacity message is a distinct typed outcome with its own recovery",
    {
      wdog: [/Selected model is at capacity/],
      bcon: [/capacity \| reconnecting/],
    },
  ],
  [
    "O-BL-14",
    "the raw real-runs ledger closes through a lossless map, not a summary",
    {
      ident: [/§A-MEMORY-03/, /closure map/i],
      acc: [/Frozen blob/],
    },
  ],

  // Unheaded observations
  [
    "O-RR-001",
    "native syntax comes from the documented public surface and a version is diagnostic",
    {
      mech: [/public `orca \.\.\. --help` surface/],
      bcon: [/Versions are diagnostic only/],
    },
  ],
  [
    "O-RR-002",
    "large state is read in bounded calls and truncation is never complete input",
    {
      mech: [
        /focused, bounded probes rather than one large agent-context dump/,
        /cap it at 8000 tokens/,
      ],
      bcon: [/make the result `unknown`/],
    },
  ],
  [
    "O-RR-003",
    "the lifecycle starts only in a clean feature branch based on current develop",
    {
      life: [/clean `feature\/<short-slug>` task branch based on an up-to-date/],
    },
  ],
  [
    "O-RR-004",
    "an auth gap in one discovery surface authorizes no credential collection or connector switch",
    {
      life: [/Ask the user about product meaning, credentials/],
      bcon: [/A projection older than a successful native\s+auth is stale/],
    },
  ],
  [
    "O-RR-005",
    "the executor owns spec materialization and the first tracked commit",
    {
      life: [/The executor owns and commits these files/, /never edits product\/spec commits/],
    },
  ],
  [
    "O-RR-006",
    "a receipt is not an effect and an ambiguous effect stays unknown",
    {
      bcon: [/A receipt is not an effect/, /`unknown_effect` is never retried automatically/],
    },
  ],
  [
    "O-RR-007",
    "blank native worktree metadata is replaced by exact Git identity verification",
    {
      mech: [/`orca status --json` belongs to the intended instance\/worktree/],
      life: [/use Git metadata needed to validate a branch and full SHA/],
    },
  ],
  [
    "O-RR-008",
    "readiness keeps auth, account projection and a real launch separate",
    {
      bcon: [/Readiness keeps three observations separate/],
      mech: [/classify freshness/],
    },
  ],
  [
    "O-RR-009",
    "provider auth is probed through the current CLI surface, not wrapper help",
    {
      proj: [/posture/i],
      mech: [/documented provider-native auth status command/],
    },
  ],
  [
    "O-RR-010",
    "role, harness, model and effort come from prior user-approved configuration",
    {
      life: [
        /An unset, invalid or unavailable selection is a typed readiness\s+failure/,
        /Agree the roles with\s+the user/,
      ],
    },
  ],
  [
    "O-RR-011",
    "fresh native auth over a stale projection still needs one exact approved launch",
    {
      mech: [/A verified launch yields readiness with `stale_account_cache`/],
    },
  ],
  [
    "O-RR-012",
    "an exact model id and a matching effective launch replace a floating alias",
    {
      life: [/floating family alias/, /launch\.requested == launch\.effective/],
      mech: [/`launch\.requested == launch\.effective` for model and effort/],
    },
  ],
  [
    "O-RR-013",
    "ready and input_accepted are transport receipts, not delivery",
    {
      mech: [/only a transport\s+receipt/, /failed composed start/],
      bcon: [/`sent\|queued\|delivered` never proves\s+consumption/],
    },
  ],
  [
    "O-RR-014",
    "a bare shell cannot settle work with a fabricated completion",
    {
      mech: [/`worker_done` from a bare shell or expired Dispatch cannot\s+settle work/],
    },
  ],
  [
    "O-RR-015",
    "health probes stay bounded and never obscure one executor and two reviewers",
    {
      mech: [
        /disposable health Dispatch is allowed only before a real role can safely run,\s*\n?one harness at a time/,
      ],
      life: [/Start both reviewer sessions concurrently/],
    },
  ],
  [
    "O-RR-016",
    "stopping a worker is not releasing it, and cleanup confirms the exact inventory",
    {
      mech: [
        /never substitute a broad terminal close/,
        /Release a settled supervised worker only with/,
      ],
      life: [/Clean up only sessions and temporary files whose ownership is certain/],
    },
  ],
  [
    "O-RR-017",
    "a blocking wait is recoverable through public state rather than a lost client",
    {
      mech: [/A timeout is a\s+checkpoint, not failure/, /next blocking wait is armed/],
    },
  ],
  [
    "O-RR-018",
    "the bundled model helper is a named preflight dependency of the entry skill",
    {
      orcskill: [/mo-models\.mjs/],
      life: [/`mo-models\.mjs --show --project <root>`/],
    },
  ],
  [
    "O-RR-019",
    "the orchestrator edits no task, ledger, business or delivery artifact",
    {
      life: [/It does not inspect, judge\s+or edit product code/],
      first: [/orchestrat/i],
    },
  ],
  [
    "O-RR-020",
    "the first actually running executor gets the initial goal prefix",
    {
      life: [
        /Prefix only the initial executor task with `\/goal`/,
        /Do not detect or emulate `\/goal`/,
      ],
    },
  ],

  // Named real-run incident families
  [
    "O-RR-021",
    "ordinary and harness-UI questions both stay answerable public surfaces",
    {
      bcon: [/expose agent and harness-UI questions and accept an answer/],
      life: [/ordinary public question and permission surfaces/],
      e2e: [/B6/],
    },
  ],
  [
    "O-RR-022",
    "an early event wakes the wait and a timeout is one checkpoint",
    {
      mech: [/An early message must wake the wait/],
      life: [/Re-read state at a sane interval measured in minutes/],
      e2e: [/B16/],
    },
  ],
  [
    "O-RR-023",
    "an injected task cannot overwrite the orchestrator's own role",
    {
      life: [/The orchestrator\s+must not enter the code to help or fix it/],
      mech: [/A direct user message contaminates the prior isolated role/],
    },
  ],
  [
    "O-RR-024",
    "contaminated isolation is repaired by an exact replacement, not by broadening authority",
    {
      mech: [/preserve the decision and create an exact replacement when isolation is needed/],
    },
  ],
  [
    "O-RR-025",
    "the executor stays a hot assigned role through remediation",
    {
      life: [/keep both remediation reviewer sessions hot/],
      mech: [/Keep the executor and remediation reviewers in their exact owned terminals/],
    },
  ],
  [
    "O-RR-026",
    "stopping the review loop is not completing the specification",
    {
      life: [
        /This local budget never replaces two final same-SHA passes/,
        /## 7\. Completion and cleanup/,
      ],
    },
  ],
  [
    "O-RR-027",
    "a failed start cleans up its exact session and adds no duplicate posture flag",
    {
      mech: [
        /do not duplicate a posture flag that\s+the resolved wrapper already supplies/,
        /Stop only that exact dispatch/,
        /Never switch model or harness/,
      ],
    },
  ],
  [
    "O-RR-028",
    "a ready completion wakes the coordinator without a user ping",
    {
      mech: [/orca orchestration check --wait/],
      e2e: [/B16/],
    },
  ],
  [
    "O-RR-029",
    "quota is a typed outcome with its own bounded recovery",
    {
      bcon: [/quota \| capacity/],
      wdog: [/quota\/limit \(including an available\s+reset time\)/],
    },
  ],
  [
    "O-RR-030",
    "a delivery batch is processed before it is acknowledged, and only once",
    {
      mech: [/Process a complete delivery batch before acknowledging it/],
      bcon: [/Acknowledgement follows processing of the complete delivery batch/],
    },
  ],
  [
    "O-RR-031",
    "the per-slice attempt budget does not reset and does not replace settlement",
    {
      life: [/at most five paired review\/fix attempts; a remediation SHA\s+does not reset it/],
    },
  ],
  [
    "O-RR-032",
    "compaction is observable and forces a re-ground from durable state",
    {
      mech: [/After compaction or approximately 75% of a\s+32768-token context/],
      bcon: [/compacted \| refused/],
    },
  ],
  [
    "O-RR-033",
    "the TUI final is a diagnostic projection of the authoritative report",
    {
      settled: [/Whole-session view остаётся для редкой диагностики/u],
      bcon: [
        /Whole-session\s+output is diagnostic and cannot replace a missing complete final response/,
      ],
    },
  ],
  [
    "O-RR-034",
    "an injected terminal is retained and closed by its own exact handle",
    {
      mech: [/A low-level injected terminal is not a supervised worker resource/],
      wdog: [/`term_` handle is the authorized nudge target/],
    },
  ],
  [
    "O-RR-035",
    "a refusal after work is a distinct state from a blocked input",
    {
      bcon: [/`output_blocked_after_work` must not\s+repeat product work/],
      rev: [/truncated\/unreadable output or\s+missing required context is `UNKNOWN`/],
    },
  ],
  [
    "O-RR-036",
    "a repeated retention failure keeps each affected role as separate evidence",
    {
      mech: [
        /A failed or uncertain worker follows the exact recovery action in its\s+public receipt/,
      ],
    },
  ],
  [
    "O-RR-037",
    "durable mailbox delivery is distinct from coordinator wakeup and cadence",
    {
      mech: [
        /Wait on public messages rather than terminal polling/,
        /An early message must wake the wait/,
      ],
      bcon: [/It exposes transport,\s+delivery, work and outcome independently/],
    },
  ],
  [
    "O-RR-038",
    "the settled response is delivered complete and byte-safe",
    {
      mech: [/require the worker to place its full final response in that\s+message/],
      life: [/Do not merge, rank, hash, encode, split, truncate or\s+summarize their responses/],
      e2e: [/B9/],
    },
  ],
  [
    "O-RR-039",
    "endless reconnecting is a typed state with bounded same-task recovery",
    {
      bcon: [/reconnecting \| compacted/],
      wdog: [/endless reconnecting/],
    },
  ],
  [
    "O-RR-040",
    "an unclear native command is probed against its documented help surface",
    {
      mech: [/public `orca \.\.\. --help` surface/],
      caps: [/Версии диагностичны/u],
    },
  ],
  [
    "O-RR-041",
    "work packages, reviewable slices and external gates stay separate outcomes",
    {
      life: [
        /A\s+substantive slice has at most five paired review\/fix attempts/,
        /Any executable or instruction change creates a new SHA and invalidates all\s+gates/,
      ],
    },
  ],
  [
    "O-RR-042",
    "a subscription limit is read from the public surface, not inferred from a screen",
    {
      bcon: [/Bounded previews, private provider transcripts/],
      wdog: [/Classification uses scalar values rather\s+than key names/],
    },
  ],
  [
    "O-RR-043",
    "an ordinary follow-up uses the documented message surface only",
    {
      mech: [/Use\s+`orchestration send --to dispatch:<id>` for ordinary follow-ups/],
    },
  ],
  [
    "O-RR-044",
    "a follow-up receipt without consumption is not delivery",
    {
      bcon: [/`sent\|queued\|delivered` never proves\s+consumption/],
      mech: [/verify through the public worker\s+and terminal surfaces/],
    },
  ],
  [
    "O-RR-045",
    "a candidate SHA is copied and verified, never reconstructed",
    {
      life: [
        /validate the branch, clean worktree, commit object\s+and full `HEAD`, then freeze that SHA/,
      ],
      rev: [/exact 40-hex candidate SHA/],
    },
  ],
  [
    "O-RR-046",
    "a reviewer never backgrounds or overlaps the full quality gate",
    {
      life: [/Reviewer diagnostics are non-mutating/],
      rev: [/Never edit the candidate or run a\s+mutating formatter\/fixer in its worktree/],
    },
  ],
  [
    "O-RR-047",
    "output filtering after completed work becomes a typed lifecycle state",
    {
      bcon: [/output_blocked_after_work/],
    },
  ],
  [
    "O-RR-048",
    "the deterministic gate leaves no descendant process behind",
    {
      jsgate: [/process|gate/i],
      life: [/without modifying\s+the worktree/],
    },
  ],
  [
    "O-RR-049",
    "a bounded structured fallback replaces an assumed safe-summary retry",
    {
      mech: [/Sanitize each structured\s+observation and cap it at 8000 tokens/],
      bcon: [/Malformed identity or fields are `unknown`/],
    },
  ],
  [
    "O-RR-050",
    "an unsupported message type yields an actionable native diagnostic",
    {
      bcon: [/Malformed identity or fields are `unknown`/],
      mech: [/Use the exact returned run, task, dispatch and terminal identities/],
    },
  ],
  [
    "O-RR-051",
    "the executor leaves no untracked background terminal after the final gate",
    {
      life: [/Release only owned hot reviewer\s+resources/, /a clean worktree/],
      mech: [/close\s+only its exact returned handle after its Dispatch settles/],
    },
  ],
  [
    "O-RR-052",
    "two reviewers cannot run the host-sensitive full gate concurrently",
    {
      life: [/Run the project's deterministic QC on the frozen candidate without modifying/],
      acc: [/QC/],
    },
  ],
  [
    "O-RR-053",
    "a destructive restore confirms exact effect ordering before mutation",
    {
      bcon: [/Effectful native operations expose a stable operation\/target id/],
      life: [
        /Production, destructive, credential\s+or subscription boundaries require the user's explicit authorization/,
      ],
    },
  ],
  [
    "O-RR-054",
    "discovery origin and the pinned inventory must agree before an external call",
    {
      reuse: [/adapter/i],
      frskill: [/Reject an absent or unknown contract before\s+searching/],
    },
  ],
  [
    "O-RR-055",
    "a long-poll failure over a live runtime recovers without restarting workers",
    {
      mech: [/A timeout is a\s+checkpoint, not failure/],
      bcon: [/process: running \| stopped \| lost \| unknown/],
    },
  ],
  [
    "O-RR-056",
    "an infra-blocked mandatory phase cannot report whole-task success",
    {
      life: [
        /An unreadable or incomplete gate is `unknown` and is\s+repeated; there is no partial pass/,
        /no unresolved problems hidden by an incomplete backend response/,
      ],
    },
  ],
  [
    "O-RR-057",
    "a diagnostic command accounts for its side effects before it runs",
    {
      life: [
        /any diagnostic capable of\s+rewriting tracked files runs only in an isolated disposable copy/,
      ],
    },
  ],
  [
    "O-RR-058",
    "a known wrapper posture failure is applied instead of rediscovered",
    {
      mech: [/Respect launch wrappers/],
      proj: [/wrapper|posture/i],
    },
  ],
  [
    "O-RR-059",
    "a composed start is validated against the real harness process",
    {
      mech: [
        /An untouched harness prompt, a shell prompt, or task text\s+executed by the shell is a failed composed start/,
      ],
      bcon: [
        /bind the expected instance, Run, task,\s+Dispatch and optional terminal to one harness process/,
      ],
    },
  ],
  [
    "O-RR-060",
    "an expired capability separates accepted content from rejected settlement",
    {
      mech: [
        /Public capability belongs to the exact Dispatch\/turn\/process and expires on\s+exit or replacement/,
      ],
    },
  ],
  [
    "O-RR-061",
    "destructive cleanup is limited to an exact owned allowlist",
    {
      mech: [
        /Never close unnamed human tabs, neighboring Run resources or\s+another project container/,
      ],
      life: [
        /cleanup\s+is best effort and failure is reported rather than broadened destructively/,
      ],
    },
  ],
  [
    "O-RR-062",
    "the authority envelope is exact enough to permit the required live work",
    {
      life: [/require the user's explicit authorization for the\s+exact named action/],
      biz: [/действительно неразрешимого спора/u],
    },
  ],
  [
    "O-RR-063",
    "a durable product decision is harvested before the work is called done",
    {
      life: [
        /record its settled\s+meaning in the project's business framing/,
        /harvests durable knowledge/,
      ],
    },
  ],
  [
    "O-RR-064",
    "the hot reviewer pair survives until both passes are settled",
    {
      life: [
        /Release old reviewers only before the fresh final pair|keep both remediation reviewer sessions hot/,
      ],
      mech: [/Release old reviewers only before the fresh final pair/],
    },
  ],
  [
    "O-RR-065",
    "an injected prompt requires a verified idle harness input first",
    {
      mech: [/orca terminal wait --terminal <handle> --for tui-idle/],
    },
  ],
  [
    "O-RR-066",
    "liveness is judged from native activity, never from a promised heartbeat",
    {
      life: [
        /Do not wait on a derived sign such as a new SHA appearing or\s+a pane counter advancing/,
      ],
      wdog: [/`lastOutputAt`/],
    },
  ],
  [
    "O-RR-067",
    "an observer seeds the current typed state before reporting a change",
    {
      wdog: [/Seed the current typed state before reporting a change/],
    },
  ],
  [
    "O-RR-068",
    "a cursor or preview is not direct evidence of a working agent",
    {
      wdog: [
        /connection is never promoted to agent\s+`working`, and raw preview text never overrides those process tokens/,
      ],
    },
  ],
  [
    "O-RR-069",
    "a quota reset unavailable on the public surface stays unknown",
    {
      bcon: [/private provider transcripts, provider hooks, inferred session\s+databases/],
      mech: [/Do not use `worker-read --source transcript`/],
    },
  ],
  [
    "O-RR-070",
    "an account-level surface is preferred but insufficient without a Dispatch binding",
    {
      bcon: [
        /A projection older than a successful native\s+auth is stale, not proof of missing credentials/,
      ],
      mech: [/use the first real role Dispatch as the live launch probe when possible/],
    },
  ],
  [
    "O-RR-071",
    "a lost coordinator pane is taken over through authorized public run state",
    {
      mech: [/retain exact run\/task\/dispatch\/terminal locators in current reasoning/],
      e2e: [/B21|takeover/i],
    },
  ],
  [
    "O-RR-072",
    "a replacement reviewer preserves the accepted result and removes the superseded tab",
    {
      mech: [/Release old reviewers only before the fresh final pair/, /Stable titles are/],
    },
  ],
];

for (const [id, summary, requires] of OBLIGATIONS) {
  test(`${id} ${summary}`, () => {
    const checks = Object.entries(requires);
    assert.ok(checks.length > 0, `${id} has no proof`);
    for (const [key, patterns] of checks) {
      const source = DOCS[key];
      assert.ok(source, `${id}: unknown document ${key}`);
      for (const pattern of patterns) assert.match(source, pattern, `${id}: ${key} ${pattern}`);
    }
  });
}

test("every obligation id is unique and addressable by its own name pattern", () => {
  const ids = OBLIGATIONS.map(([id]) => id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^O-(?:BL|RR)-\d{2,3}$/u);
});
