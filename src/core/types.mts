/**
 * §M-CORE-TYPES — Single normative definition of every wire type the meta-o
 * workflow exchanges between orchestrator, workers, adapter and watchdog.
 *
 * Implements §A-CONTRACT-TYPES. The master spec states these shapes in prose
 * and TypeScript; keeping exactly one machine-checked copy is what stops the
 * orchestrator skill, the adapter and the watchdog from drifting into three
 * incompatible dialects of the same state file. Delete this module and every
 * consumer would have to re-derive the contract from Markdown.
 */

/**
 * §M-CORE-TYPES — Roles a run can address.
 *
 * The master spec enumerates the six *worker* roles. `"orchestrator"` is a
 * meta-o extension: the watchdog is required to observe the current
 * orchestrator session and, once it is provably terminal, to create a fresh
 * generation. Both are backend operations, and the adapter addresses every
 * session by role, so the orchestrator needs a role label to exist at all.
 */
export type Role =
  | "orchestrator"
  | "executor"
  | "reviewerPrimary"
  | "reviewerCrossVendor"
  | "e2eTester"
  | "reuseResearcher"
  | "technicalAdjudicator";

/** §M-CORE-TYPES — The six worker roles, i.e. every role except the orchestrator. */
export const WORKER_ROLES = [
  "executor",
  "reviewerPrimary",
  "reviewerCrossVendor",
  "e2eTester",
  "reuseResearcher",
  "technicalAdjudicator",
] as const satisfies readonly Role[];

/** §M-CORE-TYPES — Every FSM phase, including pause and terminal states. */
export type Phase =
  | "AWAITING_MODEL_SET"
  | "PREFLIGHT"
  | "SOLUTION_SCAN"
  | "EXECUTING"
  | "LOCAL_QC"
  | "SMOKE_PREFLIGHT"
  | "REVIEW_STABILIZATION"
  | "E2E_STABILIZATION"
  | "FINALIZE_METADATA"
  | "COMPLETE"
  | "CANCELLED"
  | "PAUSED_EXTERNAL"
  | "PAUSED_QUOTA"
  | "PAUSED_MISSING_TOOLS"
  | "PAUSED_MODEL_UNAVAILABLE"
  | "PAUSED_TECHNICAL_DISPUTE"
  | "PAUSED_ORCHESTRATOR_BUDGET"
  | "PAUSED_BACKEND_UNCERTAIN"
  | "STOPPED_SPEC_IMPOSSIBLE"
  | "FAILED_BACKEND";

/** §M-CORE-TYPES — Backend that owns session lifecycle for a run. */
export type Backend = "herdr" | "omnigent";

/** §M-CORE-TYPES — CLI route a model is reached through. */
export type ModelRoute = "claude" | "codex" | "opencode";

/**
 * §M-CORE-TYPES — Identity of one working model.
 *
 * `vendor` is the organisation that developed the base model and `family` its
 * provider-native base family; neither may be inferred from `route`, because
 * cross-vendor independence of the second reviewer is the property the whole
 * review gate rests on.
 */
export interface ModelRef {
  route: ModelRoute;
  vendor: string;
  family: string;
  model: string;
  effort?: string;
  providerId?: string;
}

/** §M-CORE-TYPES — The exactly four working models of a run. */
export interface ModelSet {
  executor: ModelRef;
  reviewerPrimary: ModelRef;
  reviewerCrossVendor: ModelRef;
  e2eTester: ModelRef;
}

/** §M-CORE-TYPES — Immutable reference to the feature spec driving a run. */
export type FeatureSpecRef =
  | { kind: "tracked"; locator: string; sha256: string; disposition: "delete_after_sync" }
  | { kind: "local"; locator: string; sha256: string; disposition: "external" }
  | { kind: "url"; locator: string; sha256: string; disposition: "external" };

/** §M-CORE-TYPES — Durable identity of a project state directory. */
export interface ProjectMetadata {
  schemaVersion: 1;
  canonicalPath: string;
  projectKey: string;
  createdAt: string;
}

/** §M-CORE-TYPES — Per-project preferences that must never enter the repository. */
export interface ProjectSettings {
  schemaVersion: 1;
  modelSet: ModelSet;
  backend: Backend;
  /**
   * Whether this project has opted *out* of the watchdog. Three-valued on
   * purpose: absent means "not decided here", and the watchdog treats that as
   * watchable, because the decision to watch at all is `watchdog.json`'s.
   *
   * It was a plain boolean, and `project set-settings` — the step the
   * orchestrator skill makes mandatory — wrote `false` whenever the payload
   * omitted a key nothing documents. Every real project therefore had the
   * watchdog switched off by a step taken for another reason entirely, and
   * `meta-o watchdog enable` could not turn it on.
   */
  watchdogEnabled?: boolean;
  handoffDefault: boolean;
  updatedAt: string;
}

/** §M-CORE-TYPES — Handle to one live worker session owned by the backend. */
export interface SessionRef {
  backend: Backend;
  sessionId: string;
  role: Role;
  generation: number;
}

/**
 * §M-CORE-TYPES — Content identity of an attested candidate.
 *
 * The digest, not the commit OID, is the identity of verified content, so that
 * a rebase or squash preserving the tree does not force every gate to re-run.
 */
export interface SnapshotRef {
  digest: string;
  provenanceCommit: string;
  computedAt: string;
}

/**
 * §M-CORE-TYPES — Outcome of one gate bound to the content it attests.
 *
 * `selectionPlanVerdict` is carried on reviewer results so that "this reviewer
 * also judged the E2E selection complete" survives in state instead of only in
 * the transcript of the session that said it.
 */
export interface RevisionResult {
  commitOid: string;
  snapshotDigest: string;
  planDigest?: string;
  status: "passed" | "failed" | "invalidated";
  selectionPlanVerdict?: "complete" | "incomplete";
  completedAt: string;
  evidenceRef?: string;
}

/** §M-CORE-TYPES — Category of a decision the executor escalates. */
export type DecisionCategory =
  | "local_implementation"
  | "architecture"
  | "business_semantics"
  | "irreversible"
  | "external_dependency"
  | "tooling";

/** §M-CORE-TYPES — One option offered with an escalated decision. */
export interface DecisionOption {
  id: string;
  description: string;
  tradeoffs: string[];
}

/** §M-CORE-TYPES — Executor question that the orchestrator or user must answer. */
export interface DecisionRequest {
  id: string;
  revision: string;
  category: DecisionCategory;
  question: string;
  options: DecisionOption[];
  recommendation: string;
  specImpact: "none" | "possible" | "certain";
  reversible: boolean;
}

/** §M-CORE-TYPES — Compact record of a decision already taken in this run. */
export interface DecisionRecord {
  id: string;
  category: DecisionCategory;
  question: string;
  answer: string;
  decidedBy: "orchestrator" | "user" | "technicalAdjudicator";
  rationale: string;
  decidedAt: string;
}

/** §M-CORE-TYPES — Why a run is paused and what would release it. */
export interface PauseState {
  reason: string;
  enteredAt: string;
  resumeCondition: string;
}

/** §M-CORE-TYPES — Scenario set the E2E tester commits to before any review. */
export interface E2ESelectionPlan {
  schemaVersion: 1;
  commitOid: string;
  selectedScenarioIds: string[];
  selectionRationale: string;
  impactedBusinessLinks: string[];
  impactedTags: string[];
  planDigest: string;
}

/**
 * §M-CORE-TYPES — Planned knowledge changes held outside durable project docs.
 *
 * Exists so that planning never writes `§B-TODO`/`§A-TODO` into the current
 * source of truth; on abort there is nothing to clean up.
 */
export interface KnowledgeImpactPlan {
  impactedBusinessAnchors: string[];
  impactedArchitectureAnchors: string[];
  impactedModules: string[];
  expectedSpecRetirement: string[];
}

/**
 * §M-CORE-TYPES — The single in-flight backend side effect of a run.
 *
 * `probe` is a meta-o extension over the master-spec shape: it carries opaque
 * adapter evidence captured *before* the call (for Herdr, the pane id and the
 * pre-send `state_change_seq`). Without it a backend that has no native
 * idempotency key could not prove after a crash whether a prompt was
 * delivered, and the no-blind-resend rule would degrade into always pausing.
 */
export interface PendingOperation {
  operationId: string;
  kind: "spawn" | "send" | "wait" | "stop";
  sessionId?: string;
  requestDigest: string;
  state: "prepared" | "acknowledged" | "uncertain";
  backendReceipt?: string;
  probe?: string;
  preparedAt?: string;
  deadlineAt?: string;
}

/** §M-CORE-TYPES — One concrete artefact a reviewer points at. */
export interface Evidence {
  kind: "file" | "symbol" | "command" | "scenario";
  reference: string;
  detail: string;
}

/** §M-CORE-TYPES — A single review objection with its justification and fix. */
export interface Finding {
  id: string;
  severity: "blocker" | "major" | "minor" | "suggestion";
  classification: "defect" | "engineering_risk" | "taste";
  evidence: Evidence[];
  basis: { type: "spec" | "business" | "architecture" | "engineering"; reference: string };
  impact: string;
  recommendedFix: { approach: string; rationale: string; alternatives?: string[] };
}

/** §M-CORE-TYPES — Structured verdict of one reviewer on one snapshot. */
export interface ReviewResult {
  reviewer: "reviewerPrimary" | "reviewerCrossVendor";
  commitOid: string;
  snapshotDigest: string;
  planDigest: string;
  selectionPlanVerdict: "complete" | "incomplete";
  verdict: "passed" | "changes_requested";
  findings: Finding[];
  completedAt: string;
}

/** §M-CORE-TYPES — Outcome of one executed E2E scenario. */
export interface E2EScenarioResult {
  scenarioId: string;
  status: "passed" | "failed" | "blocked";
  evidence: string;
}

/** §M-CORE-TYPES — Environments an E2E set may be executed against. */
export type E2EEnvironment = "local" | "ephemeral" | "staging" | "production";

/** §M-CORE-TYPES — Outcome of one full selected E2E set. */
export interface E2EResult {
  commitOid: string;
  snapshotDigest: string;
  planDigest: string;
  selectedScenarioIds: string[];
  selectionRationale: string;
  scenarios: E2EScenarioResult[];
  /**
   * Where the set actually ran. Declared by the tester and written verbatim
   * into `last_run.environment`, so the metadata guard can hold the two to each
   * other; §20 forbids production without an explicit user decision, and until
   * the result said where it ran there was nothing to forbid it against.
   */
  environment: E2EEnvironment;
  completedAt: string;
}

/** §M-CORE-TYPES — Lifecycle of one open finding inside the run state. */
export interface FindingRecord {
  finding: Finding;
  raisedBy: SessionRef;
  status: "open" | "fix_proposed" | "resolved" | "taste_dismissed";
  /**
   * Set when `record-e2e` derived this record from a scenario status rather
   * than a person judging the change. A derived record is a projection of the
   * gate result, so the next run of that gate re-computes it; a record a human
   * raised is not, and survives until it is restated or closed.
   */
  derived?: boolean;
  resolutionCandidate?: string;
  resolutionEvidence?: Evidence[];
  resolvedBy?: SessionRef;
  /**
   * Set when a technical adjudicator demoted this finding to `taste`. Kept so
   * the record says on whose authority it stopped blocking, which is the whole
   * content of that verdict.
   */
  reclassifiedBy?: SessionRef;
}

/** §M-CORE-TYPES — Which stabilization loop is currently authoritative. */
export interface ActiveLoop {
  kind: "review" | "e2e";
  iteration: number;
}

/**
 * §M-CORE-TYPES — Gate attestations collected for the current candidate.
 *
 * `smoke` is a precondition, not one of the four completion attestations: it
 * proves the candidate builds, boots and answers a health check, which is what
 * makes spending two reviewers and a full E2E set on it worthwhile. Completion
 * is still proven by qc, both reviews and E2E alone.
 */
export interface Confirmations {
  qc?: RevisionResult;
  smoke?: RevisionResult;
  reviewerPrimary?: RevisionResult;
  reviewerCrossVendor?: RevisionResult;
  e2e?: RevisionResult;
}

/**
 * §M-CORE-TYPES — The whole recoverable state of one feature run.
 *
 * Deliberately not a task graph, history or transcript: a fresh orchestrator
 * must be able to resume from this file plus backend status alone, so anything
 * that cannot be re-derived from the repository or the backend has to live
 * here, and nothing else may.
 */
export interface RunState {
  schemaVersion: 1;
  runId: string;
  projectKey: string;
  phase: Phase;
  stateVersion: number;
  orchestratorGeneration: number;
  spec: FeatureSpecRef;
  specBlob: string;
  baseRevision: string;
  candidateSnapshot?: SnapshotRef;
  modelSet: ModelSet;
  sessions: Partial<Record<Role, SessionRef>>;
  sessionGeneration: Partial<Record<Role, number>>;
  /**
   * Handle of the session currently driving this run. A meta-o extension over
   * the master-spec shape: without it the watchdog cannot tell a live
   * orchestrator from a dead one, and §15's "never replace a living
   * orchestrator" rule would be unenforceable.
   */
  orchestratorSession?: SessionRef;
  decisions: DecisionRecord[];
  knowledgeImpactPlan?: KnowledgeImpactPlan;
  e2ePlan?: E2ESelectionPlan;
  /**
   * Content identity the stored plan was sealed against.
   *
   * The plan carries a `commitOid`, and comparing *that* to the candidate's
   * provenance commit made an amend, rebase or squash of a byte-identical tree
   * invalidate both reviews and the whole selected E2E set — the one thing §00
   * says a rebase must not do. Content identity is the digest; the commit is
   * provenance, and provenance is allowed to move.
   */
  e2ePlanSnapshotDigest?: string;
  pendingOperation?: PendingOperation;
  activeLoop?: ActiveLoop;
  confirmations: Confirmations;
  /**
   * Per-scenario outcome of the last executed selected E2E set. Kept because
   * the completion metadata commit writes exactly these statuses into
   * `e2e.json`, and the guard that checks it must compare against what was
   * actually observed rather than assume everything passed.
   */
  e2eScenarioStatus?: E2EScenarioResult[];
  /** Where the recorded E2E set ran, so the metadata commit can be held to it. */
  e2eEnvironment?: E2EEnvironment;
  /**
   * Proof that the metadata commit was inspected and stayed inside its
   * permitted field. Recorded so that `COMPLETE` can require it, instead of
   * leaving the last step of the lifecycle as advice in a prompt.
   */
  metadataVerified?: { snapshotDigest: string; metadataCommit: string; verifiedAt: string };
  /**
   * The user's decision to allow E2E against production for this run. §20
   * requires it explicitly, and a boolean would not be enough to audit: the
   * decision record names who allowed it and why.
   */
  productionE2eApproved?: { decisionId: string; approvedAt: string };
  openFindings?: Partial<
    Record<"reviewerPrimary" | "reviewerCrossVendor" | "e2e", FindingRecord[]>
  >;
  paused?: PauseState;
  reuseScanEnabled?: boolean;
  handoffEnabled?: boolean;
  updatedAt: string;
}

/** §M-CORE-TYPES — Capability booleans the core consults before using a backend. */
export interface AdapterCapabilities {
  deliveryReceipt: boolean;
  idempotencyKey: boolean;
  statusRead: boolean;
  wait: boolean;
  nativeResume: boolean;
  stop: boolean;
  concurrentSessions: boolean;
}

/** §M-CORE-TYPES — Tri-state grading behind each capability boolean. */
export type CapabilityGrade = "supported" | "degraded" | "unsupported";

/** §M-CORE-TYPES — Evidence-bearing capability matrix entry. */
export interface CapabilityMatrixEntry {
  grade: CapabilityGrade;
  detail: string;
}

/**
 * §M-CORE-TYPES — Full capability report of an adapter.
 *
 * The boolean map answers "may the core rely on this?"; the matrix records why,
 * so that a `degraded` capability is visible to a human instead of silently
 * behaving like `supported`.
 */
export interface CapabilityReport {
  backend: Backend;
  capabilities: AdapterCapabilities;
  matrix: Record<keyof AdapterCapabilities, CapabilityMatrixEntry>;
  completionCritical: Array<keyof AdapterCapabilities>;
  blocked: boolean;
  blockingReasons: string[];
}

/** §M-CORE-TYPES — Request to create one worker session. */
export interface SpawnRequest {
  operationId: string;
  role: Role;
  model: ModelRef;
  prompt: string;
  cwd: string;
}

/** §M-CORE-TYPES — Backend-reported liveness of a session. */
export type SessionStatus =
  | "starting"
  | "running"
  | "waiting"
  | "complete"
  | "failed"
  | "stopped"
  | "unknown";

/** §M-CORE-TYPES — Acknowledgement of one delivery attempt. */
export interface DeliveryResult {
  operationId: string;
  status: "acknowledged" | "rejected" | "unknown";
  receipt?: string;
}

/** §M-CORE-TYPES — Output slice read from a session at a cursor. */
export interface SessionOutput {
  cursor: string;
  text: string;
  terminal: boolean;
}

/** §M-CORE-TYPES — What a caller of `wait` is waiting for. */
export interface ExpectedState {
  terminal: boolean;
  deadlineAt: string;
}

/** §M-CORE-TYPES — Result of a bounded wait. */
export interface WaitResult {
  status: SessionStatus;
  cursor?: string;
}

/** §M-CORE-TYPES — Whether an uncertain side effect actually happened. */
export interface ReconcileResult {
  operationId: string;
  effect: "applied" | "not_applied" | "unknown";
  receipt?: string;
}

/**
 * §M-CORE-TYPES — The complete backend contract the workflow depends on.
 *
 * Anything absent from this interface — durable queues, dedup ledgers, session
 * databases — is deliberately not part of the methodology and belongs to the
 * backend.
 */
export interface SessionAdapter {
  capabilities(): Promise<AdapterCapabilities>;
  capabilityReport(): Promise<CapabilityReport>;
  spawn(request: SpawnRequest): Promise<SessionRef>;
  send(session: SessionRef, operationId: string, message: string): Promise<DeliveryResult>;
  status(session: SessionRef): Promise<SessionStatus>;
  read(session: SessionRef, cursor?: string): Promise<SessionOutput>;
  wait(session: SessionRef, expected: ExpectedState): Promise<WaitResult>;
  resume(session: SessionRef): Promise<SessionRef>;
  reconcile(operation: PendingOperation): Promise<ReconcileResult>;
  stop(session: SessionRef): Promise<"stopped" | "already_terminal" | "unknown">;
}

/** §M-CORE-TYPES — One machine-readable scenario entry of the E2E registry. */
export interface E2EScenarioEntry {
  scenario_id: string;
  scenario_ref: string;
  business_links: string[];
  always_required: boolean;
  tags: string[];
  last_run?: {
    snapshot_digest: string;
    provenance_commit: string;
    run_id: string;
    spec_sha256: string;
    verified_at: string;
    status: "passed" | "failed" | "blocked";
    environment: string;
  };
}

/** §M-CORE-TYPES — Tracked `docs/architecture/e2e.json`. */
export interface E2ERegistry {
  schema_version: 1;
  scenarios: E2EScenarioEntry[];
}

/** §M-CORE-TYPES — One declared blocking gate of the project QC contract. */
export interface QcManifestGate {
  id: string;
  command: string;
  policy: "passed" | "not_applicable";
  rationale?: string;
}

/** §M-CORE-TYPES — Tracked `.quality/qc-manifest.json`. */
export interface QcManifest {
  schema_version: 1;
  gates: QcManifestGate[];
}

/** §M-CORE-TYPES — One executed gate inside a QC result. */
export interface QcResultGate {
  id: string;
  status: "passed" | "failed" | "not_applicable";
  command: string;
  tool_version?: string;
  duration_ms?: number;
}

/** §M-CORE-TYPES — Machine-readable output `make qc` writes to `META_O_QC_RESULT`. */
export interface QcResult {
  schema_version: 1;
  snapshot_digest: string;
  gates: QcResultGate[];
}

/** §M-CORE-TYPES — Optional multi-project watchdog configuration. */
export interface WatchdogConfig {
  schema_version: 1;
  enabled: boolean;
  project_keys: string[];
  poll_interval_seconds: number;
  max_backoff_seconds: number;
  classifier_mode: "deterministic" | "hybrid";
}

/** §M-CORE-TYPES — The closed set of actions a watchdog may choose. */
export type WatchdogAction =
  | "noop"
  | "wake_orchestrator"
  | "spawn_orchestrator"
  | "backoff"
  | "surface_uncertainty";

/** §M-CORE-TYPES — Bounded classification a local model may return. */
export type TailClassification = "transient" | "quota" | "external" | "unknown";
