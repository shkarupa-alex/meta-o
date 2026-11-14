/**
 * Static GitLab rules inside `CI-Coverage/1`.
 *
 * The shipped example must be provable without hosting data, every outcome
 * still needs the required policy, and anything outside the evaluated subset
 * stays `unknown` rather than a guess.
 *
 * Protects §A-BACKLOG-01.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { coverageLine, gitlabCoverage } from "../shared/scripts/mo-ci-coverage.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED = readFileSync(
  join(ROOT, "src", "skills", "mo-setup", "assets", "ci", "gitlab-ci.yml"),
  "utf8",
);
const temporary = [];
after(() => {
  for (const path of temporary) rmSync(path, { recursive: true, force: true });
});

function coverage(files, options = {}) {
  const read = (path) => files[path] ?? null;
  return gitlabCoverage(read, { entry: ".gitlab-ci.yml", job: "qc", ...options });
}

function states(record) {
  return Object.fromEntries(record.states.map((entry) => [entry.name, entry.state]));
}

const qc = (rules, extra = "") =>
  `qc:\n  script: [make qc]\n${extra}  rules:\n${rules.map((rule) => `    - ${rule}\n`).join("")}`;

test("(a) the shipped example reaches QC in every context without hosting data", () => {
  const record = coverage({ ".gitlab-ci.yml": SHIPPED }, { backlogJob: "backlog-closure" });
  assert.equal(record.rules, "reachable");
  assert.deepEqual(states(record), {
    mr_detached: "reachable",
    mr_merged_result: "reachable",
    merge_train: "reachable",
  });
  assert.equal(record.history, "full");
  assert.equal(record.backlogJob, "yes");
  // Without the hosting policy nothing is covered yet.
  assert.equal(record.outcome, "unknown");
});

test("(b) an unreadable policy keeps the shipped example unknown", () => {
  const record = coverage(
    { ".gitlab-ci.yml": SHIPPED },
    { requiredPolicy: "unreadable", mergeTrains: "enabled" },
  );
  assert.equal(record.rules, "reachable");
  assert.equal(record.outcome, "unknown");
  assert.deepEqual(record.unresolved, ["required_policy_unreadable"]);
});

test("(c) a disabled requirement is config_present with required_policy_absent", () => {
  const record = coverage(
    { ".gitlab-ci.yml": SHIPPED },
    { requiredPolicy: "disabled", mergeTrains: "enabled" },
  );
  assert.equal(record.outcome, "config_present");
  assert.deepEqual(record.unresolved, ["required_policy_absent"]);
});

test("(d) a proven requirement with reachable rules is covered", () => {
  const record = coverage(
    { ".gitlab-ci.yml": SHIPPED },
    { requiredPolicy: "enabled", mergeTrains: "enabled" },
  );
  assert.equal(record.outcome, "covered");
  assert.deepEqual(record.unresolved, []);
  assert.match(
    coverageLine("group/project", record),
    /^CI-Coverage\/1 provider=gitlab repository="group\/project" entrypoint="\.gitlab-ci\.yml" graph=\["\.gitlab-ci\.yml"\] job="qc" events=mr_detached:reachable,mr_merged_result:reachable,merge_train:reachable rules=reachable required_policy=enabled merge_trains=enabled outcome=covered unresolved=none history=full backlog_job=no$/u,
  );
});

test("the default branch is read from hosting metadata and only where a rule needs it", () => {
  const files = {
    ".gitlab-ci.yml": qc([
      "if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH\n      when: never",
      'if: $CI_PIPELINE_SOURCE == "merge_request_event"',
    ]),
  };
  const policy = { requiredPolicy: "enabled", mergeTrains: "enabled" };
  const without = coverage(files, policy);
  assert.equal(without.rules, "unsupported");
  assert.equal(without.outcome, "unknown");
  assert.deepEqual(without.unresolved, ["default_branch_unknown"]);
  // In a merge request the branch is unset, an empty string, so it never
  // equals the default branch and the second rule decides.
  const withBranch = coverage(files, { ...policy, defaultBranch: "main" });
  assert.equal(withBranch.rules, "reachable");
  assert.equal(withBranch.outcome, "covered");
  // A decisive rule before it means the metadata is never read.
  const decidedFirst = coverage(
    {
      ".gitlab-ci.yml": qc([
        'if: $CI_PIPELINE_SOURCE == "merge_request_event"',
        "if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH",
      ]),
    },
    policy,
  );
  assert.equal(decidedFirst.outcome, "covered");
  // Short-circuit: a false side decides `&&` without the missing value.
  const shortCircuit = coverage(
    {
      ".gitlab-ci.yml": qc([
        'if: $CI_COMMIT_TAG != "" && $CI_DEFAULT_BRANCH == "main"\n      when: never',
        "when: on_success",
      ]),
    },
    policy,
  );
  assert.equal(shortCircuit.outcome, "covered");
});

test("the context table: tags, branches and event types take their GitLab values", () => {
  const record = coverage(
    {
      ".gitlab-ci.yml": qc([
        "if: $CI_COMMIT_TAG || $CI_COMMIT_BRANCH\n      when: never",
        'if: $CI_MERGE_REQUEST_EVENT_TYPE == "detached" || $CI_MERGE_REQUEST_EVENT_TYPE == "merged_result"',
      ]),
    },
    { requiredPolicy: "enabled", mergeTrains: "enabled" },
  );
  assert.deepEqual(states(record), {
    mr_detached: "reachable",
    mr_merged_result: "reachable",
    merge_train: "unreachable",
  });
  assert.equal(record.outcome, "config_present");
  assert.deepEqual(record.unresolved, ["qc_not_reachable"]);
  // Where trains are off, the train no longer decides.
  const noTrains = coverage(
    { ".gitlab-ci.yml": qc(['if: $CI_MERGE_REQUEST_EVENT_TYPE != "merge_train"']) },
    { requiredPolicy: "enabled", mergeTrains: "disabled" },
  );
  assert.equal(noTrains.outcome, "covered");
  const unreadTrains = coverage(
    { ".gitlab-ci.yml": qc(['if: $CI_MERGE_REQUEST_EVENT_TYPE != "merge_train"']) },
    { requiredPolicy: "enabled", mergeTrains: "unreadable" },
  );
  assert.equal(unreadTrains.outcome, "unknown");
  assert.deepEqual(unreadTrains.unresolved, ["merge_trains_unreadable"]);
});

test("a regular expression match is unsupported and therefore unknown", () => {
  const record = coverage(
    { ".gitlab-ci.yml": qc(["if: $CI_MERGE_REQUEST_EVENT_TYPE =~ /^(detached|merge_train)$/"]) },
    { requiredPolicy: "enabled", mergeTrains: "enabled" },
  );
  assert.equal(record.rules, "unsupported");
  assert.equal(record.outcome, "unknown");
  assert.deepEqual(record.unresolved, ["regex_match"]);
});

test("allow_failure, optional manual and when: never do not prove a required QC", () => {
  const policy = { requiredPolicy: "enabled", mergeTrains: "disabled" };
  for (const [rule, extra] of [
    ["when: on_success", "  allow_failure: true\n"],
    ["when: on_success\n      allow_failure: true", ""],
    ["when: manual\n      allow_failure: true", ""],
    ["when: never", ""],
    ["when: on_success\n      allow_failure:\n        exit_codes: [1]", ""],
  ]) {
    const record = coverage({ ".gitlab-ci.yml": qc([rule], extra) }, policy);
    assert.equal(record.outcome, "config_present", rule);
    assert.deepEqual(record.unresolved, ["qc_not_reachable"], rule);
  }
  // A blocking manual job holds the pipeline until QC passes.
  const blocking = coverage({ ".gitlab-ci.yml": qc(["when: manual"]) }, policy);
  assert.equal(blocking.outcome, "covered");
});

test("a job without rules never joins a merge request pipeline", () => {
  const record = coverage(
    { ".gitlab-ci.yml": "qc:\n  script: [make qc]\n" },
    { requiredPolicy: "enabled", mergeTrains: "disabled" },
  );
  assert.equal(record.rules, "unreachable");
  assert.equal(record.outcome, "config_present");
});

test("workflow rules decide whether the pipeline exists at all", () => {
  const job = qc(["when: on_success"]);
  const policy = { requiredPolicy: "enabled", mergeTrains: "disabled" };
  const blocked = coverage(
    { ".gitlab-ci.yml": `workflow:\n  rules:\n    - if: $CI_COMMIT_TAG\n${job}` },
    policy,
  );
  assert.equal(blocked.outcome, "config_present");
  const allowed = coverage(
    {
      ".gitlab-ci.yml": `workflow:\n  rules:\n    - if: $CI_PIPELINE_SOURCE == "merge_request_event"\n${job}`,
    },
    policy,
  );
  assert.equal(allowed.outcome, "covered");
});

test("literal local include and extends resolve; remote, !reference and others are unsupported", () => {
  const policy = { requiredPolicy: "enabled", mergeTrains: "disabled" };
  const resolved = coverage(
    {
      ".gitlab-ci.yml":
        "include:\n  - local: /ci/base.yml\nqc:\n  extends: .mr\n  script: [make qc]\n",
      "ci/base.yml": '.mr:\n  rules:\n    - if: $CI_PIPELINE_SOURCE == "merge_request_event"\n',
    },
    policy,
  );
  assert.equal(resolved.outcome, "covered");
  assert.deepEqual(resolved.graph, [".gitlab-ci.yml", "ci/base.yml"]);
  for (const [files, reason] of [
    [
      { ".gitlab-ci.yml": `include: https://example.com/ci.yml\n${qc(["when: always"])}` },
      "remote_include",
    ],
    [
      {
        ".gitlab-ci.yml": `include:\n  - template: Jobs/Build.gitlab-ci.yml\n${qc(["when: always"])}`,
      },
      "remote_include",
    ],
    [{ ".gitlab-ci.yml": `include: missing.yml\n${qc(["when: always"])}` }, "include_missing"],
    [
      {
        ".gitlab-ci.yml": `.r:\n  rules: [{when: always}]\nqc:\n  script: [x]\n  rules:\n    - !reference [.r, rules]\n`,
      },
      "reference_tag",
    ],
    [{ ".gitlab-ci.yml": qc(['if: $MY_FLAG == "1"']) }, "variable"],
    [{ ".gitlab-ci.yml": qc(['if: $CI_COMMIT_BRANCH == "$CI_DEFAULT_BRANCH"']) }, "substitution"],
    [{ ".gitlab-ci.yml": qc(["changes: [src/**/*]"]) }, "rule_condition"],
    [
      { ".gitlab-ci.yml": `variables:\n  CI_DEFAULT_BRANCH: main\n${qc(["when: always"])}` },
      "predefined_override",
    ],
    [{ ".gitlab-ci.yml": "qc:\n  script: [x]\n  only: [merge_requests]\n" }, "only_except"],
    [{ ".gitlab-ci.yml": "qc: [unbalanced\n" }, "yaml_unreadable"],
  ]) {
    const record = coverage(files, policy);
    assert.equal(record.rules, "unsupported", reason);
    assert.equal(record.outcome, "unknown", reason);
    assert.deepEqual(record.unresolved, [reason]);
  }
});

test("a project without the entry file has no CI surface", () => {
  const record = coverage({}, { requiredPolicy: "enabled", mergeTrains: "enabled" });
  assert.equal(record.outcome, "no_ci_surface");
});

test("the helper reads only the candidate's tracked files", () => {
  const repo = mkdtempSync(join(tmpdir(), "mo-ci-coverage-"));
  temporary.push(repo);
  const git = (...args) => {
    const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-q");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  writeFileSync(join(repo, ".gitlab-ci.yml"), SHIPPED);
  git("add", ".gitlab-ci.yml");
  git("commit", "-q", "-m", "ci");
  const candidate = git("rev-parse", "HEAD");
  // An uncommitted edit is not the candidate.
  writeFileSync(join(repo, ".gitlab-ci.yml"), "qc:\n  script: [x]\n");
  const helper = join(ROOT, "shared", "scripts", "mo-ci-coverage.mjs");
  const run = (...flags) =>
    spawnSync(process.execPath, [helper, "--repo", repo, "--candidate", candidate, ...flags], {
      encoding: "utf8",
    });
  const covered = run(
    "--repository",
    "group/project",
    "--job",
    "qc",
    "--required-policy",
    "enabled",
    "--merge-trains",
    "enabled",
  );
  assert.equal(covered.status, 0, covered.stderr);
  assert.match(covered.stdout, / rules=reachable .* outcome=covered /u);
  const unknown = run("--repository", "group/project", "--job", "qc");
  assert.equal(unknown.status, 1);
  assert.match(unknown.stdout, / outcome=unknown unresolved=required_policy_unreadable /u);
  const misspelled = run(
    "--repository",
    "group/project",
    "--job",
    "qc",
    "--merge-train",
    "enabled",
  );
  assert.equal(misspelled.status, 2);
});

test("a CI entry that is a symbolic link is unknown, never no_ci_surface", () => {
  const repo = mkdtempSync(join(tmpdir(), "mo-ci-coverage-link-"));
  temporary.push(repo);
  const run = (...args) => {
    const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  run("init", "-q");
  run("config", "user.email", "fixture@example.invalid");
  run("config", "user.name", "Fixture");
  writeFileSync(join(repo, "ci.yml"), SHIPPED);
  symlinkSync("ci.yml", join(repo, ".gitlab-ci.yml"));
  run("add", "ci.yml", ".gitlab-ci.yml");
  run("commit", "-q", "-m", "linked ci");
  const helper = join(ROOT, "shared", "scripts", "mo-ci-coverage.mjs");
  const flags = ["--repository", "group/project", "--job", "qc", "--required-policy", "enabled"];
  const result = spawnSync(
    process.execPath,
    [helper, "--repo", repo, "--candidate", run("rev-parse", "HEAD"), ...flags],
    { encoding: "utf8" },
  );
  // Whether GitLab follows the link is a hosting fact this helper cannot read.
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stdout,
    / rules=unsupported .* outcome=unknown unresolved=ci_file_not_regular /u,
  );
});
