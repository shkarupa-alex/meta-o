/**
 * Verify the installed CLI help snapshots that constrain Issue and Orca calls.
 *
 * The fixtures are bounded observations rather than a native-CLI proxy. They
 * protect §A-ISSUE-01, §A-SESSION-01 and §A-DELIVERY-01.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const fixture = (name) =>
  readFileSync(join(ROOT, "tests", "fixtures", "recorded-surfaces", name), "utf8");

test("recorded GitHub surfaces preserve asymmetric issue search and body files", () => {
  const help = fixture("gh-2.96.0.fixture");
  assert.match(help, /\[issue list\][\s\S]*\{open\|closed\|all\}[\s\S]*stateReason/u);
  assert.match(help, /\[search issues\][\s\S]*\{open\|closed\}[\s\S]*ABSENT: stateReason/u);
  assert.match(help, /\[issue create\][\s\S]*--body-file/u);
  assert.match(help, /\[issue comment\][\s\S]*--body-file/u);
});

test("recorded GitLab surfaces preserve pagination and safe body capabilities", () => {
  const help = fixture("glab-1.117.0.fixture");
  assert.match(help, /\[issue list\][\s\S]*--all[\s\S]*--closed[\s\S]*--per-page/u);
  assert.match(help, /ABSENT: --state/u);
  assert.match(help, /\[issue create\][\s\S]*--description-file/u);
  assert.match(help, /\[issue note\][\s\S]*ABSENT: --body-file/u);
  assert.match(help, /\[api\][\s\S]*--input[\s\S]*--header/u);
});

test("recorded Orca surfaces expose both guides and owned-resource operations", () => {
  const help = fixture("orca-installed.fixture");
  assert.match(help, /topic: orchestration/u);
  assert.match(help, /topic: orca-cli/u);
  for (const section of ["project", "repo", "worktree", "terminal", "orchestration"]) {
    assert.match(help, new RegExp(`\\[${section}\\]`));
  }
  assert.match(help, /worker-list[\s\S]*worker-release[\s\S]*check[\s\S]*reply/u);
  assert.doesNotMatch(help, /markdown_bytes: 0/u);
});
