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
  assert.match(source, /never a candidate receipt/);
  assert.match(source, /pass its locator explicitly instead of creating a duplicate/);
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
