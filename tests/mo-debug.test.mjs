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
  chmodSync,
  lstatSync,
  readdirSync,
  renameSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { after, test } from "node:test";

import { attribute, openHistory } from "../shared/scripts/mo-debug-history.mjs";
import { createClaudeExtractor } from "../shared/scripts/mo-debug-claude.mjs";
import { createCodexExtractor } from "../shared/scripts/mo-debug-codex.mjs";
import { scan } from "../shared/scripts/mo-debug.mjs";
import { resolveSession } from "../shared/scripts/mo-debug-sessions.mjs";
import { EXCERPT_LIMIT, excerpt, redact } from "../shared/scripts/mo-debug-redact.mjs";
import {
  claudeBody,
  claudeBodyCandidates,
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

// CODEX_HOME and CLAUDE_CONFIG_DIR move the session roots, so they reach the
// helper only when a test names them, never from the suite's own environment.
function run(home, args, codexHome, claudeConfigDir) {
  const env = { ...process.env, HOME: home };
  delete env.CODEX_HOME;
  delete env.CLAUDE_CONFIG_DIR;
  if (codexHome !== undefined) env.CODEX_HOME = codexHome;
  if (claudeConfigDir !== undefined) env.CLAUDE_CONFIG_DIR = claudeConfigDir;
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: home,
    env,
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

test("only the arguments recorded for a Claude load are stripped before matching", () => {
  // Cutting at the last `ARGUMENTS:` marker made a locally edited skill equal to
  // an older committed body; only the suffix of this load's own Skill call or
  // the slash command just before it may go.
  const { home, claude } = fixtureHome();
  const { repo, short } = historyRepo();
  const body = claudeBody(readFileSync(join(FIXTURES, "skill-v1.txt"), "utf8"));
  const edited = body.replace("Version one", "Locally changed");
  const marker = "\n\nARGUMENTS: ";
  const added = "Uncommitted instruction.";
  const given = "review candidate";
  const base = { sessionId: CLAUDE_ID, cwd: "/home/fixture-user/work/project", version: "2.1.0" };
  const at = (n) => `2026-09-01T10:0${n}:00.000Z`;
  const skill = (n, id, args) => ({
    ...base,
    timestamp: at(n),
    type: "assistant",
    uuid: `a${n}`,
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name: "Skill", input: { skill: "mo-x", args } }],
    },
  });
  const slash = (n, args) => ({
    ...base,
    timestamp: at(n),
    type: "user",
    uuid: `c${n}`,
    message: {
      role: "user",
      content: `<command-message>mo-x</command-message>\n<command-name>/mo-x</command-name>\n<command-args>${args}</command-args>`,
    },
  });
  const answer = (n) => ({
    ...base,
    timestamp: at(n),
    type: "assistant",
    uuid: `r${n}`,
    message: { role: "assistant", content: [{ type: "text", text: "Cancelled." }] },
  });
  const load = (n, source, shown) => ({
    ...base,
    timestamp: at(n),
    type: "user",
    uuid: `l${n}`,
    isMeta: true,
    ...(source ? { sourceToolUseID: source } : {}),
    message: {
      role: "user",
      content: [
        {
          type: "text",
          text: `Base directory for this skill: /home/fixture-user/.claude/skills/mo-x\n\n${shown}`,
        },
      ],
    },
  });
  const unknown = `skill name=mo-x session=${CLAUDE_ID} version=unknown commits=none history=complete stamp=none`;
  const matched = `skill name=mo-x session=${CLAUDE_ID} version=body_match commits=${short[0]}..${short[0]} history=complete stamp=none`;
  // One session per case: the report merges equal skill lines of one session.
  for (const [records, expected] of [
    // The marker belongs to the shown text, not to the empty recorded arguments.
    [[skill(1, "s1", ""), load(1, "s1", `${body}${marker}${added}`)], unknown],
    // No Skill call and no slash command: nothing is known to strip.
    [[load(2, null, `${body}${marker}${added}`)], unknown],
    // Recorded arguments that are not the shown suffix strip nothing.
    [[skill(3, "s3", given), load(3, "s3", `${body}${marker}${added}`)], unknown],
    // The exact recorded suffix goes, through a Skill call and a slash command.
    [[skill(4, "s4", given), load(4, "s4", `${body}${marker}${given}`)], matched],
    [[slash(5, given), load(5, null, `${body}${marker}${given}`)], matched],
    // A slash command the model already answered strips nothing from a later load.
    [[slash(7, given), answer(7), load(7, null, `${body}${marker}${given}`)], unknown],
    // Stripping real arguments never hides an edit of the body itself.
    [[skill(6, "s6", given), load(6, "s6", `${edited}${marker}${given}`)], unknown],
  ]) {
    writeFileSync(
      join(claude, `${CLAUDE_ID}.jsonl`),
      records.map((record) => JSON.stringify(record)).join("\n") + "\n",
    );
    const result = run(home, ["scan", "--session", CLAUDE_ID, "--history", repo]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      result.stdout.split("\n").filter((line) => line.startsWith("skill ")),
      [expected],
      records.at(-1).message.content[0].text.slice(-40),
    );
  }
  // An authored body that itself ends with the marker keeps it, and arguments
  // that contain the marker are removed whole, once.
  const authored = `${body}${marker}${added}`;
  assert.deepEqual(claudeBodyCandidates(authored, ""), [authored]);
  assert.deepEqual(claudeBodyCandidates(authored, null), [authored]);
  assert.deepEqual(claudeBodyCandidates(`${authored}${marker}${given}`, given), [
    `${authored}${marker}${given}`,
    authored,
  ]);
  const nested = `first${marker}second`;
  assert.deepEqual(claudeBodyCandidates(`${authored}${marker}${nested}`, nested), [
    `${authored}${marker}${nested}`,
    authored,
  ]);
});

test("both extractors count only an installed SKILL.md read as a skill load", () => {
  // Opening the authored source to edit it is development, not a load; the
  // Claude extractor used to report it as one while the Codex one did not.
  const text = readFileSync(join(FIXTURES, "skill-v1.txt"), "utf8");
  const claudeLoads = (path) => {
    const { evidence, feed } = createClaudeExtractor(CLAUDE_ID);
    const base = {
      sessionId: CLAUDE_ID,
      cwd: "/repo",
      version: "2.1.0",
      timestamp: "2026-09-01T10:00:00.000Z",
    };
    feed(
      {
        ...base,
        type: "assistant",
        uuid: "a1",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "r1", name: "Read", input: { file_path: path } }],
        },
      },
      1,
    );
    feed(
      {
        ...base,
        type: "user",
        uuid: "u1",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "r1", content: text }],
        },
      },
      2,
    );
    return evidence.events.filter((event) => event.kind === "skill_loaded").length;
  };
  const codexLoads = (path) => {
    const { evidence, feed } = createCodexExtractor(CODEX_ID);
    const command = `cat ${path}`;
    feed(
      {
        timestamp: "2026-09-01T11:00:00.000Z",
        type: "event_msg",
        payload: {
          type: "item_completed",
          thread_id: CODEX_ID,
          turn_id: "t1",
          item: {
            type: "CommandExecution",
            id: "exec-1",
            command: ["/bin/bash", "-lc", command],
            cwd: "file:///repo",
            parsed_cmd: [{ type: "read", cmd: command, name: "SKILL.md", path }],
            status: "completed",
            stdout: text,
            stderr: "",
            aggregated_output: text,
            exit_code: 0,
          },
        },
      },
      1,
    );
    return evidence.events.filter((event) => event.kind === "skill_loaded").length;
  };
  for (const [path, expected] of [
    ["/repo/src/skills/mo-review-orca/SKILL.md", 0],
    ["/tmp/mo-foo/SKILL.md", 0],
    ["/home/u/.claude/skills/mo-review-orca/SKILL.md", 1],
    ["/home/u/.codex/skills/mo-review-orca/SKILL.md", 1],
  ]) {
    assert.equal(claudeLoads(path), expected, `claude ${path}`);
    assert.equal(codexLoads(path), expected, `codex ${path}`);
  }
});

/** A loaded, complete copy of one committed fixture version, stamp included. */
function loadOf(version) {
  const text = readFileSync(join(FIXTURES, `skill-v${version}.txt`), "utf8");
  const stamp = String(version).repeat(40);
  return {
    name: "mo-x",
    sourceTree: stamp,
    complete: true,
    comparison: "file",
    candidates: [text],
  };
}

// A `git` on PATH that answers one `cat-file` mode wrongly and hands every
// other call to the real Git. Modes: `exit` fails with nothing written,
// `prefix` writes the first answer and fails, `missing` answers every object
// as missing and succeeds, `killed` writes the first answer and dies, and
// `vanish` answers truthfully and then deletes itself, so the next Git cannot
// start at all and leaves no stdout.
function fakeGit(mode, verb) {
  const bin = temporary("mo-debug-fake-git-");
  const real = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
  const script = `#!${process.execPath}
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const input = require("node:fs").readFileSync(0);
const result = spawnSync(${JSON.stringify(real)}, args, { input, maxBuffer: 1 << 28 });
if (!args.includes(${JSON.stringify(verb)}) || ${JSON.stringify(mode)} === "vanish") {
  if (args.includes(${JSON.stringify(verb)})) require("node:fs").unlinkSync(process.argv[1]);
  process.stdout.write(result.stdout);
  process.exit(result.status ?? 1);
}
const out = result.stdout;
const firstLine = out.indexOf(10);
const header = out.subarray(0, firstLine).toString().split(" ");
const first = ${JSON.stringify(verb)} === "--batch" && header[2] !== undefined
  ? out.subarray(0, firstLine + 1 + Number(header[2]) + 1)
  : out.subarray(0, firstLine + 1);
const mode = ${JSON.stringify(mode)};
if (mode === "exit") process.exit(42);
if (mode === "missing") {
  const names = input.toString().split("\\n").filter(Boolean);
  process.stdout.write(names.map((name) => name + " missing\\n").join(""));
  process.exit(0);
}
process.stdout.write(first, () => {
  if (mode === "killed") process.kill(process.pid, "SIGKILL");
  else process.exit(42);
});
`;
  writeFileSync(join(bin, "git"), script);
  chmodSync(join(bin, "git"), 0o755);
  return bin;
}

function withPath(bin, action, only = false) {
  const saved = process.env.PATH;
  process.env.PATH = only ? bin : `${bin}:${saved}`;
  try {
    return action();
  } finally {
    process.env.PATH = saved;
  }
}

test("a shallow clone or a failed Git read never claims a complete history", () => {
  const { repo, short } = historyRepo();
  // Controls: the full history attributes exactly and is complete.
  assert.deepEqual(attribute(loadOf(1), openHistory(repo, 2000)), {
    version: `source_tree:${"1".repeat(40)}`,
    commits: `${short[0]}..${short[0]}`,
    history: "complete",
    stamp: "1".repeat(40),
  });

  // (1) and (2): a depth-1 clone cannot see v1, and a match on v3 still says
  // nothing about the commits it cannot reach.
  const shallow = join(temporary("mo-debug-shallow-"), "clone");
  git(tmpdir(), ["clone", "-q", "--depth", "1", `file://${repo}`, shallow]);
  const cut = openHistory(shallow, 2000);
  assert.deepEqual(attribute(loadOf(1), cut), {
    version: "unknown",
    commits: "none",
    history: "partial",
    stamp: "1".repeat(40),
  });
  const latest = attribute(loadOf(3), cut);
  assert.equal(latest.version, `source_tree:${"3".repeat(40)}`);
  assert.equal(latest.history, "partial");

  // (3) to (5): each failed read is unreadable, never a complete negative.
  for (const [mode, verb] of [
    ["exit", "--batch-check"],
    ["prefix", "--batch-check"],
    ["killed", "--batch-check"],
    ["exit", "--batch"],
    ["prefix", "--batch"],
    ["missing", "--batch"],
    ["killed", "--batch"],
  ]) {
    const bin = fakeGit(mode, verb);
    const result = withPath(bin, () => attribute(loadOf(1), openHistory(repo, 2000)));
    assert.equal(result.history, "unreadable", `${mode} ${verb}: ${JSON.stringify(result)}`);
  }

  // (6): a Git that cannot start leaves no stdout at all. The fake is the only
  // Git on PATH, so after it deletes itself the next read has nothing to run.
  for (const verb of ["--is-shallow-repository", "rev-list", "--batch-check"]) {
    const bin = fakeGit("vanish", verb);
    const result = withPath(bin, () => attribute(loadOf(1), openHistory(repo, 2000)), true);
    assert.equal(result.history, "unreadable", `vanish ${verb}: ${JSON.stringify(result)}`);
  }
});

test("a commit that deleted the skill is history, not a failed read", () => {
  const repo = temporary("mo-debug-deleted-");
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.name", "Fixture"]);
  git(repo, ["config", "user.email", "fixture@example.invalid"]);
  const file = join(repo, "skills", "mo-x", "SKILL.md");
  mkdirSync(join(repo, "skills", "mo-x"), { recursive: true });
  for (const step of ["v1", "v2", "delete", "v3"]) {
    if (step === "delete") git(repo, ["rm", "-q", "skills/mo-x/SKILL.md"]);
    else {
      mkdirSync(join(repo, "skills", "mo-x"), { recursive: true });
      copyFileSync(join(FIXTURES, `skill-${step}.txt`), file);
      git(repo, ["add", "."]);
    }
    git(repo, ["commit", "-qm", step]);
  }
  const result = attribute(loadOf(1), openHistory(repo, 2000));
  assert.equal(result.version, `source_tree:${"1".repeat(40)}`);
  assert.equal(result.history, "complete");
});

test("the CLI reports a shallow history as partial", () => {
  const { home } = fixtureHome();
  const { repo } = historyRepo();
  const shallow = join(temporary("mo-debug-shallow-"), "clone");
  git(tmpdir(), ["clone", "-q", "--depth", "1", `file://${repo}`, shallow]);
  const result = run(home, ["scan", "--session", CODEX_ID, "--history", shallow]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^MO-DEBUG\/1 status=partial /u);
  assert.doesNotMatch(result.stdout, /history=complete/u);
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

test("a session whose every record precedes --since is an empty window, not an unknown format", () => {
  const { home, claude, codex } = fixtureHome();
  const after = ["--since", "2027-01-01T00:00:00Z"];
  // Only parsed, timestamped Claude records, so none is fed past the bound.
  const transcript = join(claude, `${CLAUDE_ID}.jsonl`);
  const timestamp = (line) => {
    try {
      return Date.parse(JSON.parse(line).timestamp);
    } catch {
      return Number.NaN;
    }
  };
  const timed = readFileSync(transcript, "utf8")
    .split("\n")
    .filter((line) => !Number.isNaN(timestamp(line)));
  writeFileSync(transcript, `${timed.join("\n")}\n`);
  const claudeScan = run(home, ["scan", "--session", CLAUDE_ID, ...after]);
  assert.equal(claudeScan.status, 0, claudeScan.stderr);
  assert.match(claudeScan.stdout, /^MO-DEBUG\/1 status=ok sessions=1 events=0 refused=0$/mu);
  assert.match(
    claudeScan.stdout,
    new RegExp(` outcome=ok records=${timed.length} .*skipped_since=${timed.length}$`, "mu"),
  );
  const rollout = join(codex, `rollout-2026-09-01T11-00-00-${CODEX_ID}.jsonl`);
  const records = readFileSync(rollout, "utf8")
    .split("\n")
    .filter((line) => !Number.isNaN(timestamp(line)));
  writeFileSync(rollout, `${records.join("\n")}\n`);
  const codexScan = run(home, ["scan", "--session", CODEX_ID, ...after]);
  assert.equal(codexScan.status, 0, codexScan.stderr);
  assert.match(codexScan.stdout, /^MO-DEBUG\/1 status=ok sessions=1 events=0 refused=0$/mu);
  assert.match(
    codexScan.stdout,
    new RegExp(` outcome=ok records=${records.length} .*skipped_since=${records.length}$`, "mu"),
  );
  // A file of garbled lines stays an unknown format whatever the window.
  writeFileSync(transcript, "not json\nstill not json\n");
  const garbled = run(home, ["scan", "--session", CLAUDE_ID, ...after]);
  assert.equal(garbled.status, 1, garbled.stderr);
  assert.match(garbled.stdout, / outcome=unknown records=2 unparsed=2 /u);
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

test("a read that fails on one owned log settles that session alone", () => {
  const { home } = fixtureHome();
  const options = (sessions, read) => ({
    sessions,
    home,
    places: null,
    maxRecords: Infinity,
    since: null,
    read,
  });
  // The fixture logs fit in one chunk: call 1 reads the whole first log, and
  // call 2 is the read that would have seen its end.
  const failingOn = (failing) => {
    let calls = 0;
    return (fd, buffer) => {
      calls += 1;
      if (calls === failing) throw Object.assign(new Error("EIO"), { code: "EIO" });
      return readSync(fd, buffer);
    };
  };
  const eio = () => failingOn(1);
  // (1) The first read fails: that session is read_failed, the other one is kept.
  const first = scan(options([CLAUDE_ID, CODEX_ID], eio()));
  assert.deepEqual(
    first.sessions.map((session) => session.outcome),
    ["read_failed", "ok"],
  );
  assert.equal(first.sessions[0].harness, "claude");
  assert.match(first.lines[0], /^MO-DEBUG\/1 status=partial sessions=2 /u);
  const alone = scan(options([CODEX_ID])).events.length;
  assert.equal(first.events.length, alone);
  // (2) A read fails after lines were yielded: those events are withheld rather
  // than shown as a complete read.
  const late = scan(options([CLAUDE_ID, CODEX_ID], failingOn(2)));
  assert.equal(late.sessions[0].outcome, "read_failed");
  assert.deepEqual(late.sessions[0].events, []);
  assert.equal(late.events.length, alone);
  // (3) The only session fails: the scan still returns a typed unknown.
  const only = scan(options([CLAUDE_ID], eio()));
  assert.equal(only.status, "unknown");
  assert.match(only.lines[0], /^MO-DEBUG\/1 status=unknown sessions=1 events=0 refused=0$/u);
  // (4) Without the failure the same log is read as before.
  assert.equal(scan(options([CLAUDE_ID])).sessions[0].outcome, "ok");
});

test("a set CODEX_HOME replaces the default Codex root, and only an absolute one is accepted", () => {
  const { home, claude, codex } = fixtureHome();
  const name = `rollout-2026-09-01T11-00-00-${CODEX_ID}.jsonl`;
  const alt = join(home, "alt");
  const moved = join(alt, "sessions", "2026", "09", "01");
  mkdirSync(moved, { recursive: true });
  copyFileSync(join(codex, name), join(moved, name));
  const outcome = (result) => / outcome=([a-z_]+) /u.exec(result.stdout)?.[1];
  // (1) The user's own rollout under $CODEX_HOME/sessions reads by path and by id.
  assert.equal(outcome(run(home, ["scan", "--session", join(moved, name)], alt)), "ok");
  const byId = run(home, ["scan", "--session", CODEX_ID], alt);
  assert.equal(outcome(byId), "ok", byId.stdout + byId.stderr);
  // (2) The variable replaces the default rather than widening it.
  assert.equal(outcome(run(home, ["scan", "--session", join(codex, name)], alt)), "foreign_path");
  rmSync(join(moved, name));
  assert.equal(outcome(run(home, ["scan", "--session", CODEX_ID], alt)), "session_not_found");
  // (3) Unset or empty keeps the default root.
  for (const value of [undefined, ""]) {
    assert.equal(outcome(run(home, ["scan", "--session", CODEX_ID], value)), "ok", `${value}`);
  }
  // (4) A symlinked root behaves exactly as a symlinked default root: an
  // explicit path is checked against the root's realpath, and an id lookup
  // walks the root at that same realpath.
  const elsewhere = temporary("mo-debug-codex-elsewhere-");
  copyFileSync(join(codex, name), join(elsewhere, name));
  const linked = join(home, "linked");
  mkdirSync(linked);
  symlinkSync(elsewhere, join(linked, "sessions"));
  const defaultLink = temporary("mo-debug-default-link-");
  mkdirSync(join(defaultLink, ".codex"), { recursive: true });
  symlinkSync(elsewhere, join(defaultLink, ".codex", "sessions"));
  for (const [spec, expected] of [
    [join(linked, "sessions", name), "ok"],
    [CODEX_ID, "ok"],
  ]) {
    const viaVariable = outcome(run(home, ["scan", "--session", spec], linked));
    const defaultSpec = spec === CODEX_ID ? spec : join(defaultLink, ".codex", "sessions", name);
    assert.equal(viaVariable, outcome(run(defaultLink, ["scan", "--session", defaultSpec])), spec);
    assert.equal(viaVariable, expected, spec);
  }
  // (5) A relative value is a call error, never resolved against the cwd.
  const relative = run(home, ["scan", "--session", CODEX_ID], "alt");
  assert.equal(relative.status, 2);
  assert.match(relative.stderr, /^MO-DEBUG\/1 status=error reason=codex_home_relative$/mu);
  // (6) Claude sessions are unaffected.
  const own = run(home, ["scan", "--session", join(claude, `${CLAUDE_ID}.jsonl`)], alt);
  assert.equal(outcome(own), "ok");
  assert.equal(outcome(run(home, ["scan", "--session", CLAUDE_ID], alt)), "ok");
});

test("a set CLAUDE_CONFIG_DIR replaces the default Claude root, and only an absolute one is accepted", () => {
  const { home, claude } = fixtureHome();
  const outcomeOf = (result) => / outcome=([a-z_]+) /u.exec(result.stdout)?.[1] ?? null;
  const config = temporary("mo-debug-claude-config-");
  const moved = join(config, "projects", "-work-project");
  mkdirSync(moved, { recursive: true });
  const log = join(moved, `${CLAUDE_ID}.jsonl`);
  copyFileSync(join(FIXTURES, "claude-session.jsonl"), log);
  rmSync(join(claude, `${CLAUDE_ID}.jsonl`));
  // (1) The user's own transcript under $CLAUDE_CONFIG_DIR/projects reads by
  // path and by id.
  const claudeRun = (args, value) => run(home, args, undefined, value);
  for (const spec of [log, CLAUDE_ID]) {
    const result = claudeRun(["scan", "--session", spec], config);
    assert.equal(outcomeOf(result), "ok", spec);
    assert.match(result.stdout, / harness=claude /u, spec);
  }
  // (2) The variable replaces the default root: a transcript left under
  // ~/.claude/projects is foreign by path and absent by id.
  copyFileSync(log, join(claude, `${CLAUDE_ID}.jsonl`));
  rmSync(log);
  assert.equal(
    outcomeOf(claudeRun(["scan", "--session", join(claude, `${CLAUDE_ID}.jsonl`)], config)),
    "foreign_path",
  );
  assert.equal(outcomeOf(claudeRun(["scan", "--session", CLAUDE_ID], config)), "session_not_found");
  // (3) Unset or empty keeps the default root.
  for (const value of [undefined, ""]) {
    assert.equal(outcomeOf(claudeRun(["scan", "--session", CLAUDE_ID], value)), "ok", `${value}`);
  }
  // (4) A relative value is a call error, never resolved against the cwd.
  const relative = claudeRun(["scan", "--session", CLAUDE_ID], "relative/dir");
  assert.equal(relative.status, 2);
  assert.match(relative.stderr, /^MO-DEBUG\/1 status=error reason=claude_config_dir_relative$/mu);
  // (5) A root behind a parent the user cannot traverse is not proven absent.
  const shut = temporary("mo-debug-claude-shut-");
  const hidden = join(shut, "config");
  mkdirSync(join(hidden, "projects"), { recursive: true });
  chmodSync(shut, 0o000);
  try {
    assert.equal(
      outcomeOf(claudeRun(["scan", "--session", CLAUDE_ID], hidden)),
      "search_incomplete",
    );
  } finally {
    chmodSync(shut, 0o755);
  }
});

test("an unreadable directory makes an id search incomplete, and other sessions survive", () => {
  const { home, claude, codex } = fixtureHome();
  const outcomes = (result) =>
    [...result.stdout.matchAll(/ outcome=([a-z_]+) /gu)].map(([, o]) => o);
  const locked = (path, action) => {
    chmodSync(path, 0o000);
    try {
      return action();
    } finally {
      chmodSync(path, 0o755);
    }
  };
  // (1) An unreadable Codex date directory: the Claude match cannot be proven
  // the only one, so the id is unknown, not ok, found-once or not found.
  locked(codex, () => {
    const { result, report, out } = reportOf(home, [
      "scan",
      "--session",
      CLAUDE_ID,
      "--max-records",
      "50",
    ]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /^MO-DEBUG\/1 status=unknown sessions=1 events=0 refused=0$/mu);
    assert.deepEqual(outcomes(result), ["search_incomplete"]);
    assert.ok(report.length > 0);
    assert.equal(statSync(out).mode & 0o777, 0o600);
  });
  // (2) An unreadable root of either harness, whichever harness the id belongs to.
  for (const [root, id] of [
    [join(home, ".claude", "projects"), CODEX_ID],
    [join(home, ".codex", "sessions"), CLAUDE_ID],
  ]) {
    locked(root, () => {
      const result = run(home, ["scan", "--session", id]);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.deepEqual(outcomes(result), ["search_incomplete"], root);
    });
  }
  // (3) A readable explicit session keeps its events next to the incomplete one.
  const explicit = join(claude, `${CLAUDE_ID}.jsonl`);
  const alone = eventRows(reportOf(home, ["scan", "--session", explicit]).report).length;
  assert.ok(alone > 0);
  locked(codex, () => {
    const { result, report } = reportOf(home, [
      "scan",
      "--session",
      explicit,
      "--session",
      CLAUDE_ID,
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^MO-DEBUG\/1 status=partial sessions=2 /mu);
    assert.deepEqual(outcomes(result), ["ok", "search_incomplete"]);
    assert.equal(eventRows(report).length, alone);
  });
  // (4) A child that disappears between listing its parent and reading it.
  const vanishing = (dir, options) => {
    if (dir === codex) throw Object.assign(new Error("gone"), { code: "ENOENT" });
    return readdirSync(dir, options);
  };
  assert.deepEqual(resolveSession(CODEX_ID, home, null, { readdir: vanishing, lstat: lstatSync }), {
    outcome: "search_incomplete",
  });
  // (5) Controls: a complete search still finds, misses and refuses as before.
  assert.equal(resolveSession(CODEX_ID, home).path.endsWith(`${CODEX_ID}.jsonl`), true);
  assert.deepEqual(resolveSession("ffffffff-ffff-4fff-8fff-ffffffffffff", home), {
    outcome: "session_not_found",
  });
});

test("a root the user cannot reach is unknown, while an absent root is proven absent", () => {
  const { home } = fixtureHome();
  const outcome = (result) => / outcome=([a-z_]+) /u.exec(result.stdout)?.[1];
  const locked = (path, action) => {
    chmodSync(path, 0o000);
    try {
      return action();
    } finally {
      chmodSync(path, 0o755);
    }
  };
  // (1) and (2): an untraversable parent of the Codex root hides it for either id.
  locked(join(home, ".codex"), () => {
    const codexId = run(home, ["scan", "--session", CODEX_ID]);
    assert.equal(outcome(codexId), "search_incomplete");
    assert.match(codexId.stdout, /^MO-DEBUG\/1 status=unknown /mu);
    assert.equal(codexId.status, 1);
    assert.equal(outcome(run(home, ["scan", "--session", CLAUDE_ID])), "search_incomplete");
  });
  // (3) The same through CODEX_HOME.
  const alt = join(home, "alt");
  mkdirSync(join(alt, "sessions"), { recursive: true });
  locked(alt, () => {
    assert.equal(outcome(run(home, ["scan", "--session", CODEX_ID], alt)), "search_incomplete");
  });
  // (4) An untraversable parent of the Claude root, for both ids.
  locked(join(home, ".claude"), () => {
    for (const id of [CLAUDE_ID, CODEX_ID]) {
      assert.equal(outcome(run(home, ["scan", "--session", id])), "search_incomplete", id);
    }
  });
  // (5) Controls: a removed root or a root that is a file is a proven absence.
  const bare = fixtureHome().home;
  rmSync(join(bare, ".codex"), { recursive: true });
  assert.equal(outcome(run(bare, ["scan", "--session", CODEX_ID])), "session_not_found");
  assert.equal(outcome(run(bare, ["scan", "--session", CLAUDE_ID])), "ok");
  mkdirSync(join(bare, ".codex"));
  writeFileSync(join(bare, ".codex", "sessions"), "not a directory\n");
  assert.equal(outcome(run(bare, ["scan", "--session", CODEX_ID])), "session_not_found");
  // (6) Any other error on the root probe, such as EIO, is not an absence.
  const failing = {
    readdir: readdirSync,
    lstat: (path) => {
      if (path === join(home, ".codex", "sessions")) {
        throw Object.assign(new Error("io"), { code: "EIO" });
      }
      return lstatSync(path);
    },
  };
  assert.deepEqual(resolveSession(CLAUDE_ID, home, null, failing), {
    outcome: "search_incomplete",
  });
});

test("an id search never calls a session absent in a place it did not look", () => {
  const outcome = (result) => / outcome=([a-z_]+) /u.exec(result.stdout)?.[1];
  // (2) and (3): a symlinked default Codex root and Claude root are walked at
  // their realpath, so the user's own session is found by id.
  for (const [harness, id] of [
    [join(".codex", "sessions"), CODEX_ID],
    [join(".claude", "projects"), CLAUDE_ID],
  ]) {
    const { home } = fixtureHome();
    const moved = temporary("mo-debug-moved-root-");
    renameSync(join(home, harness), join(moved, "root"));
    symlinkSync(join(moved, "root"), join(home, harness));
    assert.equal(outcome(run(home, ["scan", "--session", id])), "ok", harness);
  }
  // (4) A rollout below the depth bound was not looked at, so the search is
  // incomplete rather than a proven absence.
  const { home, codex } = fixtureHome();
  const name = `rollout-2026-09-01T11-00-00-${CODEX_ID}.jsonl`;
  const deep = join(home, ".codex", "sessions", "a", "b", "c", "d", "e", "f", "g");
  mkdirSync(deep, { recursive: true });
  renameSync(join(codex, name), join(deep, name));
  assert.equal(outcome(run(home, ["scan", "--session", CODEX_ID])), "search_incomplete");
});

test("the Codex walk budget holds inside one directory and never fakes a complete search", () => {
  const home = join(sep, "virtual");
  const root = join(home, ".codex", "sessions");
  const rollout = (id = CODEX_ID) => `rollout-2026-09-30T00-00-00-${id}.jsonl`;
  // A virtual tree: every directory lists its entries, and each entry counts
  // how often the walk looked at it.
  const walk = (tree) => {
    let looked = 0;
    const dirent = (name, directory) => ({
      name,
      isDirectory: () => {
        looked += 1;
        return directory;
      },
      isFile: () => !directory,
    });
    const io = {
      readdir: (dir) => {
        const entries = tree.get(dir);
        if (!entries) throw Object.assign(new Error("absent"), { code: "ENOENT" });
        return entries.map(([name, directory]) => dirent(name, directory));
      },
      lstat: (path) => {
        if (!tree.has(path)) throw Object.assign(new Error("absent"), { code: "ENOENT" });
        return { isDirectory: () => true, isSymbolicLink: () => false };
      },
    };
    return { result: resolveSession(CODEX_ID, home, null, io), looked: () => looked };
  };
  const files = (count) => Array.from({ length: count }, (_, n) => [`note-${n}.txt`, false]);
  // (3) A match past the budget in one wide directory is never reached.
  const wide = walk(new Map([[root, [...files(200_000), [rollout(), false]]]]));
  assert.deepEqual(wide.result, { outcome: "search_incomplete" });
  assert.equal(wide.looked(), 200_000);
  // (4) Exactly the budget, all of it read, proves absence.
  assert.deepEqual(walk(new Map([[root, files(200_000)]])).result, {
    outcome: "session_not_found",
  });
  // (5) A match already found does not prove uniqueness while a directory is unread.
  const child = join(root, "2026");
  const cut = walk(
    new Map([
      [root, [["2026", true], [rollout(), false], ...files(199_998)]],
      [child, []],
    ]),
  );
  assert.deepEqual(cut.result, { outcome: "search_incomplete" });
  // (6) Files at the depth bound are still read.
  const deepest = join(root, "a", "b", "c", "d", "e", "f");
  const chain = (leaf) => {
    const tree = new Map([[deepest, leaf]]);
    for (let dir = deepest; dir !== root; dir = dirname(dir)) {
      tree.set(dirname(dir), [[basename(dir), true]]);
    }
    return tree;
  };
  assert.equal(walk(chain([[rollout(), false]])).result.path, join(deepest, rollout()));
  assert.deepEqual(walk(chain(files(3))).result, { outcome: "session_not_found" });
  // (2) A readable match next to a directory past the depth bound is not unique.
  const both = chain([["g", true]]);
  both.set(root, [...both.get(root), [rollout(), false]]);
  assert.deepEqual(walk(both).result, { outcome: "search_incomplete" });
});

test("the skill names every way an id search can end incomplete", () => {
  const skill = readFileSync(join(ROOT, "skills", "mo-debug", "SKILL.md"), "utf8").replace(
    /\s+/gu,
    " ",
  );
  assert.match(skill, /`search_incomplete` means a session root could not be reached/u);
  assert.match(skill, /`partial` means [^.]*an id search was incomplete/u);
  assert.match(skill, /`unknown` means [^.]*its id search was incomplete/u);
  assert.match(skill, /`read_failed` means an owned log was opened but reading it failed/u);
  assert.match(skill, /`partial` means [^.]*a read failed next to a readable session/u);
  assert.match(skill, /`unknown` means [^.]*its read failed/u);
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
              // A keyed credential hides the rest of its line, so the evidence comes first.
              command: `echo ${SHA} claude-opus-5-5 | node ${home}/.claude/skills/mo-x/scripts/mo-review-report.mjs validate --file /tmp/r.md; echo ${sample}`,
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
  const command = `node ~/.claude/skills/mo-x/scripts/mo-review-report.mjs validate message="kept words" ${secrets}`;
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

// Each input with its exact redaction; every output must also be idempotent.
// A keyed credential hides the rest of its line, whatever quotes follow.
const OPTION_FORM_CASES = [
  ["pwd=x", "pwd=[REDACTED:assignment]"],
  ["pwd=x password=12 token=abc", "pwd=[REDACTED:assignment]"],
  [
    "docker login -u bob --password s3cr3tValue reg.example",
    "docker login -u bob --password [REDACTED:flag]",
  ],
  ["gh auth login --token 0a1b2c3d4e5f", "gh auth login --token [REDACTED:flag]"],
  ['x --api-key "k3y Value" tail', "x --api-key [REDACTED:flag]"],
  ["x --Password s3c -Token abc", "x --Password [REDACTED:flag]"],
  ["mysql -u root -ps3cret db", "mysql -u root -p[REDACTED:flag]"],
  ['mysql -u root -p"correct horse" db', "mysql -u root -p[REDACTED:flag]"],
  ["mariadb -p'correct horse' db", "mariadb -p[REDACTED:flag]"],
  ["curl -u bob:s3cret https://host/x", "curl -u bob:[REDACTED:user_credentials]"],
  ['curl -u "alice:correct horse" https://h', 'curl -u "alice:[REDACTED:user_credentials]'],
  ["curl --user='alice:correct horse' https://h", "curl --user='alice:[REDACTED:user_credentials]"],
  ["curl -ubob:pa@ss https://h", "curl -ubob:[REDACTED:user_credentials]"],
  ["curl -u tenant/user:s3cr3t https://h", "curl -u tenant/user:[REDACTED:user_credentials]"],
  ["curl --user uid=alice:s3cr3t https://h", "curl --user uid=alice:[REDACTED:user_credentials]"],
  [
    "curl -u me@example.com:ATATT3xFfGF0 https://h",
    "curl -u me@example.com:[REDACTED:user_credentials]",
  ],
  ["go run -user=alice:secret", "go run -user=alice:[REDACTED:user_credentials]"],
  // A Windows domain name holds a backslash that escapes no quote.
  [
    "curl --ntlm -u CORP\\alice:Zq9Secret https://h",
    "curl --ntlm -u CORP\\alice:[REDACTED:user_credentials]",
  ],
  [
    "curl -u 'CORP\\alice:Zq9 Secret' https://h",
    "curl -u 'CORP\\alice:[REDACTED:user_credentials]",
  ],
  [
    'curl -u "CORP\\alice:Zq9 Secret" https://h',
    'curl -u "CORP\\alice:[REDACTED:user_credentials]',
  ],
  [
    "curl --user CORP\\alice:Zq9Secret https://h",
    "curl --user CORP\\alice:[REDACTED:user_credentials]",
  ],
  [
    "curl --user=CORP\\alice:Zq9Secret https://h",
    "curl --user=CORP\\alice:[REDACTED:user_credentials]",
  ],
  ["curl -uCORP\\alice:Zq9Secret https://h", "curl -uCORP\\alice:[REDACTED:user_credentials]"],
  [
    '{"cmd":"curl -u \\"CORP\\\\alice:Zq9 Secret\\" https://h"}',
    '{"cmd":"curl -u \\"CORP\\\\alice:[REDACTED:user_credentials]',
  ],
  ['PASSWORD=pre"correct horse"post run', "PASSWORD=[REDACTED:assignment]"],
  ["api_key: 'Zq9 Secret' tail", "api_key: [REDACTED:assignment]"],
  ['{"password": "Zq9 Secret", "n": 1}', '{"password": [REDACTED:assignment]'],
  ['{"cmd":"x --token abc","cwd":"docs/y"}', '{"cmd":"x --token [REDACTED:flag]'],
  [
    '{"cmd":"curl -u \\"alice:correct horse\\" https://h"}',
    '{"cmd":"curl -u \\"alice:[REDACTED:user_credentials]',
  ],
  ['{\\"password\\": \\"Zq9 Secret\\"}', '{\\"password\\": [REDACTED:assignment]'],
  ["curl -H 'X-Api-Key: Zq9 Secret' https://h", "curl -H 'X-Api-Key: [REDACTED:assignment]"],
  // A quote the old reading took for a closing one no longer matters.
  ["the '90s login: x --password pre' Zq9 Secret", "the '90s login: x --password [REDACTED:flag]"],
  ["bash -c 'x --token abc' && ls docs/q", "bash -c 'x --token [REDACTED:flag]"],
  // A value a token shape typed keeps its type, and the rest of the line still goes.
  [
    'curl -u "bob:ghp_AAAAAAAAAAAAAAAAAAAA"-extra https://h',
    'curl -u "bob:[REDACTED:github_token]',
  ],
  // Only the line of the credential is hidden.
  ["ls docs\nPASSWORD=Zq9 make\ngit status", "ls docs\nPASSWORD=[REDACTED:assignment]\ngit status"],
  ["x --password\nnext", "x --password\nnext"],
];

// Keys that end in a secret-key compound or a separator-bounded `pass`, and a
// URL whose user name is empty; each input with its exact redaction.
const KEYED_VOCABULARY_CASES = [
  ["SECRET_KEY=Zq9Secret tail", "SECRET_KEY=[REDACTED:assignment]"],
  ["STRIPE_SECRET_KEY=sk_live_Zq9Secret", "STRIPE_SECRET_KEY=[REDACTED:assignment]"],
  ["aws_secret_key: Zq9Secret", "aws_secret_key: [REDACTED:assignment]"],
  ['{"secretKey": "Zq9 Secret", "n": 1}', '{"secretKey": [REDACTED:assignment]'],
  ["x --secret-key Zq9Secret tail", "x --secret-key [REDACTED:flag]"],
  ["DB_PASS=Zq9Secret make", "DB_PASS=[REDACTED:assignment]"],
  ["PASSPHRASE='Zq9 Secret'", "PASSPHRASE=[REDACTED:assignment]"],
  ["gpg --batch --passphrase Zq9Secret -c f", "gpg --batch --passphrase [REDACTED:flag]"],
  ["redis://:Zq9Secret@localhost:6379/0", "redis://[REDACTED:url_credentials]@localhost:6379/0"],
  [
    "REDIS_URL=rediss://:Zq9Secret@cache:6380",
    "REDIS_URL=rediss://[REDACTED:url_credentials]@cache:6380",
  ],
];

test("a secret-key compound, a separator-bounded pass and an empty URL user are redacted", () => {
  for (const [input, expected] of KEYED_VOCABULARY_CASES) {
    assert.equal(redact(input), expected);
    assert.equal(redact(expected), expected, `idempotent: ${expected}`);
  }
  // A word that only contains `pass`, a counter and a port are not credentials.
  const kept =
    "bypass=1 compass: north --pass-through x passes=3 secret_key_count=3 git@host:repo.git http://host:8080/x";
  assert.equal(redact(kept), kept);

  const { home, claude, codex } = fixtureHome();
  const lines = KEYED_VOCABULARY_CASES.map(([input]) => input).join("\n");
  const UUID = "9f8e7d6c-5b4a-4321-8fed-cba987654324";
  const record = {
    sessionId: UUID,
    type: "assistant",
    timestamp: "2026-09-01T12:00:00.000Z",
    message: {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "toolu_v",
          name: "Skill",
          input: { skill: "mo-debug", args: lines },
        },
      ],
    },
  };
  writeFileSync(join(claude, `${UUID}.jsonl`), `${JSON.stringify(record)}\n`);
  const rollout = join(codex, `rollout-2026-09-01T11-00-00-${CODEX_ID}.jsonl`);
  const message = {
    timestamp: "2026-09-01T11:05:00.000Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: `$mo-debug ${lines}` }],
    },
  };
  writeFileSync(rollout, `${readFileSync(rollout, "utf8")}${JSON.stringify(message)}\n`);
  for (const id of [UUID, CODEX_ID]) {
    const { result, report } = reportOf(home, ["scan", "--session", id]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(report, /skill\\_invocation \| mo-debug \|/u, id);
    assert.doesNotMatch(`${result.stdout}\n${report}`, /Zq9|Secret/u, id);
  }
});

// A Windows domain user in a command, plain and as the JSON text of one.
const DOMAIN_USERS = [
  "curl --ntlm -u CORP\\alice:Zq9Secret https://h",
  '{"cmd":"curl -u \\"CORP\\\\alice:Zq9 Secret\\" https://h"}',
];

test("a short or option-form credential is redacted, in both harnesses' records", () => {
  const cases = OPTION_FORM_CASES;
  for (const [input, expected] of cases) {
    assert.equal(redact(input), expected);
    assert.equal(redact(expected), expected, `idempotent: ${expected}`);
  }
  // A counter or a prompted option is not a credential and stays readable.
  const kept =
    "max_output_tokens=3 token_count=2 --max-tokens 5 mysql -P3306 -p db --password --stdin git push -u origin main go run -url=https://host/x curl -u alice: https://h";
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
    "Tn4ntPw",
    "Zq9",
    "Secret",
  ];
  const command =
    'users\' reports: git commit -m "don\'t" && docker login --password s3cr3tValue && mysql -p"correct horse" db && x --password zzpre" correct horse"zzpost && curl -u tenant/user:Tn4ntPw https://h && pwd=PIN12 node ~/.claude/skills/mo-setup/scripts/mo-setup.mjs check';
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
  // An unclosed quote after a phantom one hides everything after it, so each
  // such command gets a record of its own rather than blinding the checks above.
  const SETUP = "node ~/.claude/skills/mo-setup/scripts/mo-setup.mjs check";
  const phantoms = [
    ["toolu_g", `echo the '90s && ${SETUP} --password zzpre' Zq9 Secret`],
    ["toolu_h", `echo do not eval '90s && ${SETUP} --password zzpre' Zq9 Secret`],
    ["toolu_i", `bash -lc '${SETUP} --token zzabc' && y api_key: 'Zq9 Secret' tail`],
    ["toolu_j", `echo note: "90s && ${SETUP} --password zzpre" Zq9 Secret`],
    ["toolu_k", `[1+, "90s && ${SETUP} --password zzpre" Zq9 Secret`],
    ["toolu_l", `curl -H 'X-Api-Key: Zq9 Secret' https://h && ${SETUP}`],
    ["toolu_m", `[1,\u00a0"90s && ${SETUP} --password zzpre" Zq9 Secret`],
    ...DOMAIN_USERS.map((line, index) => [`toolu_n${index}`, `${line} && ${SETUP}`]),
  ].map(([id, command]) => ({
    ...claudeRecord,
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name: "Bash", input: { command } }],
    },
  }));
  writeFileSync(
    join(claude, `${UUID}.jsonl`),
    [claudeRecord, ...phantoms].map((record) => `${JSON.stringify(record)}\n`).join(""),
  );
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
          // The event keeps 160 characters after the mention, so every shape sits inside it.
          text: "$mo-debug users' reports: x --password zzpre' Zq9 Secret'zzpost with --token 0a1b2c3d4e5f and curl -u \"alice:correct horse\" or -u me@example.com:ATATT3xFfGF0",
        },
      ],
    },
  };
  const domainCalls = DOMAIN_USERS.map((line, index) => ({
    timestamp: "2026-09-01T11:06:00.000Z",
    type: "response_item",
    payload: {
      type: "function_call",
      name: "exec_command",
      arguments: JSON.stringify({ cmd: `${line} && ${SETUP.replace("~/.claude", "~/.codex")}` }),
      call_id: `call_n${index}`,
    },
  }));
  writeFileSync(
    rollout,
    `${readFileSync(rollout, "utf8")}${[codexRecord, ...domainCalls].map((record) => `${JSON.stringify(record)}\n`).join("")}`,
  );
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

test("no credential byte survives after these enclosing texts, in any shape or following text", () => {
  // Whether a quote ends the credential word or opens part of it depends on
  // everything before the word, so every shape is tried after every kind of
  // enclosing text and before every kind of following text.
  const prefixes = [
    "",
    'git commit -m "don\'t" && ',
    "echo don\\'t; ",
    "it didn't work: ",
    'bash -c "',
    '{"cmd":"',
    '{"cmd":"bash -c \\"',
    `echo "a'b" 'c"d' && `,
    "(",
    "x | ",
    "$mo-debug with ",
    // Prose and glued quotes that leave a phantom quote open, or used to.
    "users' reports: ",
    "2026's note: ",
    "the '90s login: ",
    "git commit -m'fix it' && ",
    "it's 'quoted' then ",
    // A closed command string that ends in a credential of its own.
    "bash -c 'x --token Zq9A' && ",
    "ssh h 'deploy --token Zq9A' && ",
    "bash -lc 'x --token Zq9A' && ",
    'sh -euc "x --token Zq9A" && ',
    // An open quote that only looks like a command string, a JSON string or a
    // phantom double quote, and a phantom that ends in a credential.
    "please do not eval '90s login: ",
    "the option -c '90s login: ",
    'a 12" screen: ',
    '{"cmd":["bash","-lc","',
    "the '90s x --token Zq9A' && ",
    'echo "x --token Zq9A" && ',
    'note: "90s login: ',
    'one, "90s login: ',
    "curl -d 'a=1 ",
    '[1+, "90s login: ',
    '{"a":1,"b":[true,],"c":"',
  ];
  const shapes = [
    "--password Zq9Secret",
    '--password pre"Zq9 Secret"post',
    "--password pre' Zq9 Secret'post",
    '--password pre""Zq9post',
    'mysql -p"Zq9 Secret"x db',
    "mysql -pZq9\\ Secret db",
    'curl -u alice:"Zq9 Secret"',
    "curl -u alice:' Zq9 Secret'",
    'curl -u "alice:Zq9 Secret"-Zq9tail',
    'PASSWORD=pre"Zq9 Secret"post',
    'x --token "a\\"Zq9 Secret"',
    "curl -u me@x.com:Zq9Secret",
    "curl --user uid=a/b:Zq9Secret",
    "curl -ubob:Zq9Secret",
    "-Token Zq9Secret",
    'curl -u "bob:ghp_AAAAAAAAAAAAAAAAAAAA"-Zq9x',
    "token=Zq9",
    "api_key: 'Zq9 Secret'",
    '"password": "Zq9 Secret"',
    // Unclosed, so the password runs to the end of the text.
    "--password pre' Zq9 Secret",
    "PASSWORD=pre' Zq9 Secret",
    "curl -u alice:' Zq9 Secret",
    // Quoted whole, after a closed command string that ended a credential.
    "y --password 'Zq9 Secret'",
    "curl -u 'bob:Zq9 Secret' https://h",
  ];
  const suffixes = [" tail", '" && ls', '","cwd":"x"}', '\\"","cwd":"x"}', "' && ls", "", ")"];
  for (const prefix of prefixes) {
    for (const shape of shapes) {
      for (const suffix of suffixes) {
        const input = `${prefix}${shape}${suffix}`;
        const redacted = redact(input);
        assert.doesNotMatch(redacted, /Zq9|Secret/u, input);
        assert.equal(redact(redacted), redacted, input);
      }
    }
  }
});

test("a credential far from a Codex mention is redacted before the window is cut", () => {
  // The window around a mention was once cut from the raw message, so it could
  // start inside a quoted password or after the key that marks it.
  const messages = [
    `GH_TOKEN=ghp_${"Q".repeat(36)} ${"w".repeat(50)} $mo-debug why`,
    `password="Zq9 correct horse Secret" ${"w".repeat(60)} $mo-debug why`,
    `$mo-debug clone failed: ${"w".repeat(115)} https://alice:Zq9Secret@git.example.com/r.git`,
  ];
  for (const text of messages) {
    const { home, codex } = fixtureHome();
    const rollout = join(codex, `rollout-2026-09-01T11-00-00-${CODEX_ID}.jsonl`);
    const record = {
      timestamp: "2026-09-01T11:05:00.000Z",
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    };
    writeFileSync(rollout, `${readFileSync(rollout, "utf8")}${JSON.stringify(record)}\n`);
    const { result, report } = reportOf(home, ["scan", "--session", CODEX_ID]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(report, /skill\\_invocation \| mo-debug \|/u, text);
    const output = `${result.stdout}\n${report}`;
    assert.doesNotMatch(output, /QQQQQQQQ|horse|Secret|Zq9/u, text);
  }
});

test("a long line with many client names is read in linear time", () => {
  // The MySQL trigger looks ahead for `-p` from every client name, so that
  // look-ahead is bounded. A test timeout cannot interrupt synchronous code,
  // so the time is asserted.
  const input = `${"mysql -u root ".repeat(20000)}-pZq9`;
  const started = performance.now();
  assert.doesNotMatch(redact(input), /Zq9/u);
  assert.ok(performance.now() - started < 1000, "backtracking");
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
