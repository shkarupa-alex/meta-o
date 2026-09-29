/**
 * Prove what `mo-debug` extracts, what it refuses to read and what it hides.
 *
 * Protects §A-DIAGNOSTICS-01: the diagnostic reads only the invoking user's own
 * session logs, attributes loaded skill text to committed history rather than
 * to the installed copy, and never lets a credential or an absolute path reach
 * its output.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { attribute, openHistory } from "../shared/scripts/mo-debug-history.mjs";
import { EXCERPT_LIMIT, excerpt, redact } from "../shared/scripts/mo-debug-redact.mjs";
import {
  claudeBody,
  helperNames,
  metadataSourceTree,
  sourceTreeIn,
} from "../shared/scripts/mo-debug-text.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const CLI = join(ROOT, "shared", "scripts", "mo-debug.mjs");
const FIXTURES = join(ROOT, "tests", "fixtures", "mo-debug");
const CLAUDE_ID = "5b0c3a52-7f6e-4d1a-9c2b-3e4f5a6b7c8d";
const CODEX_ID = "01a0f000-0000-7000-8000-000000000001";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function temporary(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

/** A disposable HOME holding one Claude transcript and one Codex rollout. */
function fixtureHome() {
  const home = temporary("mo-debug-home-");
  const claude = join(home, ".claude", "projects", "-work-project");
  const codex = join(home, ".codex", "sessions", "2026", "09", "01");
  mkdirSync(claude, { recursive: true });
  mkdirSync(codex, { recursive: true });
  copyFileSync(join(FIXTURES, "claude-session.jsonl"), join(claude, `${CLAUDE_ID}.jsonl`));
  copyFileSync(
    join(FIXTURES, "codex-session.jsonl"),
    join(codex, `rollout-2026-09-01T11-00-00-${CODEX_ID}.jsonl`),
  );
  return { home, claude, codex };
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/** Three commits of `skills/mo-x/SKILL.md`; v2 and v3 share a body, not a stamp. */
function historyRepo() {
  const repo = temporary("mo-debug-history-");
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.name", "Fixture"]);
  git(repo, ["config", "user.email", "fixture@example.invalid"]);
  mkdirSync(join(repo, "skills", "mo-x"), { recursive: true });
  const shas = [];
  for (const version of [1, 2, 3]) {
    copyFileSync(join(FIXTURES, `skill-v${version}.txt`), join(repo, "skills", "mo-x", "SKILL.md"));
    writeFileSync(join(repo, "unrelated.txt"), `${version}\n`);
    git(repo, ["add", "."]);
    git(repo, ["commit", "-qm", `v${version}`]);
    shas.push(git(repo, ["rev-parse", "HEAD"]));
  }
  // A later commit that does not touch the skill must not change any range.
  writeFileSync(join(repo, "unrelated.txt"), "later\n");
  git(repo, ["commit", "-qam", "later"]);
  return { repo, short: shas.map((sha) => sha.slice(0, 12)) };
}

function run(home, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: home,
    env: { ...process.env, HOME: home },
    encoding: "utf8",
    timeout: 30_000,
  });
}

function reportOf(home, args) {
  const out = join(temporary("mo-debug-out-"), "report.md");
  const result = run(home, [...args, "--out", out]);
  return { result, report: readFileSync(out, "utf8"), out };
}

function eventRows(report) {
  return report.split("\n").filter((line) => /^\| (?:[0-9a-f-]+):\d+ \|/u.test(line));
}

test("Claude extraction finds invocations, loads and typed helper results", () => {
  const { home } = fixtureHome();
  const { result, report } = reportOf(home, ["scan", "--session", CLAUDE_ID]);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines[0], "MO-DEBUG/1 status=ok sessions=1 events=7 refused=0");
  assert.equal(
    lines[1],
    `session id=${CLAUDE_ID} harness=claude outcome=ok records=10 unparsed=1 untimed=1 skipped_since=0`,
  );
  const rows = eventRows(report);
  const kinds = rows.map((row) => row.split(" | ").slice(0, 3).join(" | "));
  assert.deepEqual(kinds, [
    `| ${CLAUDE_ID}:2 | skill\\_invocation | mo-x`,
    `| ${CLAUDE_ID}:3 | skill\\_loaded | mo-x`,
    `| ${CLAUDE_ID}:4 | skill\\_invocation | mo-x`,
    `| ${CLAUDE_ID}:5 | skill\\_loaded | mo-x`,
    `| ${CLAUDE_ID}:6 | helper\\_call | mo-x`,
    `| ${CLAUDE_ID}:7 | helper\\_result | mo-x`,
    `| ${CLAUDE_ID}:10 | skill\\_loaded | mo-x`,
  ]);
  assert.match(rows[5], /MO-REVIEW-REPORT\/1 status=malformed reason=index\\_body\\_mismatch/u);
  // Grepping a helper's source (line 9) is not a call of that helper.
  assert.doesNotMatch(report, new RegExp(`${CLAUDE_ID}:9 `, "u"));
  for (const category of [
    "skill_text_defect",
    "agent_deviation",
    "backend_defect",
    "harness_defect",
    "unknown",
  ]) {
    assert.match(report, new RegExp(`^### ${category}\\n\\n_To classify\\._$`, "mu"));
  }
});

test("Codex extraction covers attached skills, whole-file reads and both command shapes", () => {
  const { home } = fixtureHome();
  const { result, report } = reportOf(home, ["scan", "--session", CODEX_ID]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^MO-DEBUG\/1 status=ok sessions=1 events=\d+ refused=0$/mu);
  assert.match(
    result.stdout,
    new RegExp(`^session id=${CODEX_ID} harness=codex outcome=ok records=11 unparsed=1 `, "mu"),
  );
  const kinds = eventRows(report).map((row) => row.split(" | ").slice(0, 3).join(" | "));
  assert.deepEqual(kinds, [
    `| ${CODEX_ID}:3 | skill\\_invocation | mo-x`,
    `| ${CODEX_ID}:4 | skill\\_invocation | mo-x`,
    `| ${CODEX_ID}:5 | skill\\_loaded | mo-x`,
    `| ${CODEX_ID}:6 | skill\\_loaded | mo-x`,
    `| ${CODEX_ID}:7 | skill\\_loaded | mo-x`,
    `| ${CODEX_ID}:8 | helper\\_call | mo-x`,
    `| ${CODEX_ID}:8 | helper\\_result | mo-x`,
    `| ${CODEX_ID}:10 | helper\\_call | mo-x`,
    `| ${CODEX_ID}:11 | helper\\_result | mo-x`,
  ]);
  assert.match(report, /MO-BACKLOG-EMPTY version=1 sha=0123456789abcdef0123456789abcdef01234567/u);
  assert.match(report, /MO-HARNESS-SCREEN\/1 status=unknown harness=none exit=1/u);
  // Without history a visible stamp is only a claim: it is named, not attributed.
  assert.match(
    result.stdout,
    /^skill name=mo-x session=\S+ version=unknown commits=unknown history=none stamp=2{40}$/mu,
  );
  // The report carries the stamp too, the only evidence left of what was loaded.
  assert.match(
    report,
    new RegExp(`^\\| ${CODEX_ID} \\| mo-x \\| unknown \\| unknown \\| none \\| 2{40} \\|$`, "mu"),
  );
});

test("a visible source_tree stamp resolves to the commits that carried it", () => {
  const { home } = fixtureHome();
  const { repo, short } = historyRepo();
  const result = run(home, ["scan", "--session", CODEX_ID, "--history", repo]);
  assert.equal(result.status, 0, result.stderr);
  const skills = result.stdout.split("\n").filter((line) => line.startsWith("skill "));
  assert.deepEqual(skills, [
    `skill name=mo-x session=${CODEX_ID} version=source_tree:${"2".repeat(40)} commits=${short[1]}..${short[1]} history=complete stamp=${"2".repeat(40)}`,
    // `sed -n '1,3p'` printed exactly three lines: the file may be longer, and
    // the frontmatter never closed, so nothing about the version is known.
    `skill name=mo-x session=${CODEX_ID} version=unknown commits=unknown history=unused stamp=none`,
    `skill name=mo-x session=${CODEX_ID} version=source_tree:${"1".repeat(40)} commits=${short[0]}..${short[0]} history=complete stamp=${"1".repeat(40)}`,
  ]);
});

test("a stamp is attributed only with the complete committed bytes that carry it", () => {
  // A stamp is a claim: a local build carries one no commit held, and a partial
  // read or an installed file edited after the build keeps an old one.
  const { repo, short } = historyRepo();
  const committed = readFileSync(join(FIXTURES, "skill-v1.txt"), "utf8");
  const one = "1".repeat(40);
  const load = (sourceTree, text, complete = true) => ({
    name: "mo-x",
    sourceTree,
    complete,
    comparison: "file",
    candidates: complete ? [text] : [],
  });
  const history = () => openHistory(repo, 100);
  const claimed = "4".repeat(40);
  const local = committed.replace(one, claimed);
  assert.deepEqual(attribute(load(claimed, local), history()), {
    version: "unknown",
    commits: "none",
    history: "complete",
    stamp: claimed,
  });
  assert.deepEqual(attribute(load(claimed, local), null), {
    version: "unknown",
    commits: "unknown",
    history: "none",
    stamp: claimed,
  });
  assert.deepEqual(attribute(load(one, committed, false), history()), {
    version: "unknown",
    commits: "unknown",
    history: "unused",
    stamp: one,
  });
  assert.deepEqual(attribute(load(one, `${committed}An edit after the build.\n`), history()), {
    version: "unknown",
    commits: "none",
    history: "complete",
    stamp: one,
  });
  assert.deepEqual(attribute(load(one, committed), history()), {
    version: `source_tree:${one}`,
    commits: `${short[0]}..${short[0]}`,
    history: "complete",
    stamp: one,
  });
});

test("a Claude body without a stamp is matched byte for byte against committed bodies", () => {
  const { home } = fixtureHome();
  const { repo, short } = historyRepo();
  const result = run(home, ["scan", "--session", CLAUDE_ID, "--history", repo]);
  assert.equal(result.status, 0, result.stderr);
  const skills = result.stdout.split("\n").filter((line) => line.startsWith("skill "));
  assert.deepEqual(skills, [
    `skill name=mo-x session=${CLAUDE_ID} version=body_match commits=${short[0]}..${short[0]} history=complete stamp=none`,
    `skill name=mo-x session=${CLAUDE_ID} version=body_match commits=${short[1]}..${short[2]} history=complete stamp=none`,
    `skill name=mo-x session=${CLAUDE_ID} version=unknown commits=none history=complete stamp=none`,
  ]);
  const bounded = run(home, [
    "scan",
    "--session",
    CLAUDE_ID,
    "--history",
    repo,
    "--max-history",
    "2",
  ]);
  assert.equal(bounded.status, 0, bounded.stderr);
  assert.match(bounded.stdout, /^MO-DEBUG\/1 status=partial /u);
  assert.match(bounded.stdout, /version=body_match commits=\S+ history=partial stamp=none$/mu);
});

test("the Claude normalization and the stamp parser follow the recorded shapes", () => {
  const file = readFileSync(join(FIXTURES, "skill-v2.txt"), "utf8");
  assert.equal(claudeBody(file), file.slice(file.indexOf("\n---\n", 3) + 6));
  assert.equal(claudeBody(file).startsWith("# Fixture skill X\n"), true);
  assert.equal(claudeBody("no frontmatter\n"), null);
  assert.equal(metadataSourceTree(`metadata:\n  source_tree: ${"a".repeat(40)}\n`), "a".repeat(40));
  assert.equal(
    metadataSourceTree(`metadata:\n  nested:\n    source_tree: ${"a".repeat(40)}\n`),
    null,
  );
  assert.equal(metadataSourceTree(`source_tree: ${"a".repeat(40)}\n`), null);
  assert.equal(sourceTreeIn(`noise\n${file}`, "mo-x"), "2".repeat(40));
  assert.equal(sourceTreeIn(file, "mo-y"), null);
  assert.equal(sourceTreeIn(file.split("\n").slice(0, 4).join("\n"), "mo-x"), null);
  assert.deepEqual(helperNames("git show HEAD:tools/mo-backlog.mjs | head"), []);
  assert.deepEqual(helperNames("cd x && node --no-warnings ./scripts/mo-backlog.mjs"), [
    "mo-backlog",
  ]);
});

test("--max-records and --since bound what is read", () => {
  const { home } = fixtureHome();
  const capped = run(home, ["scan", "--session", CLAUDE_ID, "--max-records", "3"]);
  assert.equal(capped.status, 0, capped.stderr);
  assert.match(capped.stdout, /^MO-DEBUG\/1 status=partial /u);
  assert.match(capped.stdout, / outcome=partial records=3 /u);
  const since = run(home, ["scan", "--session", CLAUDE_ID, "--since", "2026-09-01T10:01:30Z"]);
  assert.equal(since.status, 0, since.stderr);
  assert.match(since.stdout, /^MO-DEBUG\/1 status=ok sessions=1 events=3 refused=0$/mu);
  assert.match(since.stdout, / untimed=1 skipped_since=4$/mu);
});

test("files outside the session roots, symlinks and non-regular files are never read", () => {
  const { home, claude, codex } = fixtureHome();
  const outside = temporary("mo-debug-outside-");
  const stolen = join(outside, `${CLAUDE_ID}.jsonl`);
  copyFileSync(join(FIXTURES, "claude-session.jsonl"), stolen);
  const fifo = join(outside, "pipe.jsonl");
  const insideFifo = join(claude, "pipe.jsonl");
  for (const path of [fifo, insideFifo]) {
    assert.equal(spawnSync("mkfifo", [path]).status, 0);
  }
  symlinkSync(stolen, join(claude, "link-out.jsonl"));
  symlinkSync(join(claude, `${CLAUDE_ID}.jsonl`), join(codex, `rollout-link-${CODEX_ID}x.jsonl`));
  const cases = [
    stolen,
    fifo,
    insideFifo,
    join(claude, "link-out.jsonl"),
    join(codex, `rollout-link-${CODEX_ID}x.jsonl`),
    join(claude, "..", "..", "..", "..", outside.split("/").at(-1), `${CLAUDE_ID}.jsonl`),
  ];
  for (const path of cases) {
    const result = run(home, ["scan", "--session", path]);
    // A FIFO would block a plain open; returning at all proves it was not.
    assert.equal(result.signal, null, `${path} hung`);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /^MO-DEBUG\/1 status=refused sessions=1 events=0 refused=1$/mu);
    assert.match(result.stdout, / outcome=foreign_path records=0 /u);
  }
});

test("ids resolve inside the roots only, and not-found or ambiguous ids are typed", () => {
  const { home, codex } = fixtureHome();
  const missing = run(home, ["scan", "--session", "ffffffff-ffff-4fff-8fff-ffffffffffff"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, / outcome=session_not_found /u);
  const hostile = run(home, ["scan", "--session", "*"]);
  assert.match(hostile.stdout, / outcome=session_not_found /u);
  // A fragment of a name or of the thread id never opens the one session holding it.
  for (const fragment of ["2026", CODEX_ID.slice(9, 13), CODEX_ID.slice(0, -4)]) {
    const partial = run(home, ["scan", "--session", fragment]);
    assert.equal(partial.status, 1, fragment);
    assert.match(partial.stdout, / outcome=session_not_found /u, fragment);
  }
  const exact = run(home, ["scan", "--session", CODEX_ID]);
  assert.equal(exact.status, 0, exact.stderr);
  const later = join(codex, "..", "02");
  mkdirSync(later);
  copyFileSync(
    join(FIXTURES, "codex-session.jsonl"),
    join(later, `rollout-2026-09-02T09-00-00-${CODEX_ID}.jsonl`),
  );
  const ambiguous = run(home, ["scan", "--session", CODEX_ID]);
  assert.equal(ambiguous.status, 1);
  assert.match(ambiguous.stdout, / outcome=session_ambiguous /u);
  const mixed = run(home, ["scan", "--session", CLAUDE_ID, "--session", "no-such-session"]);
  assert.equal(mixed.status, 0, mixed.stderr);
  assert.match(mixed.stdout, /^MO-DEBUG\/1 status=partial sessions=2 events=7 refused=1$/mu);
});

test("an unrecognized session format is unknown, not an empty success", () => {
  const { home, claude } = fixtureHome();
  const path = join(claude, "unknown-format.jsonl");
  copyFileSync(join(FIXTURES, "unknown-format.jsonl"), path);
  const result = run(home, ["scan", "--session", path]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^MO-DEBUG\/1 status=unknown sessions=1 events=0 refused=0$/mu);
  assert.match(result.stdout, / harness=claude outcome=unknown records=2 unparsed=0 /u);
});

/** Credential-shaped values are assembled at run time so no file holds one. */
function secretSamples() {
  return {
    anthropic_key: ["sk-ant-", "api03-", "A1b2C3d4E5f6G7h8I9j0K1l2"].join(""),
    api_key: ["sk-", "proj-", "Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2"].join(""),
    github_token: ["ghp", "_", "Q".repeat(36)].join(""),
    github_pat: ["github", "_pat_", "11AAAAAAA0", "b".repeat(40)].join(""),
    gitlab_token: ["glpat", "-", "c".repeat(20)].join(""),
    slack_token: ["xox", "b-", "1234567890-", "d".repeat(16)].join(""),
    aws_access_key: ["AKIA", "ABCDEFGHIJKLMNOP"].join(""),
    bearer_token: ["Bearer ", "e".repeat(32)].join(""),
    private_key: [
      "-----BEGIN ",
      "OPENSSH PRIVATE KEY-----\n",
      "f".repeat(64),
      "\n-----END OPENSSH PRIVATE KEY-----",
    ].join(""),
    assignment: ["password", "=", "g".repeat(14)].join(""),
    url_credentials: ["https://", "alice:", "h".repeat(12), "@git.example.com/repo.git"].join(""),
  };
}

function secretValue(kind, sample) {
  if (kind === "bearer_token") return sample.slice("Bearer ".length);
  if (kind === "assignment") return sample.slice("password=".length);
  if (kind === "url_credentials") return "h".repeat(12);
  if (kind === "private_key") return "f".repeat(64);
  return sample;
}

/** Write one command as a Claude and a Codex tool call and return both reports. */
function scanBothHarnesses(command, uuid, callId) {
  const { home, claude, codex } = fixtureHome();
  const claudeRecord = {
    sessionId: uuid,
    type: "assistant",
    timestamp: "2026-09-01T12:00:00.000Z",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: `toolu_${callId}`, name: "Bash", input: { command } }],
    },
  };
  writeFileSync(join(claude, `${uuid}.jsonl`), `${JSON.stringify(claudeRecord)}\n`);
  const rollout = join(codex, `rollout-2026-09-01T11-00-00-${CODEX_ID}.jsonl`);
  const codexRecord = {
    timestamp: "2026-09-01T11:06:00.000Z",
    type: "response_item",
    payload: {
      type: "function_call",
      name: "exec_command",
      // JSON-escaped quotes are the shape a Codex tool call carries.
      arguments: JSON.stringify({ cmd: command.replace("~/.claude", "~/.codex") }),
      call_id: `call_${callId}`,
    },
  };
  writeFileSync(rollout, `${readFileSync(rollout, "utf8")}${JSON.stringify(codexRecord)}\n`);
  return [uuid, CODEX_ID].map((id) => {
    const { result, report } = reportOf(home, ["scan", "--session", id]);
    assert.equal(result.status, 0, result.stderr);
    return { id, report, output: `${result.stdout}\n${report}` };
  });
}

/** Assert the redacted directories are gone and each basename survives as `<path>/<base>`. */
function assertPathsShortened({ id, output }, directories, bases) {
  for (const directory of directories) {
    assert.equal(output.includes(directory), false, `${id}: ${directory}`);
  }
  for (const base of bases) {
    assert.match(
      output,
      new RegExp(`<path\\\\?>/${base.replaceAll(".", "\\.")}`, "u"),
      `${id}: ${base}`,
    );
  }
}

test("an absolute path under any root keeps only its basename, in both harnesses' records", () => {
  // Roots outside any fixed list, and directory names that identify the org.
  const paths =
    "cat /etc/acmeorg/private.conf /usr/local/teamname/tool.mjs /nix/store/hashdir/pkgname file:///etc/acmeorg/url.conf";
  const directories = [
    "acmeorg",
    "teamname",
    "hashdir",
    "/etc",
    "/usr",
    "/nix",
    "local/",
    "store/",
  ];
  const kept = `https://host.example/docs/x docs/x ${SHA} claude-opus-5-5 provider/qwen3.8-27b`;
  const command = `${paths} ${kept} | node ~/.claude/skills/mo-x/scripts/mo-review-report.mjs validate`;
  for (const scan of scanBothHarnesses(command, "9f8e7d6c-5b4a-4321-8fed-cba987654323", "p")) {
    assertPathsShortened(scan, directories, ["private.conf", "tool.mjs", "pkgname", "url.conf"]);
    // URLs, repository paths and identifiers are evidence, not locations.
    const row = eventRows(scan.report).find((line) => line.includes("private.conf"));
    for (const word of [
      "https://host.example/docs/x",
      " docs/x",
      SHA,
      "claude-opus-5-5",
      "provider/qwen3.8-27b",
    ]) {
      assert.equal(row.includes(word), true, `${scan.id}: ${word} in ${row}`);
    }
  }
  assert.equal(redact("/help and /effort high"), "/help and /effort high");
});

test("a path with spaces, brackets or a network root is shortened whole, quoted or not", () => {
  // A space ended the path, so `"/usr/local/Acme Team/tool.mjs"` kept `Acme
  // Team/tool.mjs`; brackets and a `//host/share` root were cut the same way.
  const command = [
    `node "/usr/local/Acme Team/tool.mjs" "/Applications/Visual Studio Code.app/bin/code"`,
    `/etc/acme[prod]/secret.conf //fileserver/Private Team/share.conf`,
    `https://host.example/docs/x /help docs/x ${SHA} provider/qwen3.8-27b`,
    `| node ~/.claude/skills/mo-x/scripts/mo-review-report.mjs validate`,
  ].join(" ");
  const directories = ["Acme", "Visual Studio", "acme", "prod", "fileserver", "Private"];
  for (const scan of scanBothHarnesses(command, "9f8e7d6c-5b4a-4321-8fed-cba987654324", "s")) {
    assertPathsShortened(scan, directories, ["tool.mjs", "code", "secret.conf", "share.conf"]);
    const row = eventRows(scan.report).find((line) => line.includes("secret.conf"));
    for (const word of [
      "https://host.example/docs/x",
      "/help docs/x",
      SHA,
      "provider/qwen3.8-27b",
    ]) {
      assert.equal(row.includes(word), true, `${scan.id}: ${word} in ${row}`);
    }
  }
  // An unquoted space splits shell arguments, so a directory followed by words
  // that continue its hierarchy is one path; a file path ends at the space.
  assert.equal(redact("cat /etc/a.conf docs/x"), "cat <path>/a.conf docs/x");
  assert.equal(redact("cd /usr/local/Acme && ls docs/x"), "cd <path>/Acme && ls docs/x");
});

test("a quoted command whose last argument is a home directory never names the account", () => {
  // The quotes were read as one path, so its last segment, the account, was kept.
  const command =
    '/bin/zsh -lc "/usr/bin/env ls /home/someone" | node ~/.claude/skills/mo-x/scripts/mo-review-report.mjs validate';
  for (const scan of scanBothHarnesses(command, "9f8e7d6c-5b4a-4321-8fed-cba987654326", "h")) {
    assertPathsShortened(scan, ["someone", "/usr"], ["zsh", "env"]);
  }
  assert.equal(redact('bash -c "/bin/ls /home/alice"'), 'bash -c "<path>/ls <path>"');
  assert.equal(
    redact('{"command":"bash -c \\"/usr/bin/du -sh /Users/alice/\\""}'),
    '{"command":"bash -c \\"<path>/du -sh <path>\\""}',
  );
  assert.equal(
    redact('"C:\\Windows\\cmd.exe /c dir C:\\Users\\alice"'),
    '"<path>/cmd.exe /c dir <path>"',
  );
  // Wherever a path is joined, the segment after `home` or `Users` is withheld.
  assert.equal(redact('"/mnt/backup/home/alice"'), '"<path>"');
  // A shortened basename is not read again as a path, and `$&` in it is literal.
  assert.equal(redact('"/srv/data/tmp"'), '"<path>/tmp"');
  assert.equal(redact('cat "/srv/a$&b.txt"'), 'cat "<path>/a$&b.txt"');
  assert.equal(redact('node "/usr/local/Acme Team/tool.mjs"'), 'node "<path>/tool.mjs"');
});

test("a shell-escaped space keeps an unquoted path whole, in both harnesses and the redactor", () => {
  // The escape ended the segment, so `Acme\ Team/tool.mjs` stayed in the report.
  const command = [
    "node /usr/local/Acme\\ Team/tool.mjs;",
    "code /Applications/Visual\\ Studio\\ Code.app/bin/code",
    `https://host.example/docs/x /help docs/x ${SHA} provider/qwen3.8-27b`,
    "| node ~/.claude/skills/mo-x/scripts/mo-review-report.mjs validate",
  ].join(" ");
  const directories = ["usr/local", "Acme", "Team", "Applications", "Visual", "Code.app"];
  for (const scan of scanBothHarnesses(command, "9f8e7d6c-5b4a-4321-8fed-cba987654325", "e")) {
    assertPathsShortened(scan, directories, ["tool.mjs", "code"]);
    const row = eventRows(scan.report).find((line) => line.includes("tool.mjs"));
    for (const word of [
      "https://host.example/docs/x",
      "/help docs/x",
      SHA,
      "provider/qwen3.8-27b",
    ]) {
      assert.equal(row.includes(word), true, `${scan.id}: ${word} in ${row}`);
    }
  }
  assert.equal(
    redact("node /usr/local/Acme\\ Team/tool.mjs docs/x"),
    "node <path>/tool.mjs docs/x",
  );
  assert.equal(
    redact("code /Applications/Visual\\ Studio\\ Code.app/bin/code"),
    "code <path>/code",
  );
  assert.equal(redact("C:\\Users\\someone\\notes.txt"), "<path>/notes.txt");
});

test("redaction replaces every credential kind and keeps identifiers verbatim", () => {
  const kept = `commit ${SHA} session ${CLAUDE_ID} model claude-opus-5-5 package @eslint/js`;
  for (const [kind, sample] of Object.entries(secretSamples())) {
    const redacted = redact(`${kept} ${sample} tail`);
    assert.equal(redacted.includes(secretValue(kind, sample)), false, kind);
    const label = kind === "github_pat" ? "github_token" : kind;
    assert.equal(redacted.includes(`[REDACTED:${label}]`), true, `${kind}: ${redacted}`);
    assert.equal(redacted.startsWith(kept), true, kind);
  }
  assert.equal(redact(kept), kept);
  // A value a specific rule typed keeps its type in any key or option position.
  for (const [kind, sample] of Object.entries(secretSamples())) {
    const label = kind === "github_pat" ? "github_token" : kind;
    if (["private_key", "url_credentials", "bearer_token", "assignment"].includes(label)) continue;
    for (const input of [`EXAMPLE_TOKEN=${sample} tail`, `x --token ${sample} tail`]) {
      const redacted = redact(input);
      assert.equal(redacted.includes(`[REDACTED:${label}]`), true, `${kind}: ${redacted}`);
      assert.equal(redacted.includes(secretValue(kind, sample)), false, kind);
      assert.equal(redact(redacted), redacted, kind);
    }
  }
  assert.equal(
    redact("max_output_tokens: 30000 token_count=12"),
    "max_output_tokens: 30000 token_count=12",
  );
  assert.equal(
    redact("cat /home/someone/.claude/skills/mo-x/SKILL.md /Users/someone"),
    "cat <path>/SKILL.md <path>",
  );
  assert.equal(
    redact("C:\\Users\\someone\\notes.txt and /tmp/x/y.log"),
    "<path>/notes.txt and <path>/y.log",
  );
  assert.equal(redact("file:///mnt/data/run.jsonl"), "file://<path>/run.jsonl");
  assert.equal(redact("project -home-someone-work/a.jsonl"), "project <path>/a.jsonl");
  const long = `${"word ".repeat(900)}${secretSamples().github_token}`;
  assert.equal(excerpt(long).length <= EXCERPT_LIMIT, true);
  assert.equal(excerpt(long).includes("QQQQ"), false);
});

test("secrets and absolute paths never reach stdout or the report", () => {
  const { home, claude } = fixtureHome();
  const samples = secretSamples();
  const UUID = "9f8e7d6c-5b4a-4321-8fed-cba987654321";
  const records = Object.values(samples).map((sample, index) =>
    JSON.stringify({
      sessionId: UUID,
      type: "assistant",
      timestamp: "2026-09-01T12:00:00.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: `toolu_${index}`,
            name: "Bash",
            input: {
              command: `echo ${sample} ${SHA} claude-opus-5-5 | node ${home}/.claude/skills/mo-x/scripts/mo-review-report.mjs validate --file /tmp/r.md`,
            },
          },
        ],
      },
    }),
  );
  writeFileSync(join(claude, `${UUID}.jsonl`), `${records.join("\n")}\n`);
  const { result, report } = reportOf(home, ["scan", "--session", UUID]);
  assert.equal(result.status, 0, result.stderr);
  const output = `${result.stdout}\n${report}`;
  for (const [kind, sample] of Object.entries(samples)) {
    assert.equal(output.includes(secretValue(kind, sample)), false, kind);
  }
  assert.equal(output.includes(home), false);
  assert.doesNotMatch(output, /(?<![\w<>~.])\/(?:home|Users|mnt|tmp|var)\//u);
  assert.equal(eventRows(report).length, Object.keys(samples).length);
  for (const row of eventRows(report)) {
    assert.match(row, new RegExp(`${SHA} claude-opus-5-5`, "u"));
    // The report escapes Markdown punctuation, so the placeholder reads `\[REDACTED:…\]`.
    assert.match(row, /\\\[REDACTED:[a-z\\_]+\\\]/u);
    assert.match(row, /\\<path\\>\/mo-review-report\.mjs/u);
  }
  assert.match(output, new RegExp(UUID, "u"));
});

test("a quoted multi-word credential is redacted whole, in both harnesses' records", () => {
  const { home, claude, codex } = fixtureHome();
  const secrets = `password="correct horse battery staple" api_key: 'alpha beta gamma'`;
  const words = ["correct", "horse", "battery", "staple", "alpha", "beta", "gamma"];
  const command = `echo ${secrets} message="kept words" | node ~/.claude/skills/mo-x/scripts/mo-review-report.mjs validate`;
  const UUID = "9f8e7d6c-5b4a-4321-8fed-cba987654322";
  const claudeRecord = {
    sessionId: UUID,
    type: "assistant",
    timestamp: "2026-09-01T12:00:00.000Z",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_q", name: "Bash", input: { command } }],
    },
  };
  writeFileSync(join(claude, `${UUID}.jsonl`), `${JSON.stringify(claudeRecord)}\n`);
  const rollout = join(codex, `rollout-2026-09-01T11-00-00-${CODEX_ID}.jsonl`);
  const codexRecord = {
    timestamp: "2026-09-01T11:05:00.000Z",
    type: "response_item",
    payload: {
      type: "function_call",
      name: "exec_command",
      arguments: JSON.stringify({ cmd: command.replace("~/.claude", "~/.codex") }),
      call_id: "call_q",
    },
  };
  writeFileSync(rollout, `${readFileSync(rollout, "utf8")}${JSON.stringify(codexRecord)}\n`);
  for (const id of [UUID, CODEX_ID]) {
    const { result, report } = reportOf(home, ["scan", "--session", id]);
    assert.equal(result.status, 0, result.stderr);
    const output = `${result.stdout}\n${report}`;
    for (const word of words) assert.equal(output.includes(word), false, `${id}: ${word}`);
    // An ordinary quoted argument stays readable for diagnosis.
    assert.match(output, /kept words/u, id);
  }
  // An unclosed quote at a window edge exposes nothing after it either.
  const cut = excerpt(`token="${"x".repeat(5000)} tail words`);
  assert.equal(/x{8}|tail/u.test(cut), false, cut);
});

test("a short or option-form credential is redacted, in both harnesses' records", () => {
  const cases = [
    [
      "pwd=x password=12 token=abc",
      "pwd=[REDACTED:assignment] password=[REDACTED:assignment] token=[REDACTED:assignment]",
    ],
    [
      "docker login -u bob --password s3cr3tValue reg.example",
      "docker login -u bob --password [REDACTED:flag] reg.example",
    ],
    ["gh auth login --token 0a1b2c3d4e5f", "gh auth login --token [REDACTED:flag]"],
    ['x --api-key "k3y Value" tail', 'x --api-key "[REDACTED:flag]" tail'],
    ["mysql -u root -ps3cret db", "mysql -u root -p[REDACTED:flag] db"],
    ["curl -u bob:s3cret https://host/x", "curl -u bob:[REDACTED:user_credentials] https://host/x"],
    // A quoted, glued, escaped or differently cased argument is one argument too.
    ['mysql -u root -p"correct horse" db', 'mysql -u root -p"[REDACTED:flag]" db'],
    ["mariadb -p'correct horse' db", "mariadb -p'[REDACTED:flag]' db"],
    ["mysql -pcorrect\\ horse db", "mysql -p[REDACTED:flag] db"],
    [
      'curl -u "alice:correct horse" https://h',
      'curl -u "alice:[REDACTED:user_credentials]" https://h',
    ],
    [
      "curl --user='alice:correct horse' https://h",
      "curl --user='alice:[REDACTED:user_credentials]' https://h",
    ],
    ["curl -ubob:pa@ss https://h", "curl -ubob:[REDACTED:user_credentials] https://h"],
    ["x --Password s3c -Token abc", "x --Password [REDACTED:flag] -Token [REDACTED:flag]"],
    // The whole shell word goes, across adjacent bare and quoted segments.
    ['x --password pre"correct horse"post tail', "x --password [REDACTED:flag] tail"],
    ['mysql -p"correct horse"post db', "mysql -p[REDACTED:flag] db"],
    ['PASSWORD=pre"correct horse"post run', "PASSWORD=[REDACTED:assignment] run"],
    ['x --password "a\\"b c" tail', 'x --password "[REDACTED:flag]" tail'],
    [
      'curl -u alice:"correct horse" https://h',
      'curl -u alice:"[REDACTED:user_credentials]" https://h',
    ],
    [
      'curl -u "alice:correct horse"suffix https://h',
      'curl -u "alice:[REDACTED:user_credentials]" https://h',
    ],
    [
      "curl -u me@example.com:ATATT3xFfGF0 https://h",
      "curl -u me@example.com:[REDACTED:user_credentials] https://h",
    ],
    [
      "curl --user me@example.com:ATATT3xFfGF0 https://h",
      "curl --user me@example.com:[REDACTED:user_credentials] https://h",
    ],
    // A later segment may open with a space or be empty, and a user name may
    // carry `/`, `=` or `@`; only a glued `-u` needs a plain name.
    ['x --password pre" correct horse"post tail', "x --password [REDACTED:flag] tail"],
    ['x --password pre""post tail', "x --password [REDACTED:flag] tail"],
    [
      'curl -u alice:" correct horse" https://h',
      'curl -u alice:"[REDACTED:user_credentials]" https://h',
    ],
    [
      "curl -u tenant/user:s3cr3t https://h",
      "curl -u tenant/user:[REDACTED:user_credentials] https://h",
    ],
    [
      "curl --user uid=alice:s3cr3t https://h",
      "curl --user uid=alice:[REDACTED:user_credentials] https://h",
    ],
    ["go run -user=alice:secret", "go run -user=alice:[REDACTED:user_credentials]"],
    ["don't; x --password 'a b' tail", "don't; x --password '[REDACTED:flag]' tail"],
    [
      '{"cmd":"bash -c \\"x --token abc\\"","cwd":"docs/y"}',
      '{"cmd":"bash -c \\"x --token [REDACTED:flag]\\"","cwd":"docs/y"}',
    ],
    // A quote that closes an enclosing string or a JSON string ends the word.
    ['bash -c "x --token abc" && ls docs/x', 'bash -c "x --token [REDACTED:flag]" && ls docs/x'],
    [
      '{"cmd":"x --token abc","cwd":"docs/y"}',
      '{"cmd":"x --token [REDACTED:flag]","cwd":"docs/y"}',
    ],
    [
      '{"cmd":"curl -u \\"alice:correct horse\\" https://h"}',
      '{"cmd":"curl -u \\"alice:[REDACTED:user_credentials]\\" https://h"}',
    ],
  ];
  for (const [input, expected] of cases) {
    assert.equal(redact(input), expected);
    assert.equal(redact(expected), expected, `idempotent: ${expected}`);
  }
  // A counter or a prompted option is not a credential and stays readable.
  const kept =
    "max_output_tokens=3 token_count=2 --max-tokens 5 mysql -P3306 -p db --password --stdin git push -u origin main go run -url=https://host/x";
  assert.equal(redact(kept), kept);

  const { home, claude, codex } = fixtureHome();
  const values = [
    "s3cr3tValue",
    "0a1b2c3d4e5f",
    "PIN12",
    "correct",
    "horse",
    "zzpre",
    "zzpost",
    "ATATT3xFfGF0",
  ];
  const command =
    'docker login --password s3cr3tValue && mysql -p"correct horse" db && x --password zzpre" correct horse"zzpost && pwd=PIN12 node ~/.claude/skills/mo-setup/scripts/mo-setup.mjs check';
  const UUID = "9f8e7d6c-5b4a-4321-8fed-cba987654323";
  const claudeRecord = {
    sessionId: UUID,
    type: "assistant",
    timestamp: "2026-09-01T12:00:00.000Z",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_f", name: "Bash", input: { command } }],
    },
  };
  writeFileSync(join(claude, `${UUID}.jsonl`), `${JSON.stringify(claudeRecord)}\n`);
  const rollout = join(codex, `rollout-2026-09-01T11-00-00-${CODEX_ID}.jsonl`);
  const codexRecord = {
    timestamp: "2026-09-01T11:05:00.000Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: '$mo-debug with --token 0a1b2c3d4e5f and curl -u "alice:correct horse" or curl -u me@example.com:ATATT3xFfGF0 or curl -u tenant/user:Tn4ntPw',
        },
      ],
    },
  };
  writeFileSync(rollout, `${readFileSync(rollout, "utf8")}${JSON.stringify(codexRecord)}\n`);
  for (const id of [UUID, CODEX_ID]) {
    const { result, report } = reportOf(home, ["scan", "--session", id]);
    assert.equal(result.status, 0, result.stderr);
    const output = `${result.stdout}\n${report}`;
    for (const value of values) assert.equal(output.includes(value), false, `${id}: ${value}`);
    // The event rows exist and carry the typed marker, so the value was read and replaced.
    assert.equal(eventRows(report).length > 0, true, id);
    assert.match(report, /REDACTED:flag/u, id);
  }
});

test("--out creates a private new file and refuses to overwrite an existing one", () => {
  const { home } = fixtureHome();
  const { result, out } = reportOf(home, ["scan", "--session", CLAUDE_ID]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(statSync(out).mode & 0o777, 0o600);
  const again = run(home, ["scan", "--session", CLAUDE_ID, "--out", out]);
  assert.equal(again.status, 2);
  assert.equal(again.stdout, "");
  assert.match(again.stderr, /^MO-DEBUG\/1 status=error reason=out_exists$/mu);
  const target = join(temporary("mo-debug-link-"), "target.md");
  writeFileSync(target, "keep\n");
  const link = join(temporary("mo-debug-link-"), "report.md");
  symlinkSync(target, link);
  assert.equal(run(home, ["scan", "--session", CLAUDE_ID, "--out", link]).status, 2);
  assert.equal(readFileSync(target, "utf8"), "keep\n");
});

test("call errors exit 2 before anything is read or written", () => {
  const { home } = fixtureHome();
  const out = join(temporary("mo-debug-out-"), "report.md");
  for (const [args, reason] of [
    [[], "usage"],
    [["scan"], "usage"],
    [["scan", "--session", CLAUDE_ID, "--max-records", "0"], "usage"],
    [["scan", "--session", CLAUDE_ID, "--since", "yesterday"], "since_invalid"],
    [
      ["scan", "--session", CLAUDE_ID, "--history", join(home, "absent"), "--out", out],
      "history_unreadable",
    ],
  ]) {
    const result = run(home, args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, new RegExp(`^MO-DEBUG/1 status=error reason=${reason}$`, "mu"));
  }
  assert.throws(() => statSync(out), { code: "ENOENT" });
  const help = run(home, ["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^usage: mo-debug\.mjs scan --session <path-or-id>/u);
});
