/**
 * §M-CAPABILITY-SUITE — Repeatable proof that a backend still does what it claims.
 *
 * Implements §A-BACKEND-CONTRACT. A one-off spike proves nothing six months
 * later: backends change, agent CLIs change, and a capability that quietly
 * regressed turns the workflow into a process that hangs instead of one that
 * fails. The suite is therefore executable and re-runnable — after install,
 * after a backend upgrade, as a short smoke at preflight, and on demand.
 *
 * Checks report `supported | degraded | unsupported` with evidence. A check
 * that cannot be performed is `degraded` with the reason, never a silent pass.
 */

import { randomUUID } from "node:crypto";
import { type Clock, systemClock } from "../core/clock.mjs";
import { COMPLETION_CRITICAL } from "./adapter.mjs";
import type {
  CapabilityGrade,
  ModelRef,
  Role,
  SessionAdapter,
  SessionRef,
} from "../core/types.mjs";

/** §M-CAPABILITY-SUITE — Outcome of one named check. */
export interface SuiteCheck {
  id: string;
  grade: CapabilityGrade;
  detail: string;
  durationMs: number;
  completionCritical: boolean;
}

/** §M-CAPABILITY-SUITE — Aggregate outcome of a suite run. */
export interface SuiteReport {
  mode: "smoke" | "full";
  backend: string;
  checks: SuiteCheck[];
  blocked: boolean;
  blockingReasons: string[];
}

/** §M-CAPABILITY-SUITE — Everything a suite run needs from its environment. */
export interface SuiteContext {
  adapter: SessionAdapter;
  backend: string;
  cwd: string;
  model: ModelRef;
  clock?: Clock;
  /** Extra routes to prove the backend can host, e.g. codex and opencode. */
  additionalModels?: ModelRef[];
  /** Probe prompt that must produce observable output without side effects. */
  probePrompt?: string;
}

/** §M-CAPABILITY-SUITE — What a check body concluded, before it is timed and labelled. */
interface CheckOutcome {
  grade: CapabilityGrade;
  detail: string;
}

/** §M-CAPABILITY-SUITE — Run one check, converting a throw into an `unsupported` grade. */
async function runCheck(
  id: string,
  completionCritical: boolean,
  clock: Clock,
  body: () => Promise<CheckOutcome>,
): Promise<SuiteCheck> {
  const started = clock.now();
  try {
    const { grade, detail } = await body();
    return { id, grade, detail, durationMs: clock.now() - started, completionCritical };
  } catch (error) {
    return {
      id,
      grade: "unsupported",
      detail: (error as Error).message,
      durationMs: clock.now() - started,
      completionCritical,
    };
  }
}

/** §M-CAPABILITY-SUITE — Prefix marking a check that is the backend's own word, not a probe. */
export const REPORTED_PREFIX = "reported:";

/**
 * §M-CAPABILITY-SUITE — Grade each capability the backend claims, under a shared id.
 *
 * Emitted by both suites, and that is the whole point: the full suite's
 * behavioural ids and the smoke suite's single summary check used to be disjoint
 * sets, so comparing a smoke report against a full baseline found nothing in
 * common and therefore never found a regression either. These ids exist in both
 * reports, so the comparison has something to compare.
 */
async function reportedChecks(context: SuiteContext, clock: Clock): Promise<SuiteCheck[]> {
  const report = await context.adapter.capabilityReport();
  const critical = new Set<string>(COMPLETION_CRITICAL as string[]);
  return Object.entries(report.matrix).map(([key, value]) => ({
    id: `${REPORTED_PREFIX}${key}`,
    grade: value.grade,
    detail: value.detail,
    durationMs: 0,
    completionCritical: critical.has(key) && value.grade === "unsupported",
  }));
}

/**
 * §M-CAPABILITY-SUITE — Judge the one stop the smoke probe performs.
 *
 * Only `stopped` counts. This session was created seconds ago and observed
 * alive, so neither `unknown` nor `already_terminal` can mean "it was probably
 * gone anyway" — and `already_terminal` is returned *without* the backend being
 * asked to close the pane, which is how a probe that graded `supported` still
 * leaked the agent it had opened.
 *
 * The session is named on failure because it is now unreachable: the probe
 * belongs to no run, so no `run cleanup` or `session stop` will ever find it. A
 * backend that cannot close panes leaks one per preflight, and the only thing
 * left to do is say which one to close by hand.
 */
function gradeProbeStop(probe: SessionRef, outcome: string): CheckOutcome {
  return outcome === "stopped"
    ? { grade: "supported", detail: "stop closed the pane the probe opened" }
    : {
        grade: "unsupported",
        detail:
          `stop reported ${outcome} for a pane it had just opened and observed alive; ` +
          `session ${probe.sessionId} is still running and belongs to no run`,
      };
}

/**
 * §M-CAPABILITY-SUITE — The short smoke §20 puts on every preflight.
 *
 * It spawns one throwaway agent, observes it and stops it. That is three of the
 * backend's verbs — `spawn`, `status`/`read`, `stop` — and they are exactly the
 * completion-critical set: a run that cannot start a worker, cannot see what it
 * did, or cannot end it has no way to finish.
 *
 * It used to spawn nothing and merely re-read the backend's self-report, on the
 * reasoning that probing at every preflight costs panes and money. The report is
 * a constant in the adapter's source, so the comparison against the baseline
 * could only ever fail if that source changed: a backend that had genuinely lost
 * `pane close` still preflighted `ok`. §20 requires a capability regression to
 * stop preflight, and nothing short of using the verb can notice one.
 *
 * No prompt is sent, so the probe costs a pane for a few seconds and zero
 * tokens. Everything a prompt would be needed to prove — acknowledgement,
 * resume, concurrency, routes — is still the full suite's job, and `unexercised`
 * names those rather than letting their silence read as agreement.
 */
export async function runSmokeSuite(context: SuiteContext): Promise<SuiteReport> {
  const clock = context.clock ?? systemClock;
  const { adapter } = context;
  const checks: SuiteCheck[] = [];
  let probeSession: SessionRef | undefined;

  checks.push(
    await runCheck("spawn", true, clock, async () => {
      probeSession = await adapter.spawn({
        operationId: randomUUID(),
        role: "executor",
        model: context.model,
        prompt: "",
        cwd: context.cwd,
      });
      return { grade: "supported", detail: `spawned session ${probeSession.sessionId}` };
    }),
  );

  checks.push(
    await runCheck("status-read", true, clock, async () => {
      if (!probeSession) throw new Error("no session was spawned");
      const status = await adapter.status(probeSession);
      const output = await adapter.read(probeSession);
      return {
        grade: "supported",
        detail: `status=${status}, read ${output.text.length} chars at cursor ${output.cursor}`,
      };
    }),
  );

  // Last, and outside the `finally` a cleanup would use, because stopping the
  // probe *is* one of the checks. A backend that cannot close a pane must be
  // graded on that, not have it swallowed by best-effort teardown.
  checks.push(
    await runCheck("stop", true, clock, async () => {
      if (!probeSession) throw new Error("no session was spawned");
      return gradeProbeStop(probeSession, await adapter.stop(probeSession));
    }),
  );

  checks.push(
    await runCheck("capabilities", true, clock, async () => {
      const capabilities = await adapter.capabilities();
      const missing = (["statusRead", "stop"] as const).filter((key) => !capabilities[key]);
      return missing.length === 0
        ? { grade: "supported", detail: "backend reports every completion-critical capability" }
        : { grade: "unsupported", detail: `missing completion-critical: ${missing.join(", ")}` };
    }),
  );
  try {
    checks.push(...(await reportedChecks(context, clock)));
  } catch (error) {
    checks.push({
      id: "capabilities",
      grade: "unsupported",
      detail: `the backend could not report its capabilities: ${(error as Error).message}`,
      durationMs: 0,
      completionCritical: true,
    });
  }

  return finalize("smoke", context.backend, checks);
}

/**
 * §M-CAPABILITY-SUITE — Baseline checks a report did not re-exercise.
 *
 * The smoke run proves the completion-critical verbs and nothing else; reporting
 * "no capability is worse than the baseline" over the rest is the failure this
 * names. The caller decides what to do with it — preflight prints it, so the
 * answer stops sounding like a verification it was not.
 */
export function unexercised(
  baseline: CapabilityBaseline | undefined,
  report: SuiteReport,
): string[] {
  if (!baseline || baseline.backend !== report.backend) return [];
  const seen = new Set(report.checks.map((check) => check.id));
  return Object.keys(baseline.grades)
    .filter((id) => !seen.has(id))
    .sort();
}

/** §M-CAPABILITY-SUITE — Everything the individual probe groups share. */
interface ProbeContext {
  adapter: SessionAdapter;
  clock: Clock;
  model: ModelRef;
  probePrompt: string;
  spawn: (role: Role, model: ModelRef) => Promise<SessionRef>;
  spawned: SessionRef[];
}

/**
 * §M-CAPABILITY-SUITE — Probe the capabilities a run needs in order to observe.
 *
 * These come first because everything later depends on them: a backend that
 * cannot report status cannot be measured at all, and the remaining checks
 * would report failures of this one under other names.
 */
async function observationChecks(
  probe: ProbeContext,
): Promise<{ checks: SuiteCheck[]; primary?: SessionRef }> {
  const { adapter, clock } = probe;
  const checks: SuiteCheck[] = [];
  let primary: SessionRef | undefined;

  checks.push(
    await runCheck("spawn", true, clock, async () => {
      primary = await probe.spawn("executor", probe.model);
      return { grade: "supported", detail: `spawned session ${primary.sessionId}` };
    }),
  );

  checks.push(
    await runCheck("delivery-acknowledgement", false, clock, async () => {
      if (!primary) throw new Error("no session was spawned");
      const delivery = await adapter.send(primary, randomUUID(), probe.probePrompt);
      if (delivery.status === "acknowledged") {
        return {
          grade: delivery.receipt ? "supported" : "degraded",
          detail: delivery.receipt
            ? "delivery acknowledged with a receipt"
            : "delivery acknowledged without any receipt",
        };
      }
      return { grade: "degraded", detail: `delivery reported ${delivery.status}` };
    }),
  );

  checks.push(
    await runCheck("status-read", true, clock, async () => {
      if (!primary) throw new Error("no session was spawned");
      const status = await adapter.status(primary);
      const output = await adapter.read(primary);
      const observed = output.text.trim().length > 0;
      return {
        grade: observed ? "supported" : "degraded",
        detail: `status=${status}, read ${output.text.length} chars at cursor ${output.cursor}`,
      };
    }),
  );

  checks.push(
    await runCheck("wait", false, clock, async () => {
      if (!primary) throw new Error("no session was spawned");
      const deadlineAt = new Date(clock.now() + 60_000).toISOString();
      const result = await adapter.wait(primary, { terminal: false, deadlineAt });
      return { grade: "supported", detail: `wait settled at status ${result.status}` };
    }),
  );

  checks.push(
    await runCheck("native-resume", false, clock, async () => {
      if (!primary) throw new Error("no session was spawned");
      const resumed = await adapter.resume(primary);
      return {
        grade: resumed.sessionId === primary.sessionId ? "supported" : "degraded",
        detail: `resume returned ${resumed.sessionId}`,
      };
    }),
  );

  checks.push(
    await runCheck("concurrent-completions", false, clock, async () => {
      if (!primary) throw new Error("no session was spawned");
      return concurrentCompletions(probe, primary);
    }),
  );

  return { checks, primary };
}

/**
 * §M-CAPABILITY-SUITE — Drive two turns that finish at about the same time.
 *
 * §20 names "concurrent completions" among the capabilities the suite must
 * exercise, and observing two sessions' `status()` — which is all this used to
 * do — is not that: it proves the backend can hold two sessions, not that it
 * can finish two turns without losing or crossing one. The failure this exists
 * for is a completion attributed to the wrong session, or one that is simply
 * dropped while the other is being handled; both leave the orchestrator waiting
 * forever on a turn that already happened.
 *
 * Each session gets its own token. A token that surfaces in the other session's
 * output is cross-wiring; a token that surfaces nowhere is a lost turn. Neither
 * depends on what the model chooses to say, because the pane carries the prompt
 * as well as the answer.
 */
async function concurrentCompletions(
  probe: ProbeContext,
  primary: SessionRef,
): Promise<CheckOutcome> {
  const { adapter, clock } = probe;
  const second = await probe.spawn("reviewerPrimary", probe.model);
  const pairs = [
    { session: primary, token: `META-O-CONCURRENT-${randomUUID().slice(0, 8)}` },
    { session: second, token: `META-O-CONCURRENT-${randomUUID().slice(0, 8)}` },
  ];

  const deliveries = await Promise.all(
    pairs.map((pair) =>
      adapter.send(pair.session, randomUUID(), `${probe.probePrompt} Mention ${pair.token}.`),
    ),
  );
  const unacknowledged = deliveries.filter((delivery) => delivery.status !== "acknowledged");
  if (unacknowledged.length > 0) {
    return {
      grade: "degraded",
      detail: `${unacknowledged.length} of 2 concurrent deliveries reported ` +
        unacknowledged.map((delivery) => delivery.status).join(" and "),
    };
  }

  const deadlineAt = new Date(clock.now() + 90_000).toISOString();
  const settled = await Promise.all(
    pairs.map((pair) => adapter.wait(pair.session, { terminal: false, deadlineAt })),
  );
  const outputs = await Promise.all(pairs.map((pair) => adapter.read(pair.session)));

  const lost = pairs.filter((pair, index) => !outputs[index]!.text.includes(pair.token));
  const crossed = pairs.filter((pair, index) => outputs[1 - index]!.text.includes(pair.token));
  if (crossed.length > 0) {
    return {
      grade: "unsupported",
      detail: `a turn's own token surfaced in the other session's output: ${crossed
        .map((pair) => pair.token)
        .join(", ")}`,
    };
  }
  if (lost.length > 0) {
    return {
      grade: "degraded",
      detail:
        `${lost.length} of 2 concurrent turns left no trace in their own session ` +
        `(waits settled at ${settled.map((result) => result.status).join(" and ")})`,
    };
  }
  return {
    grade: "supported",
    detail:
      "two turns issued together each completed in their own session " +
      `(${settled.map((result) => result.status).join(" and ")})`,
  };
}

/**
 * §M-CAPABILITY-SUITE — Probe the capabilities a run needs in order to finish.
 *
 * Replacement and stop are what keep a run from leaving orphaned workers behind
 * when a session has to be abandoned, which is the state that quietly consumes
 * a developer's quota after the run itself is over.
 */
async function lifecycleChecks(
  probe: ProbeContext,
  primary: SessionRef | undefined,
  additionalModels: ModelRef[],
): Promise<SuiteCheck[]> {
  const { adapter, clock } = probe;
  const checks: SuiteCheck[] = [];

  for (const extra of additionalModels) {
    checks.push(
      await runCheck(`route-${extra.route}`, false, clock, async () => {
        const session = await probe.spawn("e2eTester", extra);
        const status = await adapter.status(session);
        return { grade: "supported", detail: `route ${extra.route} hosted, status ${status}` };
      }),
    );
  }

  checks.push(
    await runCheck("session-replacement", false, clock, async () => {
      if (!primary) throw new Error("no session was spawned");
      const outcome = await adapter.stop(primary);
      const replacement = await probe.spawn("executor", probe.model);
      return {
        grade: outcome === "stopped" ? "supported" : "degraded",
        detail: `stop reported ${outcome}; replacement ${replacement.sessionId} started`,
      };
    }),
  );

  checks.push(
    await runCheck("stop", true, clock, async () => {
      const outcomes: string[] = [];
      while (probe.spawned.length > 0) {
        const session = probe.spawned.pop()!;
        outcomes.push(await adapter.stop(session));
      }
      const clean = outcomes.every(
        (outcome) => outcome === "stopped" || outcome === "already_terminal",
      );
      return {
        grade: clean ? "supported" : "degraded",
        detail: `stop outcomes: ${outcomes.join(", ") || "none"}`,
      };
    }),
  );

  // Stated as degraded rather than skipped: a capability nobody proved is not a
  // capability, and pretending otherwise is how a backend passes a suite it
  // would fail in the one situation the check exists for.
  checks.push({
    id: "reboot-recovery",
    grade: "degraded",
    detail:
      "restarting the backend server cannot be automated safely from inside a managed session; " +
      "run `meta-o capability-suite run --full` again after a manual server restart to prove it",
    durationMs: 0,
    completionCritical: false,
  });

  return checks;
}

/**
 * §M-CAPABILITY-SUITE — Full suite that actually creates and drives sessions.
 *
 * Every check here corresponds to a failure the methodology has no other
 * defence against: an unacknowledged delivery, a status that never settles, a
 * resume that silently starts a second worker, two sessions that cannot run at
 * once.
 */
export async function runFullSuite(context: SuiteContext): Promise<SuiteReport> {
  const clock = context.clock ?? systemClock;
  const { adapter } = context;
  const spawned: SessionRef[] = [];

  const probe: ProbeContext = {
    adapter,
    clock,
    model: context.model,
    probePrompt:
      context.probePrompt ??
      "Reply with exactly the word READY and nothing else. Do not modify any file.",
    spawned,
    spawn: async (role, model) => {
      const session = await adapter.spawn({
        operationId: randomUUID(),
        role,
        model,
        prompt: "",
        cwd: context.cwd,
      });
      spawned.push(session);
      return session;
    },
  };

  const checks: SuiteCheck[] = [];
  try {
    const observation = await observationChecks(probe);
    checks.push(...observation.checks);
    checks.push(...(await lifecycleChecks(probe, observation.primary, context.additionalModels ?? [])));
  } finally {
    for (const session of spawned) {
      try {
        await adapter.stop(session);
      } catch {
        /* cleanup is best effort; the report already records what happened */
      }
    }
  }

  try {
    checks.push(...(await reportedChecks(context, clock)));
  } catch {
    /* the behavioural probes above already recorded what the backend could not do */
  }

  return finalize("full", context.backend, checks);
}

/** §M-CAPABILITY-SUITE — Decide whether the observed grades block the backend. */
function finalize(mode: "smoke" | "full", backend: string, checks: SuiteCheck[]): SuiteReport {
  const blockingReasons = checks
    .filter((check) => check.completionCritical && check.grade === "unsupported")
    .map((check) => `${check.id}: ${check.detail}`);
  return { mode, backend, checks, blocked: blockingReasons.length > 0, blockingReasons };
}

/** §M-CAPABILITY-SUITE — What one backend was last proven able to do. */
export interface CapabilityBaseline {
  backend: string;
  mode: "smoke" | "full";
  recordedAt: string;
  grades: Record<string, CapabilityGrade>;
}

/** §M-CAPABILITY-SUITE — Grades ordered from best to worst, for comparison. */
const GRADE_ORDER: Record<CapabilityGrade, number> = {
  supported: 2,
  degraded: 1,
  unsupported: 0,
};

/** §M-CAPABILITY-SUITE — Reduce a report to the record a later run compares against. */
export function baselineOf(report: SuiteReport, recordedAt: string): CapabilityBaseline {
  const grades: Record<string, CapabilityGrade> = {};
  for (const check of report.checks) grades[check.id] = check.grade;
  return { backend: report.backend, mode: report.mode, recordedAt, grades };
}

/**
 * §M-CAPABILITY-SUITE — Capabilities the backend used to have and no longer does.
 *
 * Only checks present in both runs are compared, so a cheap smoke report never
 * reads as "everything the full suite proved has disappeared". A capability
 * appearing for the first time is not a regression, and neither is one that
 * improved — this answers exactly one question, which preflight then refuses to
 * proceed past: did the ground move under a workflow that already depends on it.
 */
export function detectCapabilityRegression(
  baseline: CapabilityBaseline | undefined,
  report: SuiteReport,
): string[] {
  if (!baseline || baseline.backend !== report.backend) return [];
  const regressions: string[] = [];
  for (const check of report.checks) {
    const previous = baseline.grades[check.id];
    if (previous === undefined) continue;
    if (GRADE_ORDER[check.grade] < GRADE_ORDER[previous]) {
      regressions.push(`${check.id}: ${previous} → ${check.grade} (${check.detail})`);
    }
  }
  return regressions;
}

/** §M-CAPABILITY-SUITE — Human-readable rendering of a suite report. */
export function formatSuiteReport(report: SuiteReport): string {
  const lines = [`capability suite (${report.mode}) for ${report.backend}:`];
  for (const check of report.checks) {
    const critical = check.completionCritical ? " [completion-critical]" : "";
    lines.push(`  ${check.id.padEnd(26)} ${check.grade.padEnd(12)} ${check.detail}${critical}`);
  }
  lines.push(report.blocked ? "RESULT: backend BLOCKED" : "RESULT: backend usable");
  return lines.join("\n");
}
