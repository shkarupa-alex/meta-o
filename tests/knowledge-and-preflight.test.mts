/**
 * §M-TEST-KNOWLEDGE — Acceptance tests for the knowledge layer, spec input and preflight.
 *
 * Covers the §10 and §00 acceptance lists: duplicate and dangling anchors are
 * found, a level may not skip its nearest parent, an immutable spec that
 * changed is refused rather than adopted, and a project missing its contract
 * routes to `PAUSED_MISSING_TOOLS` instead of starting.
 *
 * Verifies §A-CAUSAL-KNOWLEDGE and §A-IMMUTABLE-SPEC.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  buildAnchorIndex,
  businessAnchors,
  parseDocument,
  referencesIn,
  validateChain,
} from "../dist/core/knowledge.mjs";
import { redact, redactDeep } from "../dist/core/redact.mjs";
import {
  SpecMutatedError,
  assertSpecUnchanged,
  resolveTrackedSpecPath,
  sanitizeLocator,
} from "../dist/core/spec-input.mjs";
import { declaredMakeTargets, runPreflight } from "../dist/core/preflight.mjs";
import { createTempRepo, sampleBusinessKnowledge, seedProjectContract } from "./helpers.mts";
import { join } from "node:path";

/** §M-TEST-KNOWLEDGE — An architecture document citing a business anchor. */
const ARCHITECTURE = [
  "# Architecture",
  "",
  "## §A-BOOT-01 — A single supervised entry point",
  "",
  "Implements §B-CORE-01. One entry point keeps startup ordering checkable.",
  "",
].join("\n");

test("anchors are read from headings, not from prose or code fences", () => {
  const document = [
    "# Title",
    "",
    "## §B-REAL-01 — a real anchor",
    "",
    "This paragraph mentions §B-MENTIONED-02 without defining it.",
    "",
    "```text",
    "## §B-FENCED-03 — not a definition",
    "```",
    "",
  ].join("\n");

  const sections = parseDocument("business.md", document);
  assert.deepEqual(
    sections.map((section) => section.anchor),
    ["§B-REAL-01"],
  );
  assert.ok(sections[0]!.references.includes("§B-MENTIONED-02"));
});

test("references are collected from arbitrary text", () => {
  assert.deepEqual(referencesIn("see §A-ONE-01 and §M-TWO-02 and §A-ONE-01"), [
    "§A-ONE-01",
    "§M-TWO-02",
  ]);
});

test("duplicate anchors are reported with both locations", () => {
  const index = buildAnchorIndex([
    { path: "docs/knowledge/business.md", text: "## §B-DUP-01 — first\n\n## §B-DUP-01 — second\n" },
  ]);
  const validation = validateChain(index);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("duplicate anchor §B-DUP-01")));
  assert.ok(validation.errors.some((error) => error.includes("docs/knowledge/business.md:1")));
});

test("an architecture anchor that cites no business anchor fails", () => {
  const index = buildAnchorIndex([
    { path: "docs/knowledge/business.md", text: sampleBusinessKnowledge() },
    { path: "docs/knowledge/architecture/main.md", text: "## §A-ORPHAN-01 — floating\n\nNo citation here.\n" },
  ]);
  const validation = validateChain(index);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("does not cite any §B-*")));
});

test("a dangling reference is reported", () => {
  const index = buildAnchorIndex([
    { path: "docs/knowledge/architecture/main.md", text: "## §A-BOOT-01 — boot\n\nImplements §B-ABSENT-99.\n" },
  ]);
  const validation = validateChain(index);
  assert.ok(validation.errors.some((error) => error.includes("unknown §B-ABSENT-99")));
});

test("a valid chain from business to architecture to module passes", () => {
  const index = buildAnchorIndex([
    { path: "docs/knowledge/business.md", text: sampleBusinessKnowledge() },
    { path: "docs/knowledge/architecture/main.md", text: ARCHITECTURE },
  ]);
  const validation = validateChain(index, [
    { anchor: "§M-BOOT", path: "src/boot.py", references: ["§A-BOOT-01"] },
  ]);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.ok, true);
});

test("a module citing business directly instead of its nearest level fails", () => {
  const index = buildAnchorIndex([
    { path: "docs/knowledge/business.md", text: sampleBusinessKnowledge() },
    { path: "docs/knowledge/architecture/main.md", text: ARCHITECTURE },
  ]);
  const validation = validateChain(index, [
    { anchor: "§M-SKIP", path: "src/skip.py", references: ["§B-CORE-01"] },
  ]);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("nearest §A-* level")));
});

test("business anchors are exposed for E2E link checking", () => {
  const index = buildAnchorIndex([{ path: "docs/knowledge/business.md", text: sampleBusinessKnowledge() }]);
  assert.deepEqual([...businessAnchors(index)].sort(), ["§B-CHECKOUT-01", "§B-CORE-01"]);
});

test("a business anchor defined outside the business document is refused", () => {
  const index = buildAnchorIndex([
    { path: "docs/knowledge/business.md", text: sampleBusinessKnowledge() },
    {
      path: "docs/knowledge/architecture/main.md",
      text: `${ARCHITECTURE}\n## §B-SNEAKY-02 — smuggled business truth\n\nDefined in the wrong file.\n`,
    },
  ]);
  const validation = validateChain(index);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("§B-SNEAKY-02 is defined outside")));
  assert.equal(businessAnchors(index).has("§B-SNEAKY-02"), false);
});

test("a malformed anchor is a failure, not a silent non-match", () => {
  const index = buildAnchorIndex([
    {
      path: "docs/knowledge/business.md",
      text: "## §B-CORE-01 — truth\n\nSee §b-lower-01 and §B-BAD_ANCHOR.\n",
    },
  ]);
  const validation = validateChain(index);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("malformed anchor §b-lower-01")));
  assert.ok(validation.errors.some((error) => error.includes("malformed anchor §B-BAD_ANCHOR")));
});

test("the same module anchor declared twice is refused", () => {
  const index = buildAnchorIndex([
    { path: "docs/knowledge/business.md", text: sampleBusinessKnowledge() },
    { path: "docs/knowledge/architecture/main.md", text: ARCHITECTURE },
  ]);
  const validation = validateChain(index, [
    { anchor: "§M-BOOT", path: "src/a.py", references: ["§A-BOOT-01"] },
    { anchor: "§M-BOOT", path: "src/b.py", references: ["§A-BOOT-01"] },
  ]);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("duplicate module anchor §M-BOOT")));
});

test("credentials are removed from text before it leaves the machine", () => {
  const text = [
    "ANTHROPIC_API_KEY=sk-abcdefghijklmnopqrstuvwxyz012345",
    'https://user:hunter2@example.com/repo.git',
    "AWS key AKIAIOSFODNN7EXAMPLE",
    "normal text stays",
  ].join("\n");
  const redacted = redact(text);

  assert.ok(!redacted.includes("sk-abcdefghijklmnopqrstuvwxyz012345"));
  assert.ok(!redacted.includes("hunter2"));
  assert.ok(!redacted.includes("AKIAIOSFODNN7EXAMPLE"));
  assert.ok(redacted.includes("normal text stays"));
});

test("nested structures are redacted without losing their shape", () => {
  const payload = {
    findings: [{ detail: "token=ghp_abcdefghijklmnopqrstuvwxyz0123", severity: "major" }],
  };
  const redacted = redactDeep(payload);
  assert.equal(redacted.findings[0]!.severity, "major");
  assert.ok(!JSON.stringify(redacted).includes("ghp_abcdefghijklmnopqrstuvwxyz0123"));
});

test("a spec whose bytes changed is refused, not adopted", () => {
  assertSpecUnchanged("a".repeat(64), "a".repeat(64));
  assert.throws(
    () => assertSpecUnchanged("a".repeat(64), "b".repeat(64)),
    (error: unknown) => error instanceof SpecMutatedError,
  );
});

test("URL credentials and query secrets are stripped from stored locators", () => {
  const sanitized = sanitizeLocator("https://user:pass@example.com/spec.md?token=abc#frag");
  assert.ok(!sanitized.includes("pass"));
  assert.ok(!sanitized.includes("abc"));
  assert.ok(!sanitized.includes("#frag"));
  assert.ok(sanitized.startsWith("https://"));
});

test("a tracked spec locator cannot escape the repository", () => {
  assert.throws(
    () => resolveTrackedSpecPath("/repo", "../../etc/passwd"),
    /escapes the repository/,
  );
  assert.equal(resolveTrackedSpecPath("/repo", "spec/feature.md"), "/repo/spec/feature.md");
});

test("Make targets are read statically, including through one level of include", () => {
  const repo = createTempRepo();
  try {
    repo.write("common.mk", "lint:\n\t@true\n");
    repo.write(
      "Makefile",
      ["include common.mk", "", ".PHONY: qc", "qc: lint test", "\t@true", "", "test:", "\t@true", ""].join("\n"),
    );
    const targets = declaredMakeTargets(join(repo.dir, "Makefile"));
    assert.ok(targets.has("qc"));
    assert.ok(targets.has("test"));
    assert.ok(targets.has("lint"), "included makefiles contribute targets");
  } finally {
    repo.dispose();
  }
});

test("a complete project contract passes preflight", () => {
  const repo = createTempRepo();
  try {
    seedProjectContract(repo);
    repo.commit("seed contract");
    const report = runPreflight({ repoDir: repo.dir });
    assert.deepEqual(
      report.checks.filter((check) => check.blocking && check.status !== "ok"),
      [],
    );
    assert.equal(report.ok, true);
    assert.equal(report.recommendedPhase, "EXECUTING");
  } finally {
    repo.dispose();
  }
});

test("a missing qc target routes to PAUSED_MISSING_TOOLS with a remedy", () => {
  const repo = createTempRepo();
  try {
    seedProjectContract(repo);
    repo.write("Makefile", "build:\n\t@true\n");
    repo.commit("seed contract without qc");

    const report = runPreflight({ repoDir: repo.dir });
    assert.equal(report.ok, false);
    assert.equal(report.recommendedPhase, "PAUSED_MISSING_TOOLS");
    const makefile = report.checks.find((check) => check.id === "makefile");
    assert.equal(makefile?.status, "invalid");
    assert.ok(makefile?.remedy);
  } finally {
    repo.dispose();
  }
});

test("a dirty worktree blocks preflight", () => {
  const repo = createTempRepo();
  try {
    seedProjectContract(repo);
    repo.commit("seed contract");
    repo.write("scratch.txt", "uncommitted");

    const report = runPreflight({ repoDir: repo.dir });
    assert.equal(report.ok, false);
    assert.equal(report.checks.find((check) => check.id === "clean-worktree")?.status, "invalid");
  } finally {
    repo.dispose();
  }
});

test("a scenario linked to an undefined business anchor blocks preflight", () => {
  const repo = createTempRepo();
  try {
    seedProjectContract(repo);
    repo.write("docs/knowledge/business.md", "# Business\n\n## §B-CORE-01 — only this one\n\nText.\n");
    repo.commit("seed contract with a missing anchor");

    const report = runPreflight({ repoDir: repo.dir });
    assert.equal(report.ok, false);
    const links = report.checks.find((check) => check.id === "e2e-business-links");
    assert.equal(links?.status, "invalid");
    assert.match(links!.detail, /§B-CHECKOUT-01/);
  } finally {
    repo.dispose();
  }
});

test("a missing verify-e2e-metadata target warns without blocking", () => {
  const repo = createTempRepo();
  try {
    seedProjectContract(repo);
    repo.write("Makefile", "qc:\n\t@true\n");
    repo.commit("seed contract");

    const report = runPreflight({ repoDir: repo.dir });
    const check = report.checks.find((item) => item.id === "verify-e2e-metadata");
    assert.equal(check?.status, "missing");
    assert.equal(check?.blocking, false);
    assert.equal(report.ok, true);
  } finally {
    repo.dispose();
  }
});

test("a fence inside a fence does not swallow the document", () => {
  // The knowledge reader toggled a boolean on any line starting with three
  // backticks or three tildes. A four-backtick block wrapping a three-backtick
  // example therefore "closed" at the inner line, and everything after it read
  // as prose — inverted, so the *next* real fence opened one. The anchor that
  // fell inside the phantom fence vanished from the index: its own "must cite a
  // §B" check never ran, and any §M citing it failed for referencing an anchor
  // that does exist. The contract gate had a CommonMark-accurate scanner all
  // along; the two now share it.
  const documents: Array<[string, string]> = [
    [
      "a longer fence wrapping a shorter one",
      "## §A-ONE — first\n\nImplements §B-CORE-01.\n\n````\n```\nexample\n```\n````\n\n## §A-TWO — second\n\nImplements §B-CORE-01.\n",
    ],
    [
      "a tilde fence wrapping a backtick one",
      "## §A-ONE — first\n\nImplements §B-CORE-01.\n\n~~~\n```\nexample\n```\n~~~\n\n## §A-TWO — second\n\nImplements §B-CORE-01.\n",
    ],
  ];

  for (const [what, text] of documents) {
    const index = buildAnchorIndex([
      { path: "docs/knowledge/business.md", text: sampleBusinessKnowledge() },
      { path: "docs/knowledge/architecture/main.md", text },
    ]);
    const anchors = index.sections
      .filter((section) => section.level === "architecture")
      .map((section) => section.anchor);
    assert.deepEqual(anchors, ["§A-ONE", "§A-TWO"], what);
    assert.equal(validateChain(index).ok, true, `${what} must leave a sound chain`);
  }

  // A closing line carrying an info string does not close anything — that is
  // CommonMark, and it is why this is a shared scanner rather than a second
  // guess. The heading after it is inside the still-open fence, and a reader
  // that indexed it would be inventing an anchor nobody wrote.
  const unclosed = buildAnchorIndex([
    {
      path: "docs/knowledge/architecture/main.md",
      text: "## §A-ONE — first\n\nImplements §B-CORE-01.\n\n```\nexample\n```markdown\n\n## §A-TWO — second\n",
    },
  ]);
  assert.deepEqual(
    unclosed.sections.map((section) => section.anchor),
    ["§A-ONE"],
  );

  // And a real fence still hides what is inside it, or the fix would be a
  // scanner that has stopped scanning.
  const hidden = buildAnchorIndex([
    {
      path: "docs/knowledge/architecture/main.md",
      text: "```\n## §A-EXAMPLE-01 — not a real anchor\n```\n",
    },
  ]);
  assert.deepEqual(hidden.sections, []);
});
