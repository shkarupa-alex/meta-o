/**
 * Protect substantive project setup and dependency/posture checks.
 *
 * Protects §A-BACKEND-01, §A-POSTURE-01 and §A-MEMORY-01.
 */

import assert from "node:assert/strict";
import yaml from "js-yaml";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const setup = readFileSync(join(ROOT, "src", "skills", "mo-setup", "SKILL.md"), "utf8");
const contract = readFileSync(join(ROOT, "shared", "references", "project-setup.md"), "utf8");
const contractProse = contract.replace(/\s+/gu, " ");
const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
const claude = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");

test("setup inspects project substance and isolates tracked repair", () => {
  for (const phrase of [
    "business framing",
    "glossary",
    "architecture decisions",
    "backlog",
    "acceptance-to-proof",
    "README",
    "byte-identical `AGENTS.md` and `CLAUDE.md`",
    "complexity and function/\\s*module size",
    "purpose explanations",
    "deterministic non-mutating aggregate QC",
  ]) {
    const expression = phrase.includes("\\s*")
      ? phrase
      : phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(contract, new RegExp(expression, "i"));
  }
  assert.match(setup, /`feature\/meta-o-setup`/);
  assert.match(setup, /never mix setup\s+repair into the current feature branch/);
  assert.doesNotMatch(setup, /phase-0-fixtures|fixture map|executor task delivery/i);
});

test("setup checks controls, companions and every harness posture separately", () => {
  for (const pair of [
    ["`orca`/`orca-cli` separately from the upstream\\s+`orchestration`", /orchestration/],
  ])
    assert.match(setup, new RegExp(pair[0]));
  assert.match(contract, /codex claude opencode/);
  assert.match(contract, /Missing, divergent or unreadable posture is not support/);
  assert.match(contract, /Detect Orca/);
  assert.match(contract, /unsupported\s+or ambiguous environments/);
  assert.match(contractProse, /Orca exposes its version-matched `orchestration` guide/);
  assert.match(contract, /Backend-wide health does not prove harness readiness/);
  assert.match(setup, /check mature `jq` and `flock` dependencies/);
  assert.match(contract, /require `jq` and `flock` separately\s+from the Orca control/);
});

test("private Orca and specification workspaces are ignored and absent from the index", () => {
  const indexed = spawnSync("git", ["ls-files", "--", ".orca/", "spec/"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(indexed.status, 0, indexed.stderr);
  assert.equal(indexed.stdout, "");
  for (const path of [".orca/probe", "spec/probe"]) {
    const ignored = spawnSync("git", ["check-ignore", "-v", "--no-index", path], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(ignored.status, 0, ignored.stderr);
    assert.match(ignored.stdout, /^\.gitignore:\d+:/u);
  }
});

test("knowledge policy covers verbatim intent, language, semantic links and backlog fields", () => {
  assert.match(contract, /preserves the meaning of the original request/);
  assert.match(contract, /every\s+later user intent/);
  assert.match(contract, /complete verbatim ledger stays with the task or spec/);
  assert.match(contract, /Human-facing project knowledge uses the user's language/);
  assert.match(contract, /upstream names remain in English/);
  assert.match(contract, /label containing the target document's H1 title/);
  assert.match(contract, /mature Markdown AST\/link\s+tool, never a regex Markdown parser/);
  for (const field of ["reason", "practical impact", "next step"])
    assert.match(contractProse, new RegExp(field));
});

test("entry files treat material dictation anomalies as questions, not silent corrections", () => {
  assert.equal(agents, claude);
  assert.match(
    contract,
    /dictation rule:[\s\S]*materially change scope or[\s\S]*clarified with the user/,
  );
  assert.match(
    agents,
    /неточной диктовки[\s\S]*существенно изменить область или результат[\s\S]*спросите\s+пользователя/,
  );
  assert.match(agents, /Сохраняйте подтверждённое намерение дословно/);
});

test("entry files define the contradiction-resolution hierarchy", () => {
  for (const source of [agents, claude]) {
    assert.match(source, /Разрешайте противоречия в таком порядке/);
    assert.match(source, /бизнес-требования[\s\S]*архитектурные решения[\s\S]*реализация/);
    assert.match(source, /\[Зачем существует Meta-O\]\(docs\/business\.md\)/);
    assert.match(source, /Нижний слой не может переопределять верхний/);
  }
});

test("entry files preserve the mandatory branch and commit contract", () => {
  for (const source of [agents, claude]) {
    assert.match(
      source,
      /Никогда не разрабатывайте напрямую в `main`, `master`, `develop` или `default`/,
    );
    assert.match(source, /от актуальной `develop` ветку\s+`feature\/<short-slug>`/);
    assert.match(source, /Коммитьте каждое связное,\s+независимо проверяемое приращение/);
    assert.match(source, /`<type>: <what changed and why>`/);
    for (const type of ["feat", "fix", "refactor", "test", "docs", "chore"])
      assert.match(source, new RegExp("`" + type + "`"));
    assert.match(source, /Не добавляйте `Assisted-by`, `Co-authored-by`/);
  }
});

test("entry files name every backlog closure gate and the remote head check", () => {
  assert.match(contract, /G0\/GC\/G1\/G2 rules in the entry contract/);
  for (const source of [agents, claude]) {
    const prose = source.replace(/\s+/gu, " ");
    for (const gate of ["G0", "GC", "G1", "G2"]) assert.match(prose, new RegExp(`\\b${gate}\\b`));
    assert.match(prose, /G1[^.]*созданием MR\/PR/);
    assert.match(prose, /G2[^.]*слиянием/);
    assert.match(prose, /На G1 и G2 удалённый исходный HEAD обязан совпасть/);
  }
});

test("the shipped CI examples keep full history and a separate closure job", () => {
  const assets = join(ROOT, "src", "skills", "mo-setup", "assets", "ci");
  const github = yaml.load(readFileSync(join(assets, "github-actions.yml"), "utf8"));
  const gitlab = yaml.load(readFileSync(join(assets, "gitlab-ci.yml"), "utf8"));

  // `on` is the YAML 1.1 boolean `true` once parsed, which is exactly the kind
  // of detail a hand-written example gets wrong and a parser catches.
  const triggers = Object.keys(github.on ?? github[true] ?? {});
  assert.deepEqual(triggers.sort(), ["merge_group", "pull_request"]);

  // A shallow clone turns the history stage into a silent skip rather than a
  // check, so the depth is the point of shipping an example at all.
  const checkouts = Object.values(github.jobs).flatMap((job) =>
    job.steps.filter((step) => String(step.uses ?? "").startsWith("actions/checkout")),
  );
  assert.ok(checkouts.length > 0);
  for (const step of checkouts) assert.equal(step.with["fetch-depth"], 0);
  assert.equal(gitlab.variables.GIT_DEPTH, "0");

  // Closure is a separate job in both: the notebook must be empty at closure and
  // is deliberately not empty mid-feature, so one red result cannot mean both.
  const backlogJobs = Object.entries(github.jobs).filter(([, job]) =>
    job.steps.some((step) => String(step.run ?? "").includes("mo-backlog")),
  );
  assert.equal(backlogJobs.length, 1);
  assert.notEqual(backlogJobs[0][0], "qc");
  const gitlabJobs = Object.entries(gitlab).filter(
    ([, job]) =>
      Array.isArray(job?.script) && job.script.some((line) => line.includes("mo-backlog")),
  );
  assert.equal(gitlabJobs.length, 1);
  assert.notEqual(gitlabJobs[0][0], "qc");

  for (const job of [gitlab.qc, gitlabJobs[0][1]]) {
    const conditions = job.rules.map((rule) => rule.if).join(" ");
    assert.match(conditions, /merge_request_event/u);
    assert.match(conditions, /merge_train/u);
  }

  // The command stays a placeholder: these are proposals to the owner, not a
  // licence to write someone else's pipeline for them.
  assert.match(String(github.jobs.qc.steps.at(-1).run), /<qc-command>/u);
  assert.ok(gitlab.qc.script.some((line) => line.includes("<qc-command>")));

  // A shipped example that names a path no repair creates is a proposal to
  // break the target's pipeline: the job fails on every merge request with a
  // module-not-found error, and mo-setup would report it as coverage.
  const commands = [
    ...Object.values(github.jobs).flatMap((job) => job.steps.map((step) => String(step.run ?? ""))),
    ...Object.values(gitlab)
      .filter((job) => Array.isArray(job?.script))
      .flatMap((job) => job.script.map(String)),
  ];
  const named = [...new Set(commands.flatMap((line) => line.match(/\btools\/\S+/gu) ?? []))];
  assert.ok(named.length > 0, "the examples run no repository path at all");
  for (const path of named) {
    assert.ok(setup.includes(path), `${path} is named by CI but created by no accepted repair`);
  }

  // Half a schema is a call error, so an example that shows the call without it
  // teaches the one invocation that cannot work.
  for (const line of commands.filter((command) => command.includes("mo-backlog"))) {
    assert.match(line, /<backlog-schema>/u);
  }
  for (const flag of ["--path", "--title", "--open-heading", "--entry-field"]) {
    assert.ok(setup.includes(flag), `the accepted repair never names ${flag}`);
  }
  assert.match(contractProse, /path, title, open heading and\s*every entry field/u);
});

test("the shipped backlog checker answers for a foreign notebook as installed", () => {
  // The path CI names has to be runnable exactly as shipped: bundled, and
  // holding no default of this project. `mo-smoke` owns the harder half —
  // running every shipped bundle from a directory with no `node_modules` on any
  // ancestor — because ESM resolves from the module's own location, not `cwd`.
  const scratch = mkdtempSync(join(tmpdir(), "mo-foreign-notebook-"));
  try {
    const repository = join(scratch, "project");
    mkdirSync(join(repository, "notes"), { recursive: true });
    const git = (...args) => {
      const run = spawnSync("git", ["-C", repository, ...args], { encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr);
    };
    git("init", "-q");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    writeFileSync(
      join(repository, "notes", "backlog.md"),
      "# Backlog\n\nTemporary notebook of the active feature branch only.\n\n## Open\n",
    );
    git("add", ".");
    git("commit", "-qm", "foreign notebook");
    const checker = join(ROOT, "skills", "mo-setup", "scripts", "mo-backlog.mjs");
    const run = spawnSync(
      process.execPath,
      [
        checker,
        "--repo",
        repository,
        "--path",
        "notes/backlog.md",
        "--title",
        "Backlog",
        "--open-heading",
        "Open",
        "--intro",
        "Temporary notebook of the active feature branch only.",
        "--entry-field",
        "Reason.",
      ],
      { cwd: scratch, encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.match(
      run.stdout,
      /^MO-BACKLOG-EMPTY version=1 sha=[a-f0-9]{40} worktree=clean path="notes\/backlog\.md" entries=0 content_nodes=0\n$/u,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("mo-setup ships a papercut template and the history contract it must apply", () => {
  const references = join(ROOT, "src", "skills", "mo-setup", "references");
  const template = readFileSync(join(references, "papercut-template.md"), "utf8");
  const history = readFileSync(join(references, "knowledge-id-history.md"), "utf8");
  // The rule and the deletion half of it are what keep the document short
  // enough to stay read; a template without them grows into a changelog.
  for (const phrase of ["Only the repeating case", "A stale line is deleted"]) {
    assert.ok(template.includes(phrase), phrase);
  }
  for (const phrase of [
    "Knowledge id history",
    "history_cutoff_sha",
    "MO-KNOWLEDGE-HISTORY-SOURCE",
    "stale=unknown",
  ]) {
    assert.ok(history.includes(phrase), phrase);
  }
  // The hash domain is the half that makes staleness decidable rather than
  // guessed, so the template may not leave it to the reader.
  assert.match(history, /without that line/u);
});

test("the setup contract separates current-tree checking from history checking", () => {
  // Without the declaration form, "does this project gate its history?" is a
  // guess, and a guess here is indistinguishable from a real answer.
  for (const phrase of [
    "Knowledge id history",
    "history_cutoff_sha",
    "exactly one fenced block",
    "substring of the declared quality command",
    "disposable clone",
  ]) {
    assert.ok(contractProse.includes(phrase.replace(/\s+/gu, " ")), phrase);
  }
  assert.match(contractProse, /history=unknown/u);
  // Two shipped documents that disagree about a complete declaration make the
  // agent pick one, and both picks are wrong: one falsely accuses a compliant
  // project, the other guesses the layout the rule exists to stop it guessing.
  assert.match(
    contractProse,
    /locations identifiers live in: the business document and the architecture/u,
  );
  assert.match(
    contractProse,
    /locations are unnamed, ambiguous or contradictory, the result is `history=unknown`/u,
  );
  // A regex Markdown parser is what the project contract forbids everywhere
  // else; the one document that tells other projects how to parse must say so.
  assert.match(contractProse, /never with a regular expression/u);
  // Boundaries are per-project: copying the supplier's cutoff would silently
  // exempt exactly the history the target project needs checked.
  assert.match(contractProse, /never copied from the supplier/u);
});

test("the setup contract requires a linked commands-and-papercuts document", () => {
  for (const phrase of ["docs/papercut.md", "linked from", "stale line is removed"]) {
    assert.ok(contractProse.includes(phrase), phrase);
  }
  // The narrow rule is the whole value: a document that collects one-off
  // incidents stops being read, and methodology friction has its own channel.
  assert.match(contractProse, /one-off incidents and methodology friction/u);
});
