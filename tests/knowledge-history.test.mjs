/**
 * Exercise historical identifier integrity through real Git object graphs.
 *
 * Protects §A-MEMORY-01.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { fromMarkdown } from "mdast-util-from-markdown";

import { historyPins } from "../shared/scripts/knowledge-documents.mjs";
import {
  definitions,
  edgeViolations,
  git,
  runHistory,
  verifyHistory,
} from "../shared/scripts/mo-knowledge-history.mjs";

const CLI = join(process.cwd(), "shared", "scripts", "mo-knowledge-history.mjs");

const BUSINESS_ID = `§${"B-FIXTURE-01"}`;
const ARCHITECTURE_ID = `§${"A-FIXTURE-01"}`;
const MISSING_ARCHITECTURE_ID = `§${"A-MISSING-01"}`;
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function pinned(key) {
  const document = readFileSync(
    join(process.cwd(), "docs", "architecture", "knowledge-identifiers.md"),
    "utf8",
  );
  const blocks = fromMarkdown(document).children.filter(({ type }) => type === "code");
  const match = blocks
    .flatMap(({ value }) => value.split("\n"))
    .map((line) => line.match(new RegExp(`^${key}: ([a-f0-9]{40})$`, "u")))
    .find(Boolean);
  assert.ok(match, `§A-MEMORY-01 lost its structured ${key}`);
  return match[1];
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "mo-knowledge-history-"));
  roots.push(root);
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "fixture"]);
  mkdirSync(join(root, "docs", "architecture"), { recursive: true });
  writeFileSync(
    join(root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Original meaning\n\nRequirement.\n`,
  );
  writeFileSync(
    join(root, "docs", "architecture", "decision.md"),
    `# ${ARCHITECTURE_ID} — Decision\n\nServes ${BUSINESS_ID}.\n`,
  );
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "initial"]);
  return { root, cutoff: git(root, ["rev-parse", "HEAD"]).trim() };
}

function commit(root, message) {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", message]);
}

test("legacy editorial normalized literals but strict editorial keeps exact bytes", () => {
  const id = `§${"A-WHITESPACE-01"}`;
  const before = definitions(
    `# ${id} — Decision\n\n\`REVIEW-START version=1 status=unsupported\`\n`,
    "before.md",
  ).get(id);
  const after = definitions(
    `# ${id} — Решение\n\n\`REVIEW-START version=1\nstatus=unsupported\`\n`,
    "after.md",
  ).get(id);
  assert.notEqual(before.semantic, after.semantic);
  assert.equal(before.editorial, after.editorial);
  assert.notEqual(before.strictEditorial, after.strictEditorial);

  const fencedBefore = definitions(
    `# ${id} — Decision\n\n\`\`\`yaml\nrules:\n  allow: false\n\`\`\`\n`,
    "before.md",
  ).get(id);
  const fencedAfter = definitions(
    `# ${id} — Решение\n\n\`\`\`yaml\nrules: allow: false\n\`\`\`\n`,
    "after.md",
  ).get(id);
  assert.notEqual(fencedBefore.strictEditorial, fencedAfter.strictEditorial);
});

function realPins() {
  return {
    semanticFrom: pinned("semantic_enforcement_sha"),
    currentRecordFrom: pinned("current_record_enforcement_sha"),
    strictEditorialFrom: pinned("strict_editorial_enforcement_sha"),
  };
}

test("one run reads every object once and parses every document once", () => {
  const run = runHistory(process.cwd(), pinned("program_input_sha"), realPins());
  assert.deepEqual(run.errors, []);
  // Repetition, not volume, is what this budget forbids: the same document used
  // to be read and reparsed once per edge and per lookup that touched its
  // commit, so the cost grew with the graph rather than with the documents.
  assert.equal(run.stats.objectRequests, run.stats.uniqueObjects);
  assert.ok(
    run.stats.markdownParses <= run.stats.uniqueMarkdownBlobs,
    `${run.stats.markdownParses} parses for ${run.stats.uniqueMarkdownBlobs} documents`,
  );
  // Spawns answer the shape of the graph — boundaries, merges, batch rounds —
  // never one per commit, which is what a per-commit `git show` loop costs.
  assert.ok(
    run.stats.spawns < run.commits,
    `${run.stats.spawns} spawns for ${run.commits} commits`,
  );
});

test("--help answers the grammar without a repository, stdin or a cutoff", () => {
  const help = spawnSync(process.execPath, [CLI, "--help"], {
    cwd: tmpdir(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(help.status, 0);
  assert.equal(help.stderr, "");
  assert.match(help.stdout, /--cutoff <sha>/u);
  assert.match(help.stdout, /exit: 0 ok \| 1 violations or unavailable \| 2 call error/u);
});

test("pinned mode reads the four boundaries the decision itself records", () => {
  const path = join(process.cwd(), "docs", "architecture", "knowledge-identifiers.md");
  assert.deepEqual(historyPins(readFileSync(path, "utf8"), path), {
    cutoff: pinned("program_input_sha"),
    ...realPins(),
  });
});

test("a call error is exit two and never a silent pass", () => {
  const document = "docs/architecture/knowledge-identifiers.md";
  for (const argv of [
    [],
    ["--repo", "."],
    ["--cutoff"],
    ["--cutoff", "HEAD", "--nope"],
    ["--cutoff", "HEAD", "--cutoff", "HEAD"],
    // Neither mode may borrow from the other: a half-pinned run is unreviewable.
    ["--pins-from", document, "--cutoff", "HEAD"],
    ["--pins-from", "docs/glossary.md"],
    // An exemption cannot be audited when nothing was exempted.
    ["--cutoff", "HEAD", "--audit-exemptions"],
  ]) {
    const run = spawnSync(process.execPath, [CLI, ...argv], { encoding: "utf8" });
    assert.equal(run.status, 2, `${argv.join(" ")} should be a call error`);
    assert.equal(run.stdout, "");
  }
});

test("an audited exemption reports the edges it would have to cover", () => {
  const { root, cutoff } = fixture();
  writeFileSync(
    join(root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Rewritten meaning\n\nDifferent requirement.\n`,
  );
  commit(root, "unauthorized semantic change");
  const run = spawnSync(
    process.execPath,
    [CLI, "--repo", root, "--cutoff", cutoff, "--semantic-from", cutoff, "--audit-exemptions"],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 1);
  assert.match(run.stdout, /status=violations/u);
  assert.match(run.stderr, new RegExp(`semantic reuse ${BUSINESS_ID}`, "u"));
  assert.match(run.stderr, new RegExp(`^exemption_overreach: .*semantic reuse`, "mu"));
});

test("the status line reports the run and only measures when asked", () => {
  const cutoff = pinned("program_input_sha");
  const pins = realPins();
  const argv = [
    CLI,
    "--repo",
    ".",
    "--cutoff",
    cutoff,
    "--semantic-from",
    pins.semanticFrom,
    "--current-record-from",
    pins.currentRecordFrom,
    "--strict-editorial-from",
    pins.strictEditorialFrom,
  ];
  const quiet = spawnSync(process.execPath, argv, { encoding: "utf8" });
  assert.equal(quiet.status, 0);
  assert.match(
    quiet.stdout,
    new RegExp(
      `^MO-KNOWLEDGE-HISTORY/1 status=ok cutoff=${cutoff} commits=\\d+ edges=\\d+\\n$`,
      "u",
    ),
  );
  const timed = spawnSync(process.execPath, [...argv, "--timing"], { encoding: "utf8" });
  assert.match(timed.stdout, /ms=\d+ spawns=\d+ blobs=\d+\n$/u);
});

test("an unreadable object graph is unavailable, never a pass", () => {
  const { root, cutoff } = fixture();
  const run = runHistory(root, cutoff, { architecture: "docs/architecture" });
  assert.deepEqual(run.errors, []);
  rmSync(join(root, ".git", "objects"), { recursive: true, force: true });
  const broken = runHistory(root, cutoff);
  assert.ok(broken.unavailable, "a repository without objects cannot pass");
  assert.equal(broken.errors.length, 1);
  assert.match(broken.errors[0], /^history_unavailable: /u);
});

test("a citation no tree can resolve fails closed on the commit that made it", () => {
  const state = fixture();
  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Original meaning\n\nSee ${MISSING_ARCHITECTURE_ID}.\n`,
  );
  commit(state.root, "cite a decision that does not exist");
  assert.match(
    verifyHistory(state.root, state.cutoff).join("\n"),
    new RegExp(`broken reference ${MISSING_ARCHITECTURE_ID}`),
  );
  // Repairing it later must not erase the commit that was broken.
  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Original meaning\n\nRequirement.\n`,
  );
  commit(state.root, "drop the dangling citation");
  assert.match(
    verifyHistory(state.root, state.cutoff).join("\n"),
    new RegExp(`broken reference ${MISSING_ARCHITECTURE_ID}`),
  );
  assert.deepEqual(verifyHistory(state.root, git(state.root, ["rev-parse", "HEAD"]).trim()), []);
});

test("a merge cannot lose an id to a parent that branched before it existed", () => {
  const state = fixture();
  const newId = `§${"A-LATER-01"}`;
  git(state.root, ["switch", "-qc", "earlier"]);
  writeFileSync(join(state.root, "docs", "architecture", "earlier.md"), `# Earlier\n\nText.\n`);
  commit(state.root, "unrelated branch work");
  git(state.root, ["switch", "-q", "master"]);
  writeFileSync(
    join(state.root, "docs", "architecture", "later.md"),
    `# ${newId} — Later decision\n\nServes ${BUSINESS_ID}.\n`,
  );
  commit(state.root, "add a decision after the branch point");
  git(state.root, ["merge", "--no-ff", "--no-commit", "-q", "earlier"]);
  rmSync(join(state.root, "docs", "architecture", "later.md"));
  commit(state.root, "merge resolved in favour of the older branch");
  assert.match(
    verifyHistory(state.root, state.cutoff).join("\n"),
    new RegExp(`silent deletion ${newId}`),
  );
});

test("rename and merge DAG preserve ids without authorization", () => {
  const { root, cutoff } = fixture();
  git(root, ["mv", "docs/architecture/decision.md", "docs/architecture/renamed.md"]);
  commit(root, "rename decision");
  const base = git(root, ["rev-parse", "HEAD"]).trim();
  git(root, ["switch", "-qc", "side"]);
  writeFileSync(
    join(root, "docs", "architecture", "side.md"),
    `# §${"A-SIDE-01"} — Side\n\nServes ${BUSINESS_ID}.\n`,
  );
  commit(root, "add side decision");
  git(root, ["switch", "-q", "master"]);
  assert.equal(git(root, ["rev-parse", "HEAD"]).trim(), base);
  writeFileSync(
    join(root, "docs", "architecture", "main.md"),
    `# §${"A-MAIN-01"} — Main\n\nServes ${BUSINESS_ID}.\n`,
  );
  commit(root, "add main decision");
  git(root, ["merge", "--no-ff", "-qm", "merge side", "side"]);
  assert.deepEqual(verifyHistory(root, cutoff), []);
});

test("silent deletion and semantic reuse fail closed", () => {
  let state = fixture();
  writeFileSync(join(state.root, "docs", "business.md"), "# Business\n");
  commit(state.root, "delete without authorization");
  assert.match(verifyHistory(state.root, state.cutoff).join("\n"), /silent deletion/);

  state = fixture();
  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Different meaning\n\nChanged.\n`,
  );
  commit(state.root, "reuse without authorization");
  assert.match(verifyHistory(state.root, state.cutoff).join("\n"), /semantic reuse/);

  state = fixture();
  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Original meaning\n\nDifferent requirement with the same heading.\n`,
  );
  commit(state.root, "reuse body without changing heading");
  assert.match(verifyHistory(state.root, state.cutoff).join("\n"), /semantic reuse/);
});

test("a trailer works only through a same-commit architecture decision", () => {
  let state = fixture();
  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Different meaning\n\nChanged.\n`,
  );
  commit(
    state.root,
    `invalid trailer\n\nKnowledge-ID-Change: reuse ${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}`,
  );
  assert.match(verifyHistory(state.root, state.cutoff).join("\n"), /semantic reuse/);

  state = fixture();
  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Different meaning\n\nChanged.\n`,
  );
  writeFileSync(
    join(state.root, "docs", "architecture", "authorization.md"),
    `# ${MISSING_ARCHITECTURE_ID} — Authorization\n\n\`\`\`yaml\nknowledge_id_change:\n  action: reuse\n  id: ${BUSINESS_ID}\n  reason: The fixture meaning changed.\n  new_boundary: The id now names the replacement meaning.\n  references_updated: true\n\`\`\`\n`,
  );
  commit(
    state.root,
    `authorize reuse\n\nKnowledge-ID-Change: reuse ${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}`,
  );
  assert.deepEqual(verifyHistory(state.root, state.cutoff), []);
});

test("one editorial record covers exactly the changed ids on its parent edge", () => {
  const state = fixture();
  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Русский заголовок\n\nRequirement.\n`,
  );
  writeFileSync(
    join(state.root, "docs", "architecture", "decision.md"),
    `# ${ARCHITECTURE_ID} — Русский заголовок\n\nServes ${BUSINESS_ID}.\n`,
  );
  writeFileSync(
    join(state.root, "docs", "architecture", "authorization.md"),
    `# ${MISSING_ARCHITECTURE_ID} — Authorization\n\n\`\`\`yaml\nknowledge_id_change:\n  action: editorial\n  ids:\n    - ${ARCHITECTURE_ID}\n    - ${BUSINESS_ID}\n  reason: Human-facing headings now use the project language.\n  references_updated: true\n\`\`\`\n`,
  );
  const validMessage =
    `authorize editorial wording\n\nKnowledge-ID-Change: editorial ` +
    `${ARCHITECTURE_ID},${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}`;
  commit(state.root, validMessage);
  assert.deepEqual(verifyHistory(state.root, state.cutoff), []);

  const parent = git(state.root, ["rev-parse", "HEAD^"]).trim();
  const authorizationPath = join(state.root, "docs", "architecture", "authorization.md");
  const validAuthorization = readFileSync(authorizationPath, "utf8");
  writeFileSync(
    authorizationPath,
    validAuthorization.replace(
      "  references_updated: true",
      "  new_boundary: Editorial records must not claim a semantic boundary.\n  references_updated: true",
    ),
  );
  git(state.root, ["add", "-A"]);
  git(state.root, ["commit", "--amend", "-qm", validMessage]);
  let current = git(state.root, ["rev-parse", "HEAD"]).trim();
  assert.deepEqual(edgeViolations(state.root, parent, current), [
    `${parent}..${current}: semantic reuse ${ARCHITECTURE_ID}`,
    `${parent}..${current}: semantic reuse ${BUSINESS_ID}`,
  ]);

  writeFileSync(authorizationPath, validAuthorization);
  git(state.root, ["add", "-A"]);
  git(state.root, ["commit", "--amend", "-qm", validMessage.replace(`,${BUSINESS_ID}`, "")]);
  current = git(state.root, ["rev-parse", "HEAD"]).trim();
  assert.deepEqual(edgeViolations(state.root, parent, current), [
    `${parent}..${current}: semantic reuse ${ARCHITECTURE_ID}`,
    `${parent}..${current}: semantic reuse ${BUSINESS_ID}`,
  ]);
});

test("editorial authorization preserves literals and cannot remove an id", () => {
  let state = fixture();
  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Русский заголовок\n\nRequirement with \`new literal\`.\n`,
  );
  writeFileSync(
    join(state.root, "docs", "architecture", "authorization.md"),
    `# ${MISSING_ARCHITECTURE_ID} — Authorization\n\n\`\`\`yaml\nknowledge_id_change:\n  action: editorial\n  ids:\n    - ${BUSINESS_ID}\n  reason: Human-facing wording changed.\n  references_updated: true\n\`\`\`\n`,
  );
  commit(
    state.root,
    `change a literal\n\nKnowledge-ID-Change: editorial ${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}`,
  );
  assert.match(verifyHistory(state.root, state.cutoff).join("\n"), /semantic reuse/);

  state = fixture();
  writeFileSync(join(state.root, "docs", "business.md"), "# Business\n");
  writeFileSync(
    join(state.root, "docs", "architecture", "authorization.md"),
    `# ${MISSING_ARCHITECTURE_ID} — Authorization\n\n\`\`\`yaml\nknowledge_id_change:\n  action: editorial\n  ids:\n    - ${BUSINESS_ID}\n  reason: Human-facing wording changed.\n  references_updated: true\n\`\`\`\n`,
  );
  commit(
    state.root,
    `hide a deletion\n\nKnowledge-ID-Change: editorial ${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}`,
  );
  assert.match(verifyHistory(state.root, state.cutoff).join("\n"), /silent deletion/);
});

test("editorial authorization cannot change normative prose", () => {
  const state = fixture();
  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Original meaning\n\nThe agent may skip the required check.\n`,
  );
  writeFileSync(
    join(state.root, "docs", "architecture", "authorization.md"),
    `# ${MISSING_ARCHITECTURE_ID} — Authorization\n\n\`\`\`yaml\nknowledge_id_change:\n  action: editorial\n  ids:\n    - ${BUSINESS_ID}\n  reason: Human-facing wording changed.\n  references_updated: true\n\`\`\`\n`,
  );
  commit(
    state.root,
    `weaken prose\n\nKnowledge-ID-Change: editorial ${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}`,
  );
  const parent = git(state.root, ["rev-parse", "HEAD^"]).trim();
  const current = git(state.root, ["rev-parse", "HEAD"]).trim();
  assert.deepEqual(edgeViolations(state.root, parent, current, [], true, true, false), []);
  assert.match(verifyHistory(state.root, state.cutoff).join("\n"), /semantic reuse/);
});

test("editorial cannot cover an id excluded by an incomplete reuse trailer", () => {
  const state = fixture();
  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Different meaning\n\nDifferent requirement.\n`,
  );
  writeFileSync(
    join(state.root, "docs", "architecture", "decision.md"),
    `# ${ARCHITECTURE_ID} — Русский заголовок\n\nServes ${BUSINESS_ID}.\n`,
  );
  writeFileSync(
    join(state.root, "docs", "architecture", "authorization.md"),
    `# ${MISSING_ARCHITECTURE_ID} — Authorization\n\n\`\`\`yaml\nknowledge_id_change:\n  action: editorial\n  ids:\n    - ${ARCHITECTURE_ID}\n  reason: The decision heading changed.\n  references_updated: true\n\`\`\`\n`,
  );
  commit(
    state.root,
    `put editorial before incomplete reuse\n\n` +
      `Knowledge-ID-Change: editorial ${ARCHITECTURE_ID} via ${MISSING_ARCHITECTURE_ID}\n` +
      `Knowledge-ID-Change: reuse ${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}`,
  );
  assert.match(
    verifyHistory(state.root, state.cutoff).join("\n"),
    new RegExp(`semantic reuse ${BUSINESS_ID}`),
  );
});

test("authorization history is append-only", () => {
  const state = fixture();
  const authorizationPath = join(state.root, "docs", "architecture", "authorization.md");
  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Second meaning\n\nSecond requirement.\n`,
  );
  writeFileSync(
    authorizationPath,
    `# ${MISSING_ARCHITECTURE_ID} — Authorization\n\n\`\`\`yaml\nknowledge_id_change:\n  action: reuse\n  id: ${BUSINESS_ID}\n  reason: The requirement changed.\n  new_boundary: The id names the second requirement.\n  references_updated: true\n\`\`\`\n`,
  );
  commit(
    state.root,
    `authorize second meaning\n\nKnowledge-ID-Change: reuse ${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}`,
  );
  writeFileSync(
    authorizationPath,
    readFileSync(authorizationPath, "utf8").replace(
      "The requirement changed.",
      "A rewritten historical reason.",
    ),
  );
  commit(state.root, "rewrite authorization history");
  const parent = git(state.root, ["rev-parse", "HEAD^"]).trim();
  const current = git(state.root, ["rev-parse", "HEAD"]).trim();
  assert.deepEqual(edgeViolations(state.root, parent, current, [], true, true, false), []);
  assert.match(verifyHistory(state.root, state.cutoff).join("\n"), /authorization history changed/);
});

test("editorial and semantic reuse can share one parent edge", () => {
  const state = fixture();
  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — New boundary\n\nDifferent requirement.\n`,
  );
  writeFileSync(
    join(state.root, "docs", "architecture", "decision.md"),
    `# ${ARCHITECTURE_ID} — Русский заголовок\n\nServes ${BUSINESS_ID}.\n`,
  );
  writeFileSync(
    join(state.root, "docs", "architecture", "authorization.md"),
    `# ${MISSING_ARCHITECTURE_ID} — Authorization\n\n\`\`\`yaml\nknowledge_id_changes:\n  - action: reuse\n    id: ${BUSINESS_ID}\n    reason: The fixture requirement changed meaning.\n    new_boundary: The id now names the replacement requirement.\n    references_updated: true\n  - action: editorial\n    ids:\n      - ${ARCHITECTURE_ID}\n    reason: The decision heading now uses the project language.\n    references_updated: true\n\`\`\`\n`,
  );
  commit(
    state.root,
    `mix semantic and editorial changes\n\n` +
      `Knowledge-ID-Change: reuse ${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}\n` +
      `Knowledge-ID-Change: editorial ${ARCHITECTURE_ID} via ${MISSING_ARCHITECTURE_ID}`,
  );
  assert.deepEqual(verifyHistory(state.root, state.cutoff), []);
});

test("sequential reuse requires distinct records on the current parent edge", () => {
  const state = fixture();
  const authorizationPath = join(state.root, "docs", "architecture", "authorization.md");
  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Second meaning\n\nSecond requirement.\n`,
  );
  writeFileSync(
    authorizationPath,
    `# ${MISSING_ARCHITECTURE_ID} — Authorization\n\nInitial policy.\n\n\`\`\`yaml\nknowledge_id_changes:\n  - action: reuse\n    id: ${BUSINESS_ID}\n    reason: The fixture gained its second meaning.\n    new_boundary: The id names the second requirement.\n    references_updated: true\n  - action: reuse\n    id: ${MISSING_ARCHITECTURE_ID}\n    reason: The fixture reserves a self-reuse record.\n    new_boundary: The decision initially authorizes the second meaning.\n    references_updated: true\n\`\`\`\n`,
  );
  commit(
    state.root,
    `authorize second meaning\n\nKnowledge-ID-Change: reuse ${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}`,
  );
  const parent = git(state.root, ["rev-parse", "HEAD"]).trim();

  writeFileSync(
    join(state.root, "docs", "business.md"),
    `# Business\n\n### ${BUSINESS_ID} — Third meaning\n\nThird requirement.\n`,
  );
  writeFileSync(
    authorizationPath,
    readFileSync(authorizationPath, "utf8").replace("Initial policy.", "Revised policy."),
  );
  const message =
    `reuse stale records\n\nKnowledge-ID-Change: reuse ${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}\n` +
    `Knowledge-ID-Change: reuse ${MISSING_ARCHITECTURE_ID} via ${MISSING_ARCHITECTURE_ID}`;
  commit(state.root, message);
  let current = git(state.root, ["rev-parse", "HEAD"]).trim();
  assert.deepEqual(edgeViolations(state.root, parent, current), [
    `${parent}..${current}: semantic reuse ${MISSING_ARCHITECTURE_ID}`,
    `${parent}..${current}: semantic reuse ${BUSINESS_ID}`,
  ]);

  writeFileSync(
    authorizationPath,
    readFileSync(authorizationPath, "utf8").replace(
      "```\n",
      `  - action: reuse\n    id: ${BUSINESS_ID}\n    reason: The fixture gained its third meaning.\n    new_boundary: The id names the third requirement.\n    references_updated: true\n  - action: reuse\n    id: ${MISSING_ARCHITECTURE_ID}\n    reason: The authorization policy changed with the third meaning.\n    new_boundary: The decision now authorizes only a distinct current record.\n    references_updated: true\n\`\`\`\n`,
    ),
  );
  git(state.root, ["add", "-A"]);
  git(state.root, ["commit", "--amend", "-qm", message]);
  current = git(state.root, ["rev-parse", "HEAD"]).trim();
  assert.deepEqual(edgeViolations(state.root, parent, current), []);
  assert.deepEqual(verifyHistory(state.root, state.cutoff), []);
});

test("an authorized branch deletion survives a no-ff merge without a merge trailer", () => {
  const state = fixture();
  git(state.root, ["switch", "-qc", "remove-id"]);
  writeFileSync(join(state.root, "docs", "business.md"), "# Business\n");
  // `references_updated: true` has to be true: the citing decision loses the
  // citation in the same commit, or the reference check reports it.
  writeFileSync(
    join(state.root, "docs", "architecture", "decision.md"),
    `# ${ARCHITECTURE_ID} — Decision\n\nServes nothing.\n`,
  );
  writeFileSync(
    join(state.root, "docs", "architecture", "authorization.md"),
    `# ${MISSING_ARCHITECTURE_ID} — Authorization\n\n\`\`\`yaml\nknowledge_id_changes:\n  - action: remove\n    id: ${BUSINESS_ID}\n    reason: The fixture requirement is obsolete.\n    new_boundary: No replacement requirement remains.\n    references_updated: true\n  - action: reuse\n    id: ${ARCHITECTURE_ID}\n    reason: The decision loses the requirement it used to serve.\n    new_boundary: The decision now stands on its own.\n    references_updated: true\n\`\`\`\n`,
  );
  commit(
    state.root,
    `authorize deletion\n\nKnowledge-ID-Change: remove ${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}\n` +
      `Knowledge-ID-Change: reuse ${ARCHITECTURE_ID} via ${MISSING_ARCHITECTURE_ID}`,
  );
  git(state.root, ["switch", "-q", "master"]);
  writeFileSync(
    join(state.root, "docs", "architecture", "main.md"),
    `# §${"A-MAIN-02"} — Main\n\nServes nothing.\n`,
  );
  commit(state.root, "unrelated main change");
  git(state.root, ["merge", "--no-ff", "-qm", "merge authorized deletion", "remove-id"]);
  assert.deepEqual(verifyHistory(state.root, state.cutoff), []);
});

test("an unreachable cutoff reports history_unavailable", () => {
  const { root } = fixture();
  assert.match(verifyHistory(root, "0".repeat(40)).join("\n"), /history_unavailable/);
});

test("a resolvable sibling cannot act as a history boundary", () => {
  const { root, cutoff } = fixture();
  git(root, ["switch", "-qc", "sibling"]);
  writeFileSync(join(root, "docs", "architecture", "sibling.md"), "# Sibling\n");
  commit(root, "sibling boundary candidate");
  const sibling = git(root, ["rev-parse", "HEAD"]).trim();
  git(root, ["switch", "-q", "master"]);

  assert.match(verifyHistory(root, sibling).join("\n"), /cutoff .* is unreachable/u);
  assert.match(
    verifyHistory(root, cutoff, sibling).join("\n"),
    /semantic boundary .* is unreachable/u,
  );
  assert.match(
    verifyHistory(root, cutoff, null, sibling).join("\n"),
    /current-record boundary .* is unreachable/u,
  );
  assert.match(
    verifyHistory(root, cutoff, null, null, sibling).join("\n"),
    /strict-editorial boundary .* is unreachable/u,
  );
  assert.deepEqual(verifyHistory(root, cutoff, cutoff, cutoff), []);
});
