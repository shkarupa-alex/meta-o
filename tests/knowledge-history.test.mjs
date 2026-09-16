/**
 * Exercise historical identifier integrity through real Git object graphs.
 *
 * Protects §A-MEMORY-01.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { fromMarkdown } from "mdast-util-from-markdown";

import { definitions, edgeViolations, git, verifyHistory } from "../tools/knowledge-history.mjs";

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

test("editorial surfaces normalize whitespace inside exact literals", () => {
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
});

test("the real history is reachable and valid from program input", () => {
  const cutoff = pinned("program_input_sha");
  const boundary = pinned("semantic_enforcement_sha");
  const currentRecordBoundary = pinned("current_record_enforcement_sha");
  const strictEditorialBoundary = pinned("strict_editorial_enforcement_sha");
  assert.deepEqual(
    verifyHistory(process.cwd(), cutoff, boundary, currentRecordBoundary, strictEditorialBoundary),
    [],
  );
  // The declared boundary has to be the whole exemption: every edge from it
  // onwards must survive semantic enforcement on its own.
  assert.deepEqual(
    verifyHistory(process.cwd(), boundary, null, currentRecordBoundary, strictEditorialBoundary),
    [],
  );
  // And the exemption may not quietly cover anything after the boundary.
  for (const error of verifyHistory(
    process.cwd(),
    cutoff,
    null,
    currentRecordBoundary,
    strictEditorialBoundary,
  )) {
    const [parent] = error.split("..");
    assert.equal(
      git(process.cwd(), ["merge-base", "--is-ancestor", boundary, parent], true),
      null,
      `exempted edge is not before the boundary: ${error}`,
    );
  }
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
