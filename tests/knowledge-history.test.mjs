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

import { git, verifyHistory } from "../tools/knowledge-history.mjs";

const BUSINESS_ID = `§${"B-FIXTURE-01"}`;
const ARCHITECTURE_ID = `§${"A-FIXTURE-01"}`;
const MISSING_ARCHITECTURE_ID = `§${"A-MISSING-01"}`;
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function programInputSha() {
  const document = readFileSync(
    join(process.cwd(), "docs", "architecture", "knowledge-identifiers.md"),
    "utf8",
  );
  const blocks = fromMarkdown(document).children.filter(({ type }) => type === "code");
  const match = blocks
    .flatMap(({ value }) => value.split("\n"))
    .map((line) => line.match(/^program_input_sha: ([a-f0-9]{40})$/u))
    .find(Boolean);
  assert.ok(match, "§A-MEMORY-01 lost its structured program_input_sha");
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

test("the real history is reachable and valid from program input", () => {
  assert.deepEqual(verifyHistory(process.cwd(), programInputSha()), []);
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

test("an authorized branch deletion survives a no-ff merge without a merge trailer", () => {
  const state = fixture();
  git(state.root, ["switch", "-qc", "remove-id"]);
  writeFileSync(join(state.root, "docs", "business.md"), "# Business\n");
  writeFileSync(
    join(state.root, "docs", "architecture", "authorization.md"),
    `# ${MISSING_ARCHITECTURE_ID} — Authorization\n\n\`\`\`yaml\nknowledge_id_change:\n  action: remove\n  id: ${BUSINESS_ID}\n  reason: The fixture requirement is obsolete.\n  new_boundary: No replacement requirement remains.\n  references_updated: true\n\`\`\`\n`,
  );
  commit(
    state.root,
    `authorize deletion\n\nKnowledge-ID-Change: remove ${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}`,
  );
  git(state.root, ["switch", "-q", "master"]);
  writeFileSync(
    join(state.root, "docs", "architecture", "main.md"),
    "# §A-MAIN-02 — Main\n\nServes nothing.\n",
  );
  commit(state.root, "unrelated main change");
  git(state.root, ["merge", "--no-ff", "-qm", "merge authorized deletion", "remove-id"]);
  assert.deepEqual(verifyHistory(state.root, state.cutoff), []);
});

test("an unreachable cutoff reports history_unavailable", () => {
  const { root } = fixture();
  assert.match(verifyHistory(root, "0".repeat(40)).join("\n"), /history_unavailable/);
});
