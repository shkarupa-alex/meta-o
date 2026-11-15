/**
 * Hold mo-setup to the historical-control contract it applies to other projects.
 *
 * Protects §A-MEMORY-01 and §A-BACKLOG-01.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import yaml from "js-yaml";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toString } from "mdast-util-to-string";

const ROOT = resolve(import.meta.dirname, "..");
const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

/**
 * The staleness rule of the setup contract, executed instead of paraphrased.
 *
 * A missing, duplicated or unparsable line is `unknown`, never `yes`: "I cannot
 * tell" and "these differ" send a project to different places.
 */
function stale(path) {
  const copy = readFileSync(path, "utf8");
  const lines = copy.split("\n");
  const stamps = lines.filter((line) => line.startsWith("// MO-KNOWLEDGE-HISTORY-SOURCE "));
  if (stamps.length !== 1 || lines.at(-2) !== stamps[0]) return "unknown";
  const parsed = /^\/\/ MO-KNOWLEDGE-HISTORY-SOURCE (\S+) ([0-9a-f]{64})$/u.exec(stamps[0]);
  if (!parsed) return "unknown";
  const body = copy.slice(0, copy.length - `${stamps[0]}\n`.length);
  return createHash("sha256").update(body).digest("hex") === parsed[2] ? "no" : "yes";
}
/**
 * Read a runner definition the way the declaration form reads it: the stage is
 * a member of the stage list the quality command actually walks.
 *
 * A file-wide search cannot say this. In this very repository the stage name
 * also stands in `.PHONY`, in its own target and in two smoke lines, so it
 * survives removal from the authoritative command — which is exactly the
 * `gate_missing` state the contract exists to catch.
 */
function runnerCarries(makefile, command, stage) {
  const lines = makefile.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`${command}:`));
  if (start === -1) return "command_absent";
  const recipe = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("\t")) recipe.push(line);
    else if (line.trim() !== "") break;
  }
  const assignments = new Map();
  for (const line of lines) {
    const parsed = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/u.exec(line);
    if (parsed) assignments.set(parsed[1], parsed[2].trim().split(/\s+/u));
  }
  const walked = [...recipe.join(" ").matchAll(/\$\(([A-Za-z0-9_]+)\)/gu)]
    .map((match) => assignments.get(match[1]))
    .filter((members) => members !== undefined);
  if (walked.length === 0) return "recipe_ignores_stage_list";
  return walked.some((members) => members.includes(stage)) ? "yes" : "stage_not_in_stage_list";
}
const skill = readFileSync(join(ROOT, "src", "skills", "mo-setup", "SKILL.md"), "utf8");
const prose = skill.replace(/\s+/gu, " ");
const contract = readFileSync(
  join(ROOT, "src", "skills", "mo-setup", "references", "knowledge-id-history.md"),
  "utf8",
);

/** Every link node below one section, whose target names a place by itself. */
function links(nodes) {
  return nodes.flatMap((node) => (node.type === "link" ? [node] : links(node.children ?? [])));
}

test("the probe is declared, clone-only and budgeted, never guessed", () => {
  // Every count here is "exactly one" on purpose: a section with two command
  // blocks is ambiguous, and an ambiguous declaration read as an answer is the
  // one failure this whole form exists to prevent.
  for (const phrase of [
    "Knowledge id history",
    "exactly one fenced one-line command",
    "exactly one `history_cutoff_sha` record",
    "Markdown AST",
    "history=unknown",
  ]) {
    assert.ok(prose.includes(phrase.replace(/\s+/gu, " ")), phrase);
  }
  // The probe may never run in the candidate worktree, and it proves the stage
  // rather than the project's whole quality command.
  assert.match(prose, /never by the project's full QC/u);
  assert.match(prose, /--no-hardlinks --no-local/u);
  assert.match(prose, /never opened for writing/u);
  assert.match(prose, /Delete the clone in a `finally`/u);
  assert.match(prose, /machine-local and never reported/u);
});

test("identifier locations are declared, never inherited from this project", () => {
  // meta-o's own layout is a convention, not a standard: a probe that assumes
  // it either certifies documents the target's gate never reads, or commits a
  // deletion into whichever file happened to match the shape.
  assert.match(prose, /The same contract must name where identifiers live/u);
  assert.match(prose, /Unnamed, ambiguous or contradictory locations are `history=unknown/u);
  assert.match(prose, /no fixture is written at all/u);
  assert.match(prose, /touching only the declared locations/u);
  assert.match(prose, /only definitions the AST actually found there/u);
  assert.match(contract, /Locations are read, never assumed/u);
  assert.match(contract, /not a\s+default anyone else agreed to/u);
  // The rule has to reach the fixture step, not only the reading step: the
  // damage a guessed location does is a commit, and that is not reversible in
  // someone else's repository.
  assert.match(contract, /both touch only the declared locations/u);

  // Every shipped document that states the declaration must state all of it.
  // Editing one and forgetting another is how the skill came to ship two
  // answers to the same question, so the rule is checked per document.
  const documents = {
    "SKILL.md": prose,
    "references/knowledge-id-history.md": contract.replace(/\s+/gu, " "),
    "references/project-setup.md": readFileSync(
      join(ROOT, "skills", "mo-setup", "references", "project-setup.md"),
      "utf8",
    ).replace(/\s+/gu, " "),
  };
  const elements = {
    "the stage command block": /exactly one fenced/u,
    "the authoritative QC line": /authoritative (?:QC|quality) command/u,
    "the cutoff record": /history_cutoff_sha/u,
    "the identifier locations": /identifiers live/u,
  };
  for (const [name, text] of Object.entries(documents)) {
    for (const [element, pattern] of Object.entries(elements)) {
      assert.match(text, pattern, `${name} does not state ${element}`);
    }
  }
});

test("an exhausted budget is unknown, never a missing gate", () => {
  // Conflating "took too long" with "has no gate" would report a project as
  // ungated on a slow machine, which is a false accusation, not a finding.
  assert.match(prose, /600 s/u);
  assert.match(prose, /120 s/u);
  assert.match(prose, /naming the exhausted budget, never `gate_missing`/u);
});

test("both fixtures are required, because each alone proves half", () => {
  // A checker that rejects everything passes the deletion fixture; one that
  // accepts everything passes the authorized-reuse fixture. Only both together
  // say the gate discriminates.
  assert.match(prose, /exit non-zero and print a typed marker/u);
  assert.match(prose, /MO-KNOWLEDGE-HISTORY\/1 status=violations/u);
  assert.match(prose, /a zero exit or no marker is `gate_missing`/u);
  assert.match(prose, /git reset --hard/u);
  assert.match(prose, /git clean -xdff/u);
  assert.match(prose, /a failure is `gate_failing`/u);
  assert.match(prose, /each prove only half/u);
});

test("staleness is decided by the hash and only explained by the version", () => {
  assert.match(prose, /stale=<yes\|no\|unknown>/u);
  assert.match(prose, /missing, duplicated or unparsable line is `stale=unknown`/u);
  assert.match(prose, /never decides it/u);

  // The hash domain has to be stated, or supplier and copy hash different bytes
  // and every comparison is meaningless. Re-stamping must be a no-op.
  assert.match(contract, /without that line/u);
  const body = 'const value = "bundle";\n';
  const stamp = `// MO-KNOWLEDGE-HISTORY-SOURCE 0.2.0 ${createHash("sha256")
    .update(body)
    .digest("hex")}\n`;
  const stamped = body + stamp;
  const restamped =
    stamped.slice(0, stamped.length - stamp.length) +
    `// MO-KNOWLEDGE-HISTORY-SOURCE 0.2.0 ${createHash("sha256")
      .update(stamped.slice(0, stamped.length - stamp.length))
      .digest("hex")}\n`;
  assert.equal(restamped, stamped);
});

test("the shipped copy can answer the staleness question on its own", () => {
  // An installed skill has no package.json and no repository around it, so the
  // version and the hash have to travel inside the file mo-setup tells a
  // project to copy. Without them every repaired copy is `stale=unknown`.
  const bundle = join(ROOT, "skills", "mo-setup", "scripts", "mo-knowledge-history.mjs");
  const shipped = readFileSync(bundle, "utf8");
  const lines = shipped.split("\n");
  assert.equal(lines.at(-1), "", "the stamp must end with a newline");
  const stamp = lines.at(-2);
  const match = /^\/\/ MO-KNOWLEDGE-HISTORY-SOURCE (\S+) ([0-9a-f]{64})$/u.exec(stamp ?? "");
  assert.ok(match, `the shipped bundle carries no source stamp: ${JSON.stringify(stamp)}`);
  assert.equal(match[1], version);
  assert.equal(
    shipped.split("\n").filter((line) => line.includes("MO-KNOWLEDGE-HISTORY-SOURCE")).length,
    1,
    "a duplicated stamp is unparsable and would report stale=unknown",
  );

  // The documented domain: everything before the line. Supplier and copy must
  // therefore hash identical bytes, and re-stamping must change nothing.
  const body = shipped.slice(0, shipped.length - `${stamp}\n`.length);
  assert.equal(createHash("sha256").update(body).digest("hex"), match[2]);
  assert.notEqual(createHash("sha256").update(`${body} `).digest("hex"), match[2]);

  // A copy is compared, not trusted: prove the comparison a target project runs.
  const scratch = mkdtempSync(join(tmpdir(), "mo-stamp-"));
  try {
    const copy = join(scratch, "mo-knowledge-history.mjs");
    writeFileSync(copy, shipped);
    assert.equal(stale(copy), "no");
    // One byte of body, the stamp untouched: this is the drift the comparison
    // exists to catch, and the version string alone would never have seen it.
    writeFileSync(copy, ` ${body}${stamp}\n`);
    assert.equal(stale(copy), "yes");
    writeFileSync(copy, body);
    assert.equal(stale(copy), "unknown");
    writeFileSync(copy, `${shipped}${stamp}\n`);
    assert.equal(stale(copy), "unknown");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("the report records name their fields and hide local paths", () => {
  assert.match(
    prose,
    /Knowledge-IDs\/1 current_tree=<ok\|violations\|unknown> history=<gate_present\|gate_missing\|gate_failing\|unknown> stale=<yes\|no\|unknown> qc=<json\|none> cutoff=<sha\|none>/u,
  );
  assert.match(prose, /Papercut\/1 path=<json\|none> linked=<yes\|no>/u);
  assert.match(prose, /history=<full\|shallow\|unknown>/u);
  assert.match(prose, /backlog_job=<yes\|no\|unknown>/u);
});

test("repair never copies this project's own boundary", () => {
  // A foreign cutoff exempts exactly the history the target project needs
  // checked, and the exemption would be invisible in its own gate output.
  assert.match(prose, /tools\/mo-knowledge-history\.mjs/u);
  assert.match(prose, /remove\|reuse\|editorial/u);
  assert.match(prose, /Never copy this project's boundaries or commit ids/u);
});

test("the supplier project is not a stale copy of itself", () => {
  // meta-o runs the source the bundle is built from, so it has no version line
  // and nothing to compare. Reporting that as `unknown` would accuse the one
  // project that cannot possibly be behind.
  for (const text of [prose, contract.replace(/\s+/gu, " ")]) {
    assert.match(text, /supplier project itself|project is the supplier itself/u);
    assert.match(text, /`package.json` names the (?:same )?package this bundle/u);
    assert.match(text, /the record is `stale=no`/u);
  }
});

test("this project's own contract satisfies the declaration form it ships", () => {
  // The rule is applied to its author first: if meta-o cannot be read by it,
  // the form is not a contract but a wish.
  const document = fromMarkdown(readFileSync(join(ROOT, "AGENTS.md"), "utf8"));
  const headings = document.children
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.type === "heading" && node.depth === 2);
  const declared = headings.filter(({ node }) => toString(node).includes("Knowledge id history"));
  assert.equal(declared.length, 1, "the declaration section is not exactly one");
  const next = headings.find(({ index }) => index > declared[0].index);
  const body = document.children.slice(declared[0].index + 1, next?.index);
  const fences = body.filter((node) => node.type === "code");
  const stage = fences.filter((node) => node.lang !== "yaml");
  assert.equal(stage.length, 1, "not exactly one stage block");
  assert.equal(stage[0].value.split("\n").length, 1, "the stage block is not one line");
  const records = fences.filter((node) => /^history_cutoff_sha:/u.test(node.value));
  assert.equal(records.length, 1, "not exactly one cutoff record");
  assert.match(yaml.load(records[0].value).history_cutoff_sha, /^[0-9a-f]{40}$/u);
  const text = body.map((node) => toString(node)).join(" ");
  // The stage is named as a stage of the authoritative command, and the runner
  // definition that line points at really lists it.
  const quality = body
    .filter((node) => node.type === "paragraph")
    .map((node) => toString(node))
    .filter((line) => line.includes("make mo-qc"));
  assert.equal(quality.length, 1, "not exactly one line names the quality command");
  assert.ok(quality[0].includes(stage[0].value), "the quality line does not name the stage");
  // The declared block is a command line; the runner knows the stage by its
  // target name, so the name is read out of that line instead of assumed.
  const target = /^make\s+(\S+)$/u.exec(stage[0].value.trim());
  assert.ok(target, "the stage block is not one make invocation");
  assert.equal(
    runnerCarries(readFileSync(join(ROOT, "Makefile"), "utf8"), "mo-qc", target[1]),
    "yes",
    "the runner definition does not carry the stage",
  );
  // A link says where by its target; prose says it in words. Both are readable
  // by an AST, and the rule asks for the place, not for the spelling.
  const targets = [text, ...links(body).map((node) => node.url)].join(" ");
  assert.match(targets, /docs\/business.md/u);
  assert.match(targets, /docs\/architecture\//u);
});

test("the membership check fails on a runner that only mentions the stage", () => {
  // The check above is only worth its line if it can say no. These two texts
  // are the states a substring search cannot tell from a healthy Makefile: the
  // stage dropped out of the list, and the list no longer walked at all.
  const makefile = readFileSync(join(ROOT, "Makefile"), "utf8");
  assert.equal(runnerCarries(makefile, "mo-qc", "mo-knowledge-history"), "yes");
  const dropped = makefile.replace(/^MO_QC_STAGES = .*$/mu, (line) =>
    line.replace(" mo-knowledge-history", ""),
  );
  assert.match(dropped, /^\.PHONY:.*mo-knowledge-history/mu, "the decoy mentions are gone");
  assert.match(dropped, /^mo-knowledge-history:$/mu, "the stage target is gone");
  assert.equal(runnerCarries(dropped, "mo-qc", "mo-knowledge-history"), "stage_not_in_stage_list");
  const unwalked = makefile.replace("$(MO_QC_STAGES)", "mo-lint mo-test");
  assert.equal(
    runnerCarries(unwalked, "mo-qc", "mo-knowledge-history"),
    "recipe_ignores_stage_list",
  );
});

/**
 * The pass count mo-setup is told to take, executed instead of paraphrased.
 *
 * A QC performs one full history traversal per stage whose recipe runs the
 * history checker, plus one per checker run in a test file the QC reaches that
 * points the checker at the project's own repository instead of a synthetic
 * history the test builds itself. Read from tracked files only: running the
 * QC to count would cost exactly what the count is meant to expose.
 */
function fullPasses(makefile, tests, command, checker) {
  const lines = makefile.split("\n");
  const recipes = new Map();
  let target = null;
  for (const line of lines) {
    const header = /^([A-Za-z0-9_.-]+):(?!=)(.*)$/u.exec(line);
    if (header) {
      target = header[1];
      recipes.set(target, { deps: header[2].trim().split(/\s+/u).filter(Boolean), body: [] });
    } else if (line.startsWith("\t") && target) recipes.get(target).body.push(line);
    else if (line.trim() !== "") target = null;
  }
  const assignments = new Map();
  for (const line of lines) {
    const parsed = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/u.exec(line);
    if (parsed) assignments.set(parsed[1], parsed[2].trim().split(/\s+/u));
  }
  const reached = new Set();
  const visit = (name) => {
    if (reached.has(name) || !recipes.has(name)) return;
    reached.add(name);
    const { deps, body } = recipes.get(name);
    const walked = [...body.join(" ").matchAll(/\$\(([A-Za-z0-9_]+)\)/gu)].flatMap(
      (match) => assignments.get(match[1]) ?? [],
    );
    [...deps, ...walked].forEach(visit);
  };
  visit(command);
  const recipeText = [...reached].map((name) => recipes.get(name).body.join("\n"));
  // A run of the checker, not a syntax check, a help screen or a file list.
  const invocation = new RegExp(
    `node \\S*${checker.replaceAll(".", "\\.")}(?!\\S)(?!.*--help)`,
    "u",
  );
  const stages = recipeText
    .flatMap((body) => body.split("\n"))
    .filter((line) => invocation.test(line)).length;
  const runsTests = recipeText.some((body) => /\b(?:pytest|node --test)\b/u.test(body));
  const real = runsTests
    ? Object.values(tests).flatMap((source) =>
        source
          .split("\n")
          .filter(
            (line) => line.includes(checker) && /--repo["', ]+(?:ROOT|REPO_ROOT|\.)\b/u.test(line),
          ),
      ).length
    : 0;
  return stages + real;
}

const CONSUMER_MAKEFILE = [
  "QC_STAGES = lint knowledge-history unit",
  "",
  "qc:",
  "\t@for stage in $(QC_STAGES); do $(MAKE) $$stage || exit 1; done",
  "",
  "lint:",
  "\truff check .",
  "",
  "knowledge-history:",
  "\tnode tools/mo-knowledge-history.mjs --cutoff abc",
  "",
  "unit:",
  "\tuv run pytest tests",
].join("\n");

// The reported shape: three gate tests rerun the real history four times.
const CONSUMER_TESTS = {
  "tests/test_history_gate.py": [
    "def test_cutoff_passes_and_parent_fails():",
    '    ok = run(["node", "tools/mo-knowledge-history.mjs", "--repo", ROOT, "--cutoff", CUTOFF])',
    '    bad = run(["node", "tools/mo-knowledge-history.mjs", "--repo", ROOT, "--cutoff", PARENT])',
    "def test_real_exemptions():",
    '    run(["node", "tools/mo-knowledge-history.mjs", "--repo", ROOT, "--audit-exemptions"])',
    "def test_raised_cutoff():",
    '    run(["node", "tools/mo-knowledge-history.mjs", "--repo", ROOT, "--cutoff", RAISED])',
  ].join("\n"),
};

// The patch the finding proposes: the same rules on small synthetic histories.
const PATCHED_TESTS = {
  "tests/test_history_gate.py": [
    "def test_silent_deletion_fails(tmp_path):",
    "    repo = synthetic_history(tmp_path, delete=True)",
    '    run(["node", "tools/mo-knowledge-history.mjs", "--repo", repo, "--cutoff", repo.root])',
  ].join("\n"),
};

test("a QC that reruns the real history is a finding with a synthetic-history patch", () => {
  const checker = "mo-knowledge-history.mjs";
  assert.equal(fullPasses(CONSUMER_MAKEFILE, CONSUMER_TESTS, "qc", checker), 5);
  assert.equal(fullPasses(CONSUMER_MAKEFILE, PATCHED_TESTS, "qc", checker), 1);
  // This project eats the rule: one authoritative pass, and its own tests of
  // the checker build their histories in temporary repositories. This file
  // holds the consumer fixture above as data, so it is not one of them.
  const own = Object.fromEntries(
    readdirSync(join(ROOT, "tests"))
      .filter((name) => name.endsWith(".test.mjs") && name !== "setup-knowledge-history.test.mjs")
      .map((name) => [name, readFileSync(join(ROOT, "tests", name), "utf8")]),
  );
  const makefile = readFileSync(join(ROOT, "Makefile"), "utf8");
  assert.equal(fullPasses(makefile, own, "mo-qc", checker), 1);
  // The instruction says the same in words a setup run can follow.
  for (const phrase of [
    "real full history traversals",
    "`--timing`",
    "synthetic histories",
    "never by running it",
    "Never move the cutoff",
  ]) {
    assert.ok(prose.includes(phrase), phrase);
  }
});
