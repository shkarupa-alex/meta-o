/**
 * Protects the operational provider-posture procedure installed by mo-setup.
 *
 * The diagnostic is security-sensitive: losing a shell mode, bypassing the
 * privileged shebang, or assigning definition disclosure to the agent would
 * turn an unreadable launch posture into a false supported result.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const METHODOLOGY = join(ROOT, "shared", "references", "methodology.md");
const SETUP = join(ROOT, "src", "skills", "mo-setup", "SKILL.md");
const PHASE0 = join(ROOT, "docs", "phase-0-fixtures.md");
const markdown = new MarkdownIt();

test("setup creates the backend fixture-map input without making it a receipt", () => {
  const source = readFileSync(SETUP, "utf8");
  assert.match(source, /docs\/phase-0-fixtures\.md\s+# reusable backend surface/);
  assert.match(source, /conventional pre-activation input for backend\nskills/);
  assert.match(
    source,
    /backend\/provider\/provider-version\/backend-version\/\s*surface\/os\/fixture keys/,
  );
  assert.match(source, /explicit backend scope/);
  assert.match(source, /canonical safe scenario-ID\s+definitions \(at most 64 per route\)/);
  assert.match(source, /Review fixtures have no scenarios/);
  assert.match(source, /each E2E fixture names\s+exactly one scenario/);
  assert.match(source, /MO_FIXTURE_MAP_V1/);
  assert.match(source, /MO_FIXTURE_SCENARIOS_V1/);
  assert.match(source, /real AST/);
  assert.match(source, /never a candidate receipt/);
  assert.match(source, /pass its locator explicitly instead of creating a duplicate/);
});

function validateDefaultFixtureMap(source) {
  const blocks = sectionTokens(source, 2, "Pre-activation input records")
    .filter((token) => token.type === "fence")
    .map((token) => token.content.trim())
    .filter((content) => content.startsWith("MO_FIXTURE_MAP_V1|backend=herdr"));
  assert.equal(blocks.length, 1);
  const lines = blocks[0].split("\n");
  const parse = (line, protocol, fields) => {
    const parts = line.split("|");
    assert.equal(parts.shift(), protocol);
    assert.equal(parts.length, fields.length);
    const record = {};
    for (const [index, part] of parts.entries()) {
      const separator = part.indexOf("=");
      assert.notEqual(separator, -1);
      const key = part.slice(0, separator);
      assert.equal(key, fields[index]);
      assert.equal(Object.hasOwn(record, key), false);
      record[key] = part.slice(separator + 1);
    }
    return record;
  };
  const factFields = [
    "backend",
    "provider",
    "provider-version",
    "backend-version",
    "surface",
    "os",
    "fixture",
    "scenarios",
    "posture",
  ];
  const facts = lines
    .filter((line) => line.startsWith("MO_FIXTURE_MAP_V1|"))
    .map((line) => parse(line, "MO_FIXTURE_MAP_V1", factFields));
  const scenarioSets = lines
    .filter((line) => line.startsWith("MO_FIXTURE_SCENARIOS_V1|"))
    .map((line) => parse(line, "MO_FIXTURE_SCENARIOS_V1", ["backend", "ids"]));
  const safe = /^[a-z0-9][a-z0-9._-]{0,63}$/;
  for (const backend of ["herdr", "omnigent"]) {
    const scoped = facts.filter((fact) => fact.backend === backend);
    assert.equal(scoped.length >= 4, true);
    assert.equal(
      scoped.filter((fact) => fact.surface === "executor" && fact.fixture === "executor-turn")
        .length,
      1,
    );
    assert.equal(
      new Set(
        scoped
          .filter((fact) => fact.surface === "review" && fact.fixture === "review-turn")
          .map((fact) => fact.provider),
      ).size >= 2,
      true,
    );
    assert.equal(
      scoped.some((fact) => fact.surface === "e2e"),
      true,
    );
    for (const fact of scoped) {
      for (const key of factFields.slice(0, 7)) assert.match(fact[key], safe);
      assert.match(fact.posture, /^(SUPPORTED|PENDING|UNSUPPORTED)$/);
      assert.equal(fact.posture, "UNSUPPORTED");
      if (fact.surface === "e2e" && fact.scenarios !== "none") {
        assert.equal(fact.scenarios, fact.fixture);
      } else {
        assert.equal(fact.scenarios, "none");
      }
    }
    const matchingSets = scenarioSets.filter((entry) => entry.backend === backend);
    assert.equal(matchingSets.length, 1);
    const ids = matchingSets[0].ids.split(",");
    assert.equal(ids.length >= 1 && ids.length <= 64, true);
    ids.forEach((id) => assert.match(id, safe));
    assert.deepEqual(ids, [...new Set(ids)].sort());
  }
  assert.equal(
    facts.every((fact) => /^(herdr|omnigent)$/.test(fact.backend)),
    true,
  );
  return { facts, scenarioSets };
}

test("the default pre-activation map is structurally consumable for both backends", () => {
  const source = readFileSync(PHASE0, "utf8");
  const parsed = validateDefaultFixtureMap(source);
  assert.equal(parsed.scenarioSets.length, 2);
  for (const mutant of [
    source.replace("|provider-version=unproven", ""),
    source.replace("MO_FIXTURE_SCENARIOS_V1|backend=omnigent", "BROKEN|backend=omnigent"),
    source.replace("ids=om1,om2,om3,om4,om5,om6,om7,om8", "ids=om2,om1"),
  ]) {
    assert.notEqual(mutant, source);
    assert.throws(() => validateDefaultFixtureMap(mutant));
  }
});

/** Return AST tokens inside one exact heading, stopping at the next peer. */
function sectionTokens(source, level, heading) {
  const tokens = markdown.parse(source, {});
  const tag = `h${level}`;
  let start = -1;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (
      tokens[index].type === "heading_open" &&
      tokens[index].tag === tag &&
      tokens[index + 1].type === "inline" &&
      tokens[index + 1].content === heading
    ) {
      start = index + 3;
      break;
    }
  }
  assert.notEqual(start, -1, `missing ${tag} ${heading}`);

  let end = tokens.length;
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].type !== "heading_open") continue;
    if (Number(tokens[index].tag.slice(1)) <= level) {
      end = index;
      break;
    }
  }
  return tokens.slice(start, end);
}

/** Join prose while keeping code fences separately inspectable through the AST. */
function prose(tokens) {
  return tokens
    .filter((token) => token.type === "inline")
    .map((token) => token.content)
    .join("\n");
}

function postureCommands(tokens) {
  const blocks = tokens
    .filter((token) => token.type === "fence")
    .map((token) => token.content.trim().split("\n"))
    .filter((lines) => lines.some((line) => line.includes("mo-posture.sh")));
  assert.equal(blocks.length, 1, "posture procedure must have one command block");
  return blocks[0];
}

test("methodology §9 owns the complete posture diagnostic", () => {
  const section = sectionTokens(
    readFileSync(METHODOLOGY, "utf8"),
    2,
    "9. Route discovery and support",
  );
  assert.deepEqual(postureCommands(section), [
    "scripts/mo-posture.sh --self-check --shell all",
    "scripts/mo-posture.sh --shell <zsh|bash|all> -- <selected-providers>",
  ]);

  const text = prose(section);
  for (const mode of ["-lc", "-lic", "-c", "-ic"]) assert.match(text, new RegExp(`\\${mode}`));
  assert.match(text, /Never prefix them with `bash`/);
  assert.match(text, /bounded timeout/);
  assert.match(text, /disconnected stdin/);
  assert.match(text, /status 1 means divergence/);
  assert.match(text, /status 2 means evidence/);
  assert.match(text, /type=missing/);
  assert.match(text, /path=missing/);
  assert.match(text, /actual process resolves/);
  assert.match(text, /actual\s+backend, hook, or script environment/);
});

test("alias and function inspection leaves protected-value disclosure with the user", () => {
  const text = prose(
    sectionTokens(readFileSync(METHODOLOGY, "utf8"), 2, "9. Route discovery and support"),
  );

  for (const unsafe of ["type -a", "alias <name>", "whence -v", "typeset -f", "cat"]) {
    assert.match(text, new RegExp(unsafe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(text, /agent never uses them to dump/);
  assert.match(text, /user owns disclosure/);
  assert.match(text, /inspect it outside the agent/);
  assert.match(text, /\[REDACTED: provider token\]/);
  assert.match(text, /only `match` or `mismatch` is recorded/);
  assert.match(text, /verdict is unknown/);
});

test("mo-setup runs the diagnostic before owning external remediation", () => {
  const section = sectionTokens(
    readFileSync(SETUP, "utf8"),
    2,
    "3. Provider wrappers, trust and hooks",
  );
  assert.deepEqual(postureCommands(section), [
    "scripts/mo-posture.sh --self-check --shell all",
    "scripts/mo-posture.sh --shell <zsh|bash|all> -- <selected-providers>",
  ]);

  const text = prose(section);
  assert.match(text, /This section owns only remediation/);
  assert.match(text, /Do not prefix either command with `bash`/);
  assert.match(text, /user owns disclosure/);
  assert.match(text, /Never run a command that dumps/);
  assert.match(text, /explicit confirmation before writing/);
  assert.match(text, /only `match` or `mismatch`/);
});
