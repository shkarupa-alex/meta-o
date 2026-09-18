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

import { asciiJson, evaluate, inspectBacklog } from "../shared/scripts/mo-backlog.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const CLI = resolve(ROOT, "shared", "scripts", "mo-backlog.mjs");
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

const EMPTY =
  "# Бэклог\n\n" +
  "Здесь находится временная записная книжка только активной ветки фичи.\n" +
  "Подтверждённая работа вне текущего объёма живёт в Issues проекта или внешнего владельца, а не здесь.\n\n" +
  "Каждая временная запись — раздел третьего уровня с полями `Причина.`,\n" +
  "`Практическое влияние.` и `Следующий шаг.`. Перед завершением жизненного цикла\n" +
  "для каждой записи определяют исход, после чего раздел открытых записей снова пуст.\n\n" +
  "## Открыто\n";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/** §A-BACKLOG-01 builds isolated Git histories so worktree bytes cannot fake a PASS. */
function fixture(content = EMPTY) {
  const root = mkdtempSync(join(tmpdir(), "mo-backlog-"));
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
  const clone = spawnSync("git", ["clone", "-q", "--shared", ROOT, root], {
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
  for (const hidden of [
    "- unresolved work\n\n",
    "> unresolved work\n\n",
    "```text\nunresolved work\n```\n\n",
    "<!-- unresolved work -->\n\n",
    "---\n\n",
  ]) {
    const malformed = EMPTY.replace("## Открыто", `${hidden}## Открыто`);
    assert.deepEqual(inspectBacklog(malformed), { kind: "unknown", reason: "schema_invalid" });
  }
});

test("malformed CLI input is an internal error rather than an ambiguous backlog path", () => {
  const result = spawnSync(
    process.execPath,
    ["shared/scripts/mo-backlog.mjs", "--candidate", "bad"],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /reason=internal_error/u);
  assert.doesNotMatch(result.stderr, /reason=path_ambiguous/u);
});

test("portable path serialization escapes BMP and astral Unicode as ASCII JSON", () => {
  const original = "docs/бэклог-😀.md";
  const encoded = asciiJson(original);
  assert.equal(
    [...encoded].every((character) => character.codePointAt(0) <= 0x7f),
    true,
  );
  assert.match(encoded, /\\u0431/u);
  assert.match(encoded, /\\ud83d\\ude00/u);
  assert.equal(JSON.parse(encoded), original);
});

test("path diagnostics distinguish ambiguous spelling from repository escape", () => {
  const root = fixture();
  for (const path of ["./docs/backlog.md", "docs//backlog.md", "docs/../docs/backlog.md"]) {
    assert.match(evaluate({ root, path }).line, /reason=path_ambiguous/u);
  }
  for (const path of ["/etc/passwd", "../outside.md"]) {
    assert.match(evaluate({ root, path }).line, /reason=path_outside_repository/u);
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

test("a concurrent backlog edit after the first path probe cannot pass", () => {
  const root = fixture();
  let pathProbes = 0;
  const runGit = (gitRoot, args, encoding = "utf8") => {
    const result = spawnSync("git", ["-C", gitRoot, ...args], {
      encoding,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (args.join("\0") === "status\0--porcelain=v1\0--\0docs/backlog.md") {
      pathProbes += 1;
      if (pathProbes === 1) writeFileSync(join(root, "docs", "backlog.md"), `${EMPTY}\nraced\n`);
    }
    return result;
  };
  const result = evaluate({ root, runGit });
  assert.equal(pathProbes, 2);
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
  const result = spawnSync("make", ["mo-backlog"], {
    cwd: isolated,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /MO-BACKLOG-EMPTY version=1 sha=[a-f0-9]{40} /u);
  assert.equal(git(ROOT, ["status", "--porcelain=v1"]), before);
});

test("ordinary QC tests the closure target without requiring the live notebook to be empty", () => {
  const isolated = repositoryFixture(`${EMPTY}\n### Deferred\n\n**Причина.** R\n`);
  const result = spawnSync("make", ["mo-backlog"], {
    cwd: isolated,
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /MO-BACKLOG-NOT-EMPTY/u);
});

test("a foreign notebook needs its whole schema, never half of this project's", () => {
  const isolated = repositoryFixture();
  const run = (...args) =>
    spawnSync(process.execPath, [CLI, "--repo", isolated, ...args], { encoding: "utf8" });
  // Any one schema flag commits the caller to declaring all of it. Half a
  // schema would silently check a foreign notebook against Russian headings.
  for (const partial of [
    ["--path", "notes/backlog.md"],
    ["--title", "Backlog"],
    ["--open-heading", "Open"],
    ["--entry-field", "Reason."],
    ["--path", "notes/backlog.md", "--title", "Backlog"],
    ["--path", "notes/backlog.md", "--title", "Backlog", "--open-heading", "Open"],
  ]) {
    const result = run(...partial);
    assert.equal(result.status, 2, partial.join(" "));
    assert.match(result.stderr, /MO-BACKLOG-UNKNOWN version=1 reason=internal_error /u);
  }
  // A complete foreign schema is accepted and answers about that notebook.
  const complete = run(
    "--path",
    "notes/backlog.md",
    "--title",
    "Backlog",
    "--open-heading",
    "Open",
    "--entry-field",
    "Reason.",
  );
  assert.equal(complete.status, 2);
  assert.match(complete.stderr, /reason=missing_file .*notes\/backlog\.md/u);
});

test("the frozen line keeps its field order, names and streams", () => {
  const isolated = repositoryFixture();
  const empty = spawnSync(process.execPath, [CLI, "--repo", isolated], { encoding: "utf8" });
  // §4.3 freezes this grammar byte for byte: an earlier revision renamed `sha=`
  // to `head=` and dropped three fields, which broke every existing consumer.
  assert.equal(empty.status, 0);
  assert.equal(empty.stderr, "");
  assert.match(
    empty.stdout,
    /^MO-BACKLOG-EMPTY version=1 sha=[a-f0-9]{40} worktree=(?:clean|dirty) path="docs\/backlog\.md" entries=0 content_nodes=0\n$/u,
  );
  const head = spawnSync(
    process.execPath,
    [CLI, "--repo", isolated, "--expect-head", "0".repeat(40)],
    {
      encoding: "utf8",
    },
  );
  assert.equal(head.status, 2);
  assert.equal(head.stdout, "");
  assert.match(head.stderr, /^MO-BACKLOG-UNKNOWN version=1 reason=candidate_mismatch /u);
  const remote = spawnSync(
    process.execPath,
    [CLI, "--repo", isolated, "--remote-head", "0".repeat(40)],
    { encoding: "utf8" },
  );
  assert.equal(remote.status, 2);
  assert.match(remote.stderr, /^MO-BACKLOG-UNKNOWN version=1 reason=remote_head_unreadable /u);
});
