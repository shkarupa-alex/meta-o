/** Protect the final task's complete verbatim ledger in both normative locations. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const markdown = new MarkdownIt();
const intentPath = join(
  ROOT,
  "spec",
  "2026-08-14-backend-review-transition-final",
  "user-intent.md",
);
const businessPath = join(ROOT, "docs", "business.md");

function blockquotes(source) {
  const records = [];
  let depth = 0;
  let current = [];
  for (const token of markdown.parse(source, {})) {
    if (token.type === "blockquote_open") {
      if (depth === 0) current = [];
      depth += 1;
    } else if (token.type === "blockquote_close") {
      depth -= 1;
      if (depth === 0) records.push(current.join("\n"));
    } else if (depth > 0 && token.type === "inline") {
      current.push(token.content);
    }
  }
  return records;
}

function fencedText(source) {
  return markdown
    .parse(source, {})
    .filter((token) => token.type === "fence" && token.info.trim() === "text")
    .map((token) => token.content);
}

test("the complete final ledger appears contiguously and byte-semantically in business framing", () => {
  const ledger = blockquotes(readFileSync(intentPath, "utf8"));
  const business = blockquotes(readFileSync(businessPath, "utf8"));
  assert.ok(ledger.length > 20, "the approved conversation was unexpectedly shortened");
  const start = business.findIndex((record) => record === ledger[0]);
  assert.notEqual(start, -1);
  assert.deepEqual(business.slice(start, start + ledger.length), ledger);
});

test("the current implementation request and no-workflow-skill preference are recorded twice", () => {
  const exact =
    "реализуй spec/2026-08-14-backend-review-transition-final/spec.md , вот тут мои интенты spec/2026-08-14-backend-review-transition-final/user-intent.md (при реализации скилы вроде mo-herdr тебе не нужно использовать)";
  for (const path of [intentPath, businessPath])
    assert.match(
      readFileSync(path, "utf8"),
      new RegExp(exact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
});

test("the complete latest review is duplicated byte-for-byte in both intent ledgers", () => {
  const intentReviews = fencedText(readFileSync(intentPath, "utf8"));
  const businessReviews = fencedText(readFileSync(businessPath, "utf8"));
  const latest = intentReviews.at(-1);
  assert.match(latest, /^ниже 2 ревью\n/);
  assert.match(latest, /Nudge watchdog для Orca не срабатывает никогда/);
  assert.equal(businessReviews.at(-1), latest);
});

test("methodology preserves product intent but excludes narrow run-control approvals", () => {
  const methodology = readFileSync(join(ROOT, "shared", "references", "methodology.md"), "utf8");
  assert.match(
    methodology,
    /append it verbatim\s+to the task ledger and the project's business framing before implementation\s+continues/,
  );
  assert.match(methodology, /Redact secrets while preserving the sentence's meaning/);
  assert.match(methodology, /one-shot\s+approval.*is run control/is);
  assert.match(methodology, /do not mutate\s+tracked intent ledgers/);
});
