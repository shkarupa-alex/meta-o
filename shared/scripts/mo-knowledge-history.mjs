#!/usr/bin/env node
/**
 * Verify stable knowledge identifiers on every Git commit-parent edge.
 *
 * A merge-base diff cannot see a deletion on one side of a merge, and checkout
 * mutation would make the quality gate alter the tree it judges. This checker
 * therefore reads every historical Markdown blob through Git and parses headings
 * with mdast. It creates no baseline or state file.
 *
 * No Markdown linter, ESLint plugin or hook reads earlier commits: they judge
 * the working tree. The subject here is the commit graph itself — one deletion
 * per parent edge, one authorization trailer per commit, one citation per tree
 * — so there is nothing a mature tool's configuration could be pointed at.
 *
 * The rules live here and the reads live in `knowledge-history-reader.mjs`, so
 * making the traversal cheaper can never quietly change what counts as a
 * violation. Every message and exit code below is part of the contract.
 *
 * Implements §A-MEMORY-01.
 */

import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  authorizationRecordsFromTree,
  citedIdsFromTree,
  historyPins,
  stableValue,
} from "./knowledge-documents.mjs";
import { createHistoryReader, git, unreadable } from "./knowledge-history-reader.mjs";

export { authorizationRecords, definitions } from "./knowledge-documents.mjs";
export { createHistoryReader, git } from "./knowledge-history-reader.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TRAILER = /^Knowledge-ID-Change: (remove|reuse|editorial) (\S+) via (\S+)$/;
const USAGE = `usage: mo-knowledge-history.mjs --repo <root> --cutoff <sha> [options]
       mo-knowledge-history.mjs --repo <root> --pins-from <markdown> [options]

  --repo <root>                  repository to verify (default: this checkout)
  --cutoff <sha>                 lower boundary of the verified history
  --semantic-from <sha>          first parent whose edges enforce semantic reuse
  --current-record-from <sha>    first parent needing a distinct authorization record
  --strict-editorial-from <sha>  first parent under strict editorial rules
  --business <path>              business document (default: docs/business.md)
  --architecture <dir>           architecture directory (default: docs/architecture)
  --pins-from <markdown>         read all four boundaries from one decision document
  --audit-exemptions             also prove the semantic boundary exempts no more
  --timing                       add ms, spawns and blobs to the status line
  --help                         print this grammar and exit

exit: 0 ok | 1 violations or unavailable | 2 call error
`;

function snapshot(reader, commit) {
  if (reader.snapshots.has(commit)) return reader.snapshots.get(commit);
  const all = new Map();
  for (const { path, oid } of reader.documents(commit)) {
    for (const [id, entry] of reader.definitions(oid, path)) {
      if (all.has(id))
        throw new Error(`${commit}: duplicate ${id} in ${all.get(id).path}, ${path}`);
      all.set(id, entry);
    }
  }
  reader.snapshots.set(commit, all);
  return all;
}

function trailers(reader, commit) {
  return reader
    .trailers(commit)
    .split("\n")
    .map((line) => line.match(TRAILER))
    .filter(Boolean)
    .map((match) => ({ action: match[1], ids: match[2].split(","), via: match[3] }));
}

function documentTree(reader, commit, path) {
  const entry = reader.documents(commit).find((item) => item.path === path);
  return entry ? reader.tree(entry.oid) : null;
}

/**
 * A YAML parser reports a reason, a position and a snippet of what it read. The
 * snippet spans lines, and one violation per line is the grammar every consumer
 * of this gate parses, so only the reason and the position survive the trip.
 */
function oneLine(error) {
  const where = Number.isInteger(error?.mark?.line) ? ` at line ${error.mark.line + 1}` : "";
  const reason = error?.reason ?? error?.message ?? "unreadable";
  return `${reason}${where}`.replace(/\s+/gu, " ").trim();
}

function records(reader, commit, path, architectureId) {
  const tree = documentTree(reader, commit, path);
  if (!tree) return [];
  try {
    return authorizationRecordsFromTree(tree, architectureId);
  } catch (error) {
    // The parser knows only the block it choked on. Which commit, which
    // document and which decision is what a consuming project needs in order to
    // repair the record, and this caller is the only place holding all three.
    throw unreadable(
      `${commit} ${path} has an unreadable ${architectureId} authorization record: ${oneLine(error)}`,
    );
  }
}

function sameSortedIds(left, right) {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index]) &&
    new Set(left).size === left.length
  );
}

function coversChange(entry, action, id, editorialIds) {
  if (entry.action === action && entry.ids.length === 1 && entry.ids[0] === id) return true;
  // Editorial authorization is deliberately all-or-nothing for one parent
  // edge after individually authorized reuse ids are removed: accepting a
  // subset would let an unlisted semantic change ride with a mechanical rewrite.
  return (
    action === "reuse" &&
    entry.action === "editorial" &&
    entry.ids.includes(id) &&
    sameSortedIds(entry.ids, editorialIds)
  );
}

function recordCoversChange(record, match, action, id, editorialIds) {
  if (record?.action === action && record?.id === id) return true;
  return (
    action === "reuse" &&
    match.action === "editorial" &&
    record?.action === "editorial" &&
    Array.isArray(record.ids) &&
    record.ids.includes(id) &&
    sameSortedIds(record.ids, editorialIds)
  );
}

function validAuthorizationRecord(record, action, id) {
  const common =
    typeof record?.reason === "string" &&
    record.reason.trim().length > 0 &&
    record.references_updated === true;
  if (record?.action === "editorial") return common && record.new_boundary === undefined;
  return (
    common &&
    record?.action === action &&
    record?.id === id &&
    typeof record.new_boundary === "string" &&
    record.new_boundary.trim().length > 0
  );
}

function authorized(reader, edge, change, snapshots, rules) {
  // `editorial` is a reuse-only path. Deletion never reaches this branch, so a
  // wording-only record cannot retire a durable identifier.
  const { action, id, editorialIds } = change;
  const { previous, current } = snapshots;
  const match = trailers(reader, edge.commit).find((entry) =>
    coversChange(entry, action, id, editorialIds),
  );
  if (!match || !/^§A-[A-Z][A-Z0-9-]*-\d{2}$/.test(match.via)) return false;
  const owner = current.get(match.via);
  if (!owner || owner.kind !== "A") return false;
  const priorOwner = previous.get(match.via);
  const priorFingerprints = new Set(
    (priorOwner ? records(reader, edge.parent, priorOwner.path, match.via) : []).map((record) =>
      JSON.stringify(stableValue(record)),
    ),
  );
  // A historical record may explain only its own parent edge. Requiring a
  // distinct current record prevents one old non-empty boundary from
  // authorizing every later semantic reuse at this trust boundary.
  const record = records(reader, edge.commit, owner.path, match.via).find(
    (candidate) =>
      recordCoversChange(candidate, match, action, id, editorialIds) &&
      (!rules.currentRecord || !priorFingerprints.has(JSON.stringify(stableValue(candidate)))),
  );
  if (!validAuthorizationRecord(record, action, id)) return false;
  if (record.action !== "editorial") return true;
  const fingerprint = rules.postMigration ? "strictEditorial" : "editorial";
  return previous.get(id)?.[fingerprint] === current.get(id)?.[fingerprint];
}

function authorizationHistoryChanged(previous, current) {
  const currentRecords = new Set(current.authorizations);
  return previous.authorizations.some((record) => !currentRecords.has(record));
}

function authorizationHistoryViolations(before, after, edge, enforce) {
  if (!enforce) return [];
  const errors = [];
  for (const [id, prior] of before) {
    const current = after.get(id);
    if (current && authorizationHistoryChanged(prior, current)) {
      errors.push(`${edge.parent}..${edge.commit}: authorization history changed ${id}`);
    }
  }
  return errors;
}

function citationsOf(reader, commit) {
  const found = new Map();
  for (const { path, oid } of reader.documents(commit)) {
    for (const id of citedIdsFromTree(reader.tree(oid))) {
      found.set(id, (found.get(id) ?? new Set()).add(path));
    }
  }
  return found;
}

function referenceErrors(reader, commit) {
  const defined = snapshot(reader, commit);
  const errors = [];
  for (const [id, paths] of citationsOf(reader, commit)) {
    if (!defined.has(id)) {
      errors.push(`${commit}: broken reference ${id} in ${[...paths].sort().join(", ")}`);
    }
  }
  return errors;
}

/**
 * A merge may drop an id only because the other side deleted it. A sibling that
 * simply branched before the id existed never had it to delete, so treating its
 * absence as inheritance would let a merge lose an id in silence.
 */
function deletedOnSibling(reader, parent, id, siblingParents) {
  return siblingParents.some((sibling) => {
    if (snapshot(reader, sibling).has(id)) return false;
    const base = reader.git(["merge-base", parent, sibling], true)?.trim();
    return Boolean(base) && snapshot(reader, base).has(id);
  });
}

function edgeErrors(reader, edge, siblingParents, rules) {
  const before = snapshot(reader, edge.parent);
  const after = snapshot(reader, edge.commit);
  const siblings = siblingParents.map((sha) => snapshot(reader, sha));
  const changedIds = [...after]
    .filter(([id, entry]) => {
      const prior = before.get(id);
      return prior && prior.semantic !== entry.semantic;
    })
    .map(([id]) => id)
    .sort();
  const individuallyAuthorizedIds = new Set(
    trailers(reader, edge.commit)
      .filter((entry) => entry.action === "reuse" && entry.ids.length === 1)
      .map((entry) => entry.ids[0]),
  );
  const editorialIds = changedIds.filter((id) => !individuallyAuthorizedIds.has(id));
  const snapshots = { previous: before, current: after };
  const permits = (action, id) =>
    authorized(reader, edge, { action, id, editorialIds }, snapshots, rules);
  // Authorization records are an append-only audit trail. They stay outside
  // semantic fingerprints so a newly added record does not recursively demand
  // authorization, but an old record may never be edited or removed unnoticed.
  const errors = authorizationHistoryViolations(before, after, edge, rules.postMigration);
  for (const id of before.keys()) {
    if (after.has(id) || deletedOnSibling(reader, edge.parent, id, siblingParents)) continue;
    if (!permits("remove", id))
      errors.push(`${edge.parent}..${edge.commit}: silent deletion ${id}`);
  }
  for (const [id, entry] of after) {
    const prior = before.get(id);
    const sameFromSibling = siblings.some((map) => map.get(id)?.semantic === entry.semantic);
    if (rules.semantic && prior && prior.semantic !== entry.semantic && !sameFromSibling) {
      if (!permits("reuse", id))
        errors.push(`${edge.parent}..${edge.commit}: semantic reuse ${id}`);
    }
  }
  return errors;
}

function withReader(root, options, work) {
  const reader = createHistoryReader(root, options);
  try {
    return work(reader);
  } finally {
    reader.close();
  }
}

/** §A-MEMORY-01 collects the knowledge ids one commit's own documents cite. */
export function citations(root, commit) {
  return withReader(root, {}, (reader) => citationsOf(reader, commit));
}

/**
 * §A-MEMORY-01 reports every citation a commit cannot resolve in its own tree.
 *
 * A reference is a property of one tree, not of an edge, and checking only the
 * current `HEAD` hides a commit whose dangling id a later commit repaired. The
 * scope is the two knowledge levels themselves, so `references_updated` in an
 * authorization record stops being a self-assertion.
 */
export function referenceViolations(root, commit) {
  return withReader(root, {}, (reader) => referenceErrors(reader, commit));
}

/** §A-MEMORY-01 compares one parent edge and reports unauthorized loss or reuse. */
export function edgeViolations(
  root,
  parent,
  commit,
  siblingParents = [],
  enforceSemantic = true,
  enforceCurrentRecord = true,
  enforcePostMigrationRules = true,
) {
  const rules = {
    semantic: enforceSemantic,
    currentRecord: enforceCurrentRecord,
    postMigration: enforcePostMigrationRules,
  };
  return withReader(root, {}, (reader) =>
    edgeErrors(reader, { parent, commit }, siblingParents, rules),
  );
}

function boundaryErrors(reader, cutoff, boundaries) {
  // Resolving a commit is insufficient: a sibling boundary would make every
  // per-edge ancestry test false and silently disable the associated rule.
  const isReachable = (ref) =>
    Boolean(reader.git(["rev-parse", "--verify", `${ref}^{commit}`], true)) &&
    reader.git(["merge-base", "--is-ancestor", ref, "HEAD"], true) !== null;
  if (!isReachable(cutoff)) return [`history_unavailable: cutoff ${cutoff} is unreachable`];
  const unreachable = boundaries.find(([ref]) => ref && !isReachable(ref));
  return unreachable
    ? [`history_unavailable: ${unreachable[1]} boundary ${unreachable[0]} is unreachable`]
    : [];
}

// One `rev-list --ancestry-path` per boundary answers what a per-edge
// `merge-base --is-ancestor` asked with one process per edge: a parent inside
// `boundary..HEAD` that keeps the boundary as an ancestor, or the boundary itself.
function descendantsOf(reader, boundary) {
  if (!boundary) return null;
  const listed = reader.git(["rev-list", "--ancestry-path", `${boundary}..HEAD`]).trim();
  const set = new Set(listed ? listed.split("\n") : []);
  set.add(reader.git(["rev-parse", "--verify", `${boundary}^{commit}`]).trim());
  return set;
}

/**
 * §A-MEMORY-01 verifies the reachable full DAG after an explicit cutoff.
 *
 * Deletion and reference integrity hold from the cutoff. `semanticFrom` is the
 * explicit, auditable commit from which semantic reuse is also enforced: the
 * two edges between the cutoff and the checker's own introduction changed a
 * section body under a rule that did not exist yet, and history is not
 * rewritten to hide that. An absent `semanticFrom` enforces everywhere.
 * `currentRecordFrom` similarly pins the first parent whose outgoing edges
 * require a distinct authorization record rather than the legacy shape check.
 * It exempts only 3a292e7..a811313 (`§A-DELIVERY-01`), which predates the rule;
 * history is not rewritten to fabricate an authorization that did not exist.
 * `strictEditorialFrom` pins the first parent whose outgoing edges restrict
 * editorial authorization to headings, link labels and ordinary-text
 * whitespace, and make authorization records append-only.
 */
export function runHistory(root, cutoff, options = {}) {
  return withReader(root, options, (reader) => {
    // A repository the reader cannot read is `unavailable`, never a pass: the
    // gate fails closed on a short frame, a premature EOF or a failed child.
    try {
      return historyRun(reader, cutoff, options);
    } catch (error) {
      if (!error.historyUnavailable) throw error;
      const errors = [`history_unavailable: ${error.message}`];
      return { errors, unavailable: true, commits: 0, edges: 0, stats: reader.stats() };
    }
  });
}

function historyRun(reader, cutoff, pins) {
  const started = Date.now();
  const named = [
    [pins.semanticFrom ?? null, "semantic"],
    [pins.currentRecordFrom ?? null, "current-record"],
    [pins.strictEditorialFrom ?? null, "strict-editorial"],
  ];
  const unavailable = boundaryErrors(reader, cutoff, named);
  if (unavailable.length > 0) {
    return {
      errors: unavailable,
      unavailable: true,
      commits: 0,
      edges: 0,
      stats: reader.stats(),
    };
  }
  const lines = reader
    .git(["rev-list", "--topo-order", "--reverse", "--parents", `${cutoff}..HEAD`])
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(" "));
  const [semantic, currentRecord, postMigration] = named.map(([ref]) => descendantsOf(reader, ref));
  reader.prime(lines.flat());
  const errors = [];
  let edges = 0;
  for (const [commit, ...parents] of lines) {
    errors.push(...referenceErrors(reader, commit));
    for (const parent of parents) {
      edges += 1;
      const rules = {
        semantic: !semantic || semantic.has(parent),
        currentRecord: !currentRecord || currentRecord.has(parent),
        postMigration: !postMigration || postMigration.has(parent),
      };
      const siblings = parents.filter((sha) => sha !== parent);
      errors.push(...edgeErrors(reader, { parent, commit }, siblings, rules));
    }
  }
  return {
    errors,
    unavailable: false,
    commits: lines.length,
    edges,
    ms: Date.now() - started,
    stats: reader.stats(),
  };
}

/** §A-MEMORY-01 verifies the reachable full DAG after an explicit cutoff. */
export function verifyHistory(
  root,
  cutoff,
  semanticFrom = null,
  currentRecordFrom = null,
  strictEditorialFrom = null,
) {
  return runHistory(root, cutoff, { semanticFrom, currentRecordFrom, strictEditorialFrom }).errors;
}

const OPTIONS = new Set([
  "--repo",
  "--cutoff",
  "--semantic-from",
  "--current-record-from",
  "--strict-editorial-from",
  "--business",
  "--architecture",
  "--pins-from",
]);

function callError(detail) {
  return Object.assign(new Error(detail), { callError: true });
}

function parseArguments(argv) {
  const given = new Map();
  const timing = argv.includes("--timing");
  const audit = argv.includes("--audit-exemptions");
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--timing" || flag === "--audit-exemptions") continue;
    if (!OPTIONS.has(flag)) throw callError(`unknown argument ${flag}`);
    if (given.has(flag)) throw callError(`${flag} is given twice`);
    index += 1;
    const value = argv[index];
    if (value === undefined || value.startsWith("--")) throw callError(`${flag} needs a value`);
    given.set(flag, value);
  }
  const pins = resolvePins(given);
  if (audit && !pins.semanticFrom) {
    throw callError("--audit-exemptions needs a semantic boundary to audit");
  }
  return {
    timing,
    audit,
    root: resolve(given.get("--repo") ?? ROOT),
    cutoff: pins.cutoff,
    documents: {
      business: given.get("--business"),
      architecture: given.get("--architecture"),
    },
    pins: {
      semanticFrom: pins.semanticFrom ?? null,
      currentRecordFrom: pins.currentRecordFrom ?? null,
      strictEditorialFrom: pins.strictEditorialFrom ?? null,
    },
  };
}

// The two modes are exclusive on purpose: a run that took some boundaries from
// the reviewed document and some from the command line would be neither
// reproducible nor reviewable.
const EXPLICIT = [
  "--cutoff",
  "--semantic-from",
  "--current-record-from",
  "--strict-editorial-from",
];

function resolvePins(given) {
  const explicit = EXPLICIT.filter((flag) => given.has(flag));
  const source = given.get("--pins-from");
  if (source && explicit.length > 0) {
    throw callError(`--pins-from cannot be combined with ${explicit.join(", ")}`);
  }
  if (!source) {
    if (!given.has("--cutoff")) throw callError("--cutoff or --pins-from is required");
    return {
      cutoff: given.get("--cutoff"),
      semanticFrom: given.get("--semantic-from"),
      currentRecordFrom: given.get("--current-record-from"),
      strictEditorialFrom: given.get("--strict-editorial-from"),
    };
  }
  try {
    return historyPins(readFileSync(source, "utf8"), source);
  } catch (error) {
    throw callError(`--pins-from ${error.message}`);
  }
}

/**
 * A declared exemption has to be the whole exemption. Two more passes prove it:
 * every edge from the boundary onwards survives semantic enforcement on its own,
 * and nothing after the boundary quietly rides on the exemption.
 */
function exemptionOverreach(root, values, reported) {
  const unexempted = { ...values.pins, ...values.documents, semanticFrom: null };
  const boundary = values.pins.semanticFrom;
  const first = runHistory(root, boundary, unexempted);
  const second = runHistory(root, values.cutoff, unexempted);
  // A pass that could not read the history has not audited anything, so it
  // answers `unavailable` rather than dressing the reason up as overreach.
  if (first.unavailable || second.unavailable) {
    throw unreadable(
      (first.unavailable ? first : second).errors[0].replace(/^history_unavailable: /u, ""),
    );
  }
  const overreach = first.errors;
  const already = new Set(reported);
  for (const error of second.errors) {
    const [parent, edge] = error.split("..");
    // Only an edge error can be attributed to a boundary. Every other class is
    // independent of the exemption and so is already in the primary pass; if a
    // new one ever is not, reporting it beats dropping it on the floor.
    if (edge === undefined) {
      if (!already.has(error)) overreach.push(error);
      continue;
    }
    const exempted = git(root, ["merge-base", "--is-ancestor", boundary, parent], true) === null;
    if (!exempted) overreach.push(error);
  }
  return overreach.map((error) => `exemption_overreach: ${error}`);
}

function report(values, run) {
  const status = run.unavailable ? "unavailable" : run.errors.length > 0 ? "violations" : "ok";
  if (run.errors.length > 0) {
    process.stderr.write(`${run.errors.join("\n")}\n`);
    process.exitCode = 1;
  }
  const timing = values.timing
    ? ` ms=${run.ms ?? 0} spawns=${run.stats.spawns} blobs=${run.stats.uniqueMarkdownBlobs}`
    : "";
  process.stdout.write(
    `MO-KNOWLEDGE-HISTORY/1 status=${status} cutoff=${values.cutoff}` +
      ` commits=${run.commits} edges=${run.edges}${timing}\n`,
  );
}

function main(argv) {
  // `--help` answers before anything else is parsed or resolved, so asking for
  // the grammar never touches stdin, the repository or the network.
  if (argv.includes("--help")) {
    process.stdout.write(USAGE);
    return;
  }
  let values;
  try {
    values = parseArguments(argv);
  } catch (error) {
    if (!error.callError) throw error;
    process.stderr.write(`${error.message}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  report(values, verifiedRun(values));
}

// A document the rules cannot interpret at all — two sections claiming one id, an
// authorization block that is not YAML — is still an answer a consuming project
// has to be able to read. Crashing would leave it with an exit code and no
// status line, which is the one thing this command exists to produce.
function verifiedRun(values) {
  const options = { ...values.pins, ...values.documents };
  let counted = { commits: 0, edges: 0 };
  try {
    const run = runHistory(values.root, values.cutoff, options);
    // Keep what the primary traversal already established, so a failure in the
    // audit does not report a graph nobody looked at.
    counted = { commits: run.commits, edges: run.edges };
    // Inside the guard, not beside it. The audit re-runs the traversal with the
    // semantic exemption lifted, so it reaches edges the primary pass never
    // interpreted — and it is the mode the quality gate itself invokes.
    if (values.audit && !run.unavailable) {
      run.errors.push(...exemptionOverreach(values.root, values, run.errors));
    }
    return run;
  } catch (error) {
    return {
      errors: [`history_unavailable: ${error.message}`],
      unavailable: true,
      ...counted,
      stats: { spawns: 0, markdownParses: 0, uniqueMarkdownBlobs: 0, uniqueObjects: 0 },
    };
  }
}

function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) main(process.argv.slice(2));
