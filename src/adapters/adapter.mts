/**
 * §M-ADAPTER — Backend-neutral capability grading and gating.
 *
 * Implements §A-BACKEND-CONTRACT. The methodology deliberately owns no session
 * runtime, so its liveness is exactly as good as the backend's. Declaring a
 * capability "supported" on paper is therefore the most dangerous kind of
 * documentation: it converts a missing feature into a silent hang. This module
 * separates "the core may rely on it" from "it works, with caveats", and names
 * the small set whose absence must block a backend outright.
 */

import type {
  AdapterCapabilities,
  Backend,
  CapabilityGrade,
  CapabilityMatrixEntry,
  CapabilityReport,
} from "../core/types.mjs";

/**
 * §M-ADAPTER — Capabilities without which a run cannot legitimately complete.
 *
 * `statusRead` is required because every gate result is observed, never
 * assumed. `stop` is required because completion must leave no orphaned worker
 * sessions behind. Everything else has an honest degradation: `wait` becomes
 * polling, `concurrentSessions` becomes sequential reviews, `nativeResume`
 * becomes a fresh session, and the absence of `deliveryReceipt` or
 * `idempotencyKey` is precisely what the no-blind-resend rule exists to absorb.
 */
export const COMPLETION_CRITICAL: Array<keyof AdapterCapabilities> = ["statusRead", "stop"];

/** §M-ADAPTER — Build a matrix entry. */
export function entry(grade: CapabilityGrade, detail: string): CapabilityMatrixEntry {
  return { grade, detail };
}

/**
 * §M-ADAPTER — Turn a tri-state matrix into the boolean map the core consults.
 *
 * `degraded` maps to `false`: a capability that only sometimes works must not
 * be relied upon, but it also must not block the backend, which is why the
 * grade is kept alongside.
 */
export function capabilitiesFromMatrix(
  matrix: Record<keyof AdapterCapabilities, CapabilityMatrixEntry>,
): AdapterCapabilities {
  /** §M-ADAPTER — Only a full `supported` grade counts as the capability being present. */
  const value = (key: keyof AdapterCapabilities): boolean => matrix[key].grade === "supported";
  return {
    deliveryReceipt: value("deliveryReceipt"),
    idempotencyKey: value("idempotencyKey"),
    statusRead: value("statusRead"),
    wait: value("wait"),
    nativeResume: value("nativeResume"),
    stop: value("stop"),
    concurrentSessions: value("concurrentSessions"),
  };
}

/**
 * §M-ADAPTER — Assemble a full report and decide whether the backend is usable.
 *
 * Blocking is computed here rather than at each call site so that a new
 * completion-critical capability automatically starts blocking every backend
 * that lacks it.
 */
export function buildCapabilityReport(
  backend: Backend,
  matrix: Record<keyof AdapterCapabilities, CapabilityMatrixEntry>,
): CapabilityReport {
  const capabilities = capabilitiesFromMatrix(matrix);
  const blockingReasons: string[] = [];
  for (const key of COMPLETION_CRITICAL) {
    if (matrix[key].grade === "unsupported") {
      blockingReasons.push(
        `${backend}: completion-critical capability ${key} is unsupported (${matrix[key].detail})`,
      );
    }
  }
  return {
    backend,
    capabilities,
    matrix,
    completionCritical: COMPLETION_CRITICAL,
    blocked: blockingReasons.length > 0,
    blockingReasons,
  };
}

/** §M-ADAPTER — Raised when an adapter is asked to act through a broken backend. */
export class BackendUnavailableError extends Error {
  /** §M-ADAPTER — Reasons the backend was rejected. */
  readonly reasons: string[];

  /** §M-ADAPTER — Keep the reasons so `FAILED_BACKEND` can explain itself. */
  constructor(backend: Backend, reasons: string[]) {
    super(`backend ${backend} cannot run this workflow:\n- ${reasons.join("\n- ")}`);
    this.name = "BackendUnavailableError";
    this.reasons = reasons;
  }
}

/** §M-ADAPTER — Human-readable rendering of a capability matrix. */
export function formatCapabilityReport(report: CapabilityReport): string {
  const rows = Object.entries(report.matrix).map(
    ([key, value]) =>
      `  ${key.padEnd(20)} ${value.grade.padEnd(12)} ${value.detail}`,
  );
  const header = `backend ${report.backend}: ${report.blocked ? "BLOCKED" : "usable"}`;
  return [header, ...rows].join("\n");
}
