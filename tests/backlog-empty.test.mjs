/**
 * Prove the committed-blob feature backlog closure contract.
 *
 * Protects §A-BACKLOG-01.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { evaluate, inspectBacklog } from "../tools/backlog-empty.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

const EMPTY =
  "# Бэклог\n\n" +
  "Здесь находится временная записная книжка только активной feature branch.\n" +
  "Подтверждённая работа вне scope живёт в project или upstream Issues, а не здесь.\n\n" +
  "Каждая временная запись — раздел третьего уровня с полями `Причина.`,\n" +
  "`Практическое влияние.` и `Следующий шаг.`. Перед завершением lifecycle каждая\n" +
  "запись получает disposition, после чего раздел открытых записей снова пуст.\n\n" +
  "## Открыто\n";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/** §A-BACKLOG-01 builds isolated Git histories so worktree bytes cannot fake a PASS. */
function fixture(content = EMPTY) {
  const root = mkdtempSync(join(tmpdir(), "mo-backlog-empty-"));
  roots.push(root);
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  mkdirSync(join(root, "docs"));
  if (content !== null) writeFileSync(join(root, "docs", "backlog.md"), content);
  git(root, ["add", "."]);
  git(root, ["commit", "--allow-empty", "-qm", "fixture"]);
  return root;
}

function repositoryFixture(content = EMPTY) {
  const parent = mkdtempSync(join(tmpdir(), "mo-backlog-repository-"));
  roots.push(parent);
  const root = join(parent, "checkout");
  const clone = spawnSync("git", ["clone", "-q", "--no-hardlinks", ROOT, root], {
    encoding: "utf8",
  });
  assert.equal(clone.status, 0, clone.stderr);
  symlinkSync(join(ROOT, "node_modules"), join(root, "node_modules"));
  writeFileSync(join(root, "docs", "backlog.md"), content);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["add", "docs/backlog.md"]);
  git(root, ["commit", "--allow-empty", "-qm", "materialize fixture backlog"]);
  return root;
}

test("the AST owner distinguishes empty, entries, and arbitrary content", () => {
  assert.deepEqual(inspectBacklog(EMPTY), { kind: "empty", entries: 0, contentNodes: 0 });
  assert.deepEqual(inspectBacklog(`${EMPTY}\n### Deferred\n\nBody.\n`), {
    kind: "not_empty",
    entries: 1,
    contentNodes: 2,
  });
  assert.deepEqual(inspectBacklog(`${EMPTY}\nPlain content.\n`), {
    kind: "not_empty",
    entries: 0,
    contentNodes: 1,
  });
  for (const malformed of ["# Wrong\n\n## Открыто\n", `${EMPTY}\n## Открыто\n`]) {
    assert.deepEqual(inspectBacklog(malformed), { kind: "unknown", reason: "schema_invalid" });
  }
});

test("committed empty proof tolerates unrelated dirt but rejects backlog dirt", () => {
  const root = fixture();
  let result = evaluate({ root });
  assert.equal(result.status, "PASS");
  assert.match(result.line, /^MO-BACKLOG-EMPTY version=1 sha=[a-f0-9]{40} worktree=clean /u);
  writeFileSync(join(root, "note.txt"), "unrelated\n");
  result = evaluate({ root });
  assert.equal(result.status, "PASS");
  assert.match(result.line, /worktree=dirty/u);
  writeFileSync(join(root, "docs", "backlog.md"), `${EMPTY}\nchanged\n`);
  result = evaluate({ root });
  assert.equal(result.status, "UNKNOWN");
  assert.match(result.line, /reason=backlog_path_dirty/u);
});

test("a committed entry is NOT-EMPTY and candidate mismatch is typed", () => {
  const root = fixture(`${EMPTY}\n### Deferred\n\n**Причина.** R\n`);
  let result = evaluate({ root });
  assert.equal(result.status, "NOT_EMPTY");
  assert.match(result.line, /entries=1 content_nodes=2$/u);
  result = evaluate({ root, candidate: "0".repeat(40) });
  assert.equal(result.status, "UNKNOWN");
  assert.match(result.line, /reason=candidate_mismatch/u);
});

test("missing, symlink, invalid UTF-8, and malformed schema never pass", () => {
  let root = fixture(null);
  assert.match(evaluate({ root }).line, /reason=missing_file/u);

  root = fixture(null);
  writeFileSync(join(root, "target"), EMPTY);
  symlinkSync("../target", join(root, "docs", "backlog.md"));
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "symlink"]);
  assert.match(evaluate({ root }).line, /reason=not_regular_file/u);

  root = fixture(Buffer.from([0xff, 0xfe]));
  assert.match(evaluate({ root }).line, /reason=invalid_utf8/u);

  root = fixture("# Бэклог\n\n## Открыто\n");
  assert.match(evaluate({ root }).line, /reason=schema_invalid/u);
});

test("the public Make target emits the portable PASS header and changes no Git state", () => {
  const before = git(ROOT, ["status", "--porcelain=v1"]);
  const isolated = repositoryFixture();
  const result = spawnSync("make", ["mo-backlog-empty"], {
    cwd: isolated,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /MO-BACKLOG-EMPTY version=1 sha=[a-f0-9]{40} /u);
  assert.equal(git(ROOT, ["status", "--porcelain=v1"]), before);
});

test("ordinary QC tests the closure target without requiring the live notebook to be empty", () => {
  const isolated = repositoryFixture(`${EMPTY}\n### Deferred\n\n**Причина.** R\n`);
  const result = spawnSync("make", ["mo-backlog-empty"], {
    cwd: isolated,
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /MO-BACKLOG-NOT-EMPTY/u);
});
