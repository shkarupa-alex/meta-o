/**
 * Exercise historical identifier integrity through real Git object graphs.
 *
 * Protects §A-MEMORY-01.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { git, verifyHistory } from "../tools/knowledge-history.mjs";

const PROGRAM_INPUT_SHA = "75a95f87efe6cea53167fa3f8d8c3b09a7c7ad96";
const BUSINESS_ID = `§${"B-FIXTURE-01"}`;
const ARCHITECTURE_ID = `§${"A-FIXTURE-01"}`;
const MISSING_ARCHITECTURE_ID = `§${"A-MISSING-01"}`;
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

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
  assert.deepEqual(verifyHistory(process.cwd(), PROGRAM_INPUT_SHA), []);
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
    `# ${MISSING_ARCHITECTURE_ID} — Authorization\n\n${MISSING_ARCHITECTURE_ID} changes ${BUSINESS_ID} because its meaning changed.\n`,
  );
  commit(
    state.root,
    `authorize reuse\n\nKnowledge-ID-Change: reuse ${BUSINESS_ID} via ${MISSING_ARCHITECTURE_ID}`,
  );
  assert.deepEqual(verifyHistory(state.root, state.cutoff), []);
});

test("an unreachable cutoff reports history_unavailable", () => {
  const { root } = fixture();
  assert.match(verifyHistory(root, "0".repeat(40)).join("\n"), /history_unavailable/);
});
