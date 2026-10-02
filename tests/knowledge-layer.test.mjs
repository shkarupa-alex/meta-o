/**
 * Hold the knowledge-layer states: one answer per candidate, read from its
 * tracked files and, for "never", its whole first-parent history.
 *
 * Protects §A-MEMORY-05.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { knowledgeLayer, knowledgeLayerLine } from "../shared/scripts/mo-knowledge-layer.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = join(ROOT, "shared", "scripts", "mo-knowledge-layer.mjs");
const scratch = [];
after(() => scratch.forEach((path) => rmSync(path, { recursive: true, force: true })));

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function repository() {
  const root = mkdtempSync(join(tmpdir(), "mo-layer-"));
  scratch.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "user.name", "Fixture");
  return root;
}

/** Write the files, delete the `null` ones, commit, return the SHA. */
function commit(root, files) {
  for (const [path, text] of Object.entries(files)) {
    const absolute = join(root, path);
    if (text === null) rmSync(absolute, { force: true });
    else {
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, text);
    }
  }
  git(root, "add", "-A");
  git(root, "commit", "-q", "--allow-empty", "-m", "fixture");
  return git(root, "rev-parse", "HEAD");
}

const LAYER = {
  Makefile: "closure:\n\tnode tools/mo-backlog.mjs  # MO-BACKLOG/1\n",
  "AGENTS.md":
    "# Project\n\n```yaml\nhistory_cutoff_sha: 0000000000000000000000000000000000000000\n```\n",
  "docs/papercut.md": "# Papercuts\n",
};

const answer = (root, sha) => knowledgeLayer(root, sha);

test("all three signals make the layer enabled, with or without the marker", () => {
  const root = repository();
  assert.deepEqual(answer(root, commit(root, LAYER)), {
    state: "enabled",
    reason: "signals_present",
  });
  const marked = commit(root, { "AGENTS.md": `${LAYER["AGENTS.md"]}\nKnowledge-Layer: enabled\n` });
  assert.equal(answer(root, marked).state, "enabled");
});

test("a project that never carried a signal is not enabled, proven over its history", () => {
  const root = repository();
  commit(root, { "README.md": "# Plain\n" });
  const sha = commit(root, { "src/index.js": "export {};\n" });
  assert.deepEqual(answer(root, sha), { state: "not_enabled", reason: "never_enabled" });
});

test("removing the signals is a gap, not a project without the layer", () => {
  const root = repository();
  commit(root, LAYER);
  const sha = commit(root, {
    Makefile: null,
    "AGENTS.md": "# Project\n",
    "docs/papercut.md": null,
  });
  assert.deepEqual(answer(root, sha), {
    state: "needs_attention",
    reason: "signals_removed",
    missing: "backlog,papercut,history",
  });
});

test("only an explicit disabled marker with no signal left switches the layer off", () => {
  const root = repository();
  commit(root, LAYER);
  const off = commit(root, {
    Makefile: null,
    "docs/papercut.md": null,
    "AGENTS.md": "# Project\n\nKnowledge-Layer: disabled\n",
  });
  assert.deepEqual(answer(root, off), { state: "not_enabled", reason: "declared_disabled" });
  const contradictory = commit(root, { Makefile: LAYER.Makefile });
  assert.deepEqual(answer(root, contradictory), {
    state: "needs_attention",
    reason: "disabled_with_signals",
    missing: "none",
  });
});

test("a partial set, an unbacked enabled marker and two markers are typed gaps", () => {
  const root = repository();
  const partial = commit(root, { Makefile: LAYER.Makefile, "AGENTS.md": "# Project\n" });
  assert.deepEqual(answer(root, partial), {
    state: "needs_attention",
    reason: "partial_signals",
    missing: "papercut,history",
  });
  const other = repository();
  assert.equal(answer(other, commit(other, { ...LAYER, Makefile: null })).missing, "backlog");
  const unbacked = commit(root, {
    Makefile: null,
    "AGENTS.md": "# Project\n\nKnowledge-Layer: enabled\n",
  });
  assert.deepEqual(answer(root, unbacked), {
    state: "needs_attention",
    reason: "enabled_without_signals",
    missing: "backlog,papercut,history",
  });
  const both = commit(root, {
    "AGENTS.md": "# P\n\nKnowledge-Layer: enabled\nKnowledge-Layer: disabled\n",
  });
  assert.deepEqual(answer(root, both), {
    state: "needs_attention",
    reason: "conflicting_marker",
    missing: "none",
  });
});

test("a papercut document elsewhere counts only when AGENTS.md links it", () => {
  const root = repository();
  const files = {
    ...LAYER,
    "docs/papercut.md": null,
    "knowledge/team-papercuts.md": "# Papercuts\n",
  };
  assert.equal(answer(root, commit(root, files)).reason, "partial_signals");
  const linked = commit(root, {
    "AGENTS.md": `${LAYER["AGENTS.md"]}\n[Papercuts](knowledge/team-papercuts.md)\n`,
  });
  assert.equal(answer(root, linked).state, "enabled");
  // A link that only names the file in code is not a declaration.
  const code = commit(root, {
    "AGENTS.md": `${LAYER["AGENTS.md"]}\n\`knowledge/team-papercuts.md\`\n`,
  });
  assert.equal(answer(root, code).reason, "partial_signals");
  // A link to a section of the document still names the document.
  for (const suffix of ["#commands", "?view=full#commands"]) {
    const section = commit(root, {
      "AGENTS.md": `${LAYER["AGENTS.md"]}\n[Papercuts](knowledge/team-papercuts.md${suffix})\n`,
    });
    assert.equal(answer(root, section).state, "enabled", suffix);
  }
  for (const target of ["https://example.com/team-papercuts.md#x", "../team-papercuts.md#x"]) {
    const away = commit(root, { "AGENTS.md": `${LAYER["AGENTS.md"]}\n[Papercuts](${target})\n` });
    assert.equal(answer(root, away).reason, "partial_signals", target);
  }
});

test("a papercut document under any name counts when AGENTS.md declares it by line", () => {
  const root = repository();
  const agents = `${LAYER["AGENTS.md"]}\n[Грабли и команды проекта](docs/commands.md)\n`;
  const files = { ...LAYER, "docs/papercut.md": null, "docs/commands.md": "# Commands\n" };
  // A link alone names no papercut document: the file name says nothing.
  assert.equal(
    answer(root, commit(root, { ...files, "AGENTS.md": agents })).reason,
    "partial_signals",
  );
  const declared = `${agents}\n\`\`\`text\nKnowledge-Layer: enabled\nKnowledge-Layer-Papercut: docs/commands.md\n\`\`\`\n`;
  assert.deepEqual(answer(root, commit(root, { "AGENTS.md": declared })), {
    state: "enabled",
    reason: "signals_present",
  });
  // The marker over the two remaining signals is a partial set, not "without signals",
  // and a declared document absent at the candidate is the one signal missing.
  assert.deepEqual(answer(root, commit(root, { "docs/commands.md": null })), {
    state: "needs_attention",
    reason: "partial_signals",
    missing: "papercut",
  });
});

test("two papercut lines, identical or not, or one outside the repository, are a contradiction", () => {
  const root = repository();
  const lines = (...paths) =>
    `${LAYER["AGENTS.md"]}\n${paths.map((path) => `Knowledge-Layer-Papercut: ${path}`).join("\n")}\n`;
  const files = { ...LAYER, "docs/commands.md": "# Commands\n", "docs/other.md": "# Other\n" };
  const two = commit(root, { ...files, "AGENTS.md": lines("docs/commands.md", "docs/other.md") });
  assert.equal(answer(root, two).reason, "conflicting_papercut");
  // An identical second line is a second declaration too, not the same one.
  const twice = commit(root, { "AGENTS.md": lines("docs/commands.md", "docs/commands.md") });
  assert.equal(answer(root, twice).reason, "conflicting_papercut");
  const one = commit(root, { "AGENTS.md": lines("docs/commands.md") });
  assert.deepEqual(answer(root, one), { state: "enabled", reason: "signals_present" });
  const outside = commit(root, { "AGENTS.md": lines("../elsewhere/papercut.md") });
  assert.equal(answer(root, outside).reason, "conflicting_papercut");
});

test("a shallow clone cannot prove never, and a missing commit is not a project", () => {
  const origin = repository();
  commit(origin, { "README.md": "# Plain\n" });
  commit(origin, { "README.md": "# Plain 2\n" });
  const shallow = mkdtempSync(join(tmpdir(), "mo-layer-shallow-"));
  scratch.push(shallow);
  const cloned = spawnSync("git", ["clone", "-q", "--depth", "1", `file://${origin}`, shallow], {
    encoding: "utf8",
  });
  assert.equal(cloned.status, 0, cloned.stderr);
  assert.deepEqual(answer(shallow, git(shallow, "rev-parse", "HEAD")), {
    state: "needs_attention",
    reason: "shallow_clone",
    missing: "unknown",
  });
  assert.deepEqual(answer(origin, "f".repeat(40)), {
    state: "needs_attention",
    reason: "candidate_unreadable",
    missing: "unknown",
  });
});

test("the CLI prints the literal brief line and types its exit", () => {
  const root = repository();
  const sha = commit(root, LAYER);
  const run = (args, cwd = root) =>
    spawnSync(process.execPath, [HELPER, ...args], { cwd, encoding: "utf8" });
  const nested = join(root, "docs");
  const found = run(["--candidate", sha], nested);
  assert.equal(found.status, 0);
  assert.equal(found.stdout, "Knowledge-Layer: state=enabled reason=signals_present\n");
  assert.equal(run(["--candidate", sha.slice(0, 12)]).status, 2);
  assert.equal(run(["--candidate", sha, "--repo", root, "--repo", root]).status, 2);
  const outside = mkdtempSync(join(tmpdir(), "mo-layer-outside-"));
  scratch.push(outside);
  const refused = run(["--candidate", sha], outside);
  assert.equal(refused.status, 1);
  assert.equal(
    refused.stdout,
    "Knowledge-Layer: state=needs_attention reason=not_git_repository missing=unknown\n",
  );
  assert.equal(
    knowledgeLayerLine({ state: "not_enabled", reason: "never_enabled" }),
    "Knowledge-Layer: state=not_enabled reason=never_enabled",
  );
});

test("this repository declares its knowledge layer enabled", () => {
  // Meta-O is always `enabled`: the marker stands next to the three signals.
  assert.deepEqual(knowledgeLayer(ROOT, git(ROOT, "rev-parse", "HEAD")), {
    state: "enabled",
    reason: "signals_present",
  });
});

test("every consumer takes the helper's line instead of guessing from the tree", () => {
  const flat = (path) => readFileSync(join(ROOT, path), "utf8").replace(/\s+/gu, " ");
  for (const skill of ["mo-orchestrate-orca", "mo-review-orca", "mo-e2e", "mo-setup"]) {
    assert.match(
      flat(`src/skills/${skill}/SKILL.md`),
      /scripts\/mo-knowledge-layer\.mjs --candidate/u,
      skill,
    );
  }
  const brief = flat("shared/references/review-brief.md");
  assert.match(brief, /\| `Knowledge-Layer` \| the helper's literal `state=… reason=…` line/u);
  const protocol = flat("shared/references/review-protocol.md");
  assert.match(protocol, /With `not_enabled`, .* is `not_applicable`/u);
  assert.match(protocol, /or with no such line in the brief, the lens is `unknown`/u);
  const reviewer = flat("src/skills/mo-reviewer/SKILL.md");
  assert.match(reviewer, /`needs_attention` or a missing line makes the lens `unknown`/u);
  const method = flat("shared/references/methodology.md");
  // Only the closure proof leaves the gates: G1 and G2 also carry the remote
  // head and G2 the CI evidence, and neither depends on the knowledge layer.
  assert.match(
    method,
    /With `not_enabled`, only the closure proof drops out of G0, GC,\s+G1 and G2/u,
  );
  assert.match(method, /the\s+remote-head equality of G1 and G2 and G2's CI evidence still apply/u);
  const orchestrate = flat("src/skills/mo-orchestrate-orca/SKILL.md");
  assert.match(orchestrate, /drop only the `MO-BACKLOG\/1` closure proof/u);
  assert.match(orchestrate, /with the knowledge layer `enabled`, an empty GC/u);
  const setup = flat("src/skills/mo-setup/SKILL.md");
  assert.match(setup, /Whether a project has the layer is the human's decision/u);
  assert.match(setup, /carry the literal `MO-BACKLOG\/1`/u);
});

test("a readiness gap names its missing signals, and setup reports the literal lines", () => {
  const flat = (path) => readFileSync(join(ROOT, path), "utf8").replace(/\s+/gu, " ");
  assert.match(
    flat("src/skills/mo-e2e/SKILL.md"),
    /record the helper's reason and copy its `missing=` field as printed, never a list derived from the tree, return `needs_attention`/u,
  );
  assert.match(
    flat("src/skills/mo-review-orca/SKILL.md"),
    /`needs_attention` with the helper's reason and the helper's `missing=` field copied as printed/u,
  );
  assert.match(
    flat("src/skills/mo-orchestrate-orca/SKILL.md"),
    /reported with the helper's reason and its `missing=` field as printed/u,
  );
  const setup = flat("src/skills/mo-setup/SKILL.md");
  assert.match(setup, /`Knowledge-Layer: state=not_enabled reason=never_enabled`/u);
  assert.match(setup, /`Knowledge-Layer: state=needs_attention` with the helper's reason/u);
});
