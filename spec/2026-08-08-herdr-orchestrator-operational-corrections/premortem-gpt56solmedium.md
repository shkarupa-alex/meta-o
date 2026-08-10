1. **Review gates remained permanently `UNKNOWN`**

   - **What happened:** Reviewers completed their work visibly, but Meta-O repeatedly failed to retrieve a provably complete response. It requested shorter re-evaluations until the workflow ended in `needs_attention`, making the Herdr route unreliable for ordinary features.
   - **Why:** The design makes transport completeness a hard gate while explicitly acknowledging that Herdr lacks logical-turn retrieval, truncation signals, stable pagination, and reliable alternate-screen capture. Limiting reviewers to 180 rows reduces risk but cannot prove that repainting or hidden history did not omit content.
   - **Prevention:** Make verified logical-turn retrieval a prerequisite for supporting each provider TUI. Until Herdr supplies it, define and test a supported provider output mode that remains interactive and visible but produces retrievable terminal output. Do not claim the route operational based only on compact-output conventions.

2. **A stale Herdr actor was adopted as the current executor or reviewer**

   - **What happened:** After interruption or restart, the orchestrator found an actor with the expected stable name and resumed it, but that pane belonged to an earlier run or different task. Findings or implementation prompts went to the wrong warm session.
   - **Why:** Recovery relies on stable actor names, Herdr identity, and Git while forbidding any run record. Short names derived from `<slug>` are not globally unique, and Git state cannot establish which interactive session owns the current task.
   - **Prevention:** Define an explicit recoverable identity comprising repository root, task path, branch, and Herdr session/pane IDs. If Herdr cannot store and query that association, justify a minimal project-external run binding whose named consumer is crash recovery. Never adopt an actor based on its display name alone.

3. **“Verified” candidates were based on unverified actor claims**

   - **What happened:** An executor reported `QC: passed` or an applicable E2E result incorrectly or from an earlier commit. The orchestrator accepted the handoff because the worktree was clean and the declared commit matched `HEAD`, so the final SHA was presented as verified without valid evidence.
   - **Why:** The role firewall forbids the orchestrator from reading logs or assessing checks, while handoffs are informal human-readable conventions rather than machine-bound evidence. Matching `HEAD` proves the candidate identity, not that a named command ran successfully against it.
   - **Prevention:** Separate technical judgement from mechanical gate verification. Run deterministic gates in visible command panes and let the orchestrator consume only command, exit status, and observed before/after Git object IDs. Delegate agentic E2E assessment to a visible actor that reports against the exact SHA. The orchestrator still need not read code or interpret logs.

4. **The workflow stalled for long periods despite visible completion**

   - **What happened:** Actors visibly finished shortly after a 10-minute wait began, but the orchestrator did not react until timeout. With two reviewers and repeated rounds, accumulated latency made runs appear hung for tens of minutes.
   - **Why:** The baseline permits one waiter per actor and fixed 10-minute waits, while the proposed upstream multi-actor wait does not yet exist. Polling direct state only after timeout cannot provide prompt completion detection, especially for simultaneous reviewers.
   - **Prevention:** Specify the currently available `pane_agent_status_changed` operation precisely and use bounded single-actor waits concurrently where supported. Otherwise use shorter adaptive waits with direct-state rechecks, such as one minute initially and progressively longer intervals while confirmed working. Treat the 5–10 minute values as inactivity thresholds, not the minimum reaction time.

5. **Model discovery broke when the provider CLI and bundled SDK diverged**

   - **What happened:** After provider updates, the pinned bundled Claude SDK either rejected the installed system CLI, returned a stale catalogue, or failed authentication discovery. Meta-O silently fell back to defaults and could no longer guarantee the required cross-vendor reviewer arrangement.
   - **Why:** The design couples a pinned SDK bundle to a separately updated subscription CLI but specifies only build isolation and a manual authenticated fixture. It does not define compatibility policy, catalogue freshness, upgrade triggers, or how an installed skill reports SDK/CLI mismatch.
   - **Prevention:** Record and test a supported SDK/CLI compatibility matrix, expose catalogue source and mismatch diagnostics, and make authenticated catalogue validation a release gate for supported environments. If catalogue validation fails, distinguish “saved model unavailable” from “catalogue unknown”; the latter must not be treated as permission to select an unverified default.