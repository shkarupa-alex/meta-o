#!/usr/bin/env node
/**
 * Answer `CI-Coverage/1` for one GitLab project at one exact candidate.
 *
 * §A-BACKLOG-01 lets an agent merge only when CI provably runs QC on the
 * candidate and hosting policy makes that result required. Hosting settings
 * are read by the agent through its authenticated CLI and passed in; this
 * helper reads only the candidate's tracked CI files, so the static half of the
 * answer is the same for every caller. The static parse adds one intermediate
 * field, `rules`, and never a new outcome: `covered` still needs the required
 * policy, and a construct outside the evaluated subset is `unknown`, not a
 * guess. A static `covered` is no substitute for QC actually passing on the
 * candidate before G2.
 */

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

import {
  CONTEXTS,
  Unsupported,
  gitlabHistory,
  jobReachability,
  loadGitlabConfig,
} from "./gitlab-ci-rules.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const POLICY = ["enabled", "disabled", "unreadable"];

const USAGE = `usage: mo-ci-coverage.mjs --candidate <40hex> --repository <host/path> --job <qc-job>
         [--entry <path>] [--backlog-job <job>] [--default-branch <name>]
         [--required-policy enabled|disabled|unreadable]
         [--merge-trains enabled|disabled|unreadable] [--repo <git-root>]

  --candidate <40hex>     exact commit whose tracked CI files are read
  --repository <path>     hosting project, copied into the record
  --job <name>            the job that runs the project's authoritative QC
  --entry <path>          CI entry file (default .gitlab-ci.yml, or the
                          project's configured CI path)
  --backlog-job <name>    the separate closure job, if the project has one
  --default-branch <name> CI_DEFAULT_BRANCH from hosting metadata; without it
                          a rule that reads it is unsupported
  --required-policy       whether hosting requires a successful pipeline to
                          merge (default unreadable)
  --merge-trains          whether merge trains are enabled (default unreadable)
  --repo <git-root>       repository (default: Git root of the cwd)

output: CI-Coverage/1 provider=gitlab repository=<json> entrypoint=<json>
        graph=<json> job=<json> events=<context:state,...>
        rules=<reachable|unreachable|unsupported> required_policy=<...>
        merge_trains=<...> outcome=<covered|config_present|no_ci_surface|unknown>
        unresolved=<token,...|none> history=<full|shallow|unknown>
        backlog_job=<yes|no|unknown>
exit: 0 covered | 1 any other outcome | 2 call error
`;

/**
 * §A-BACKLOG-01 maps the static answer and the hosting policy onto the
 * existing outcomes; the order is the contract. Anything unreadable is
 * `unknown` before anything else is judged, because a missing fact cannot be
 * read as its convenient value.
 */
export function coverageOutcome({ rules, reason, trainState, requiredPolicy, mergeTrains }) {
  if (rules === "unsupported") return { outcome: "unknown", unresolved: [reason] };
  const unreadable = [];
  if (requiredPolicy === "unreadable") unreadable.push("required_policy_unreadable");
  // An unread train setting matters only when the train would miss QC.
  if (mergeTrains === "unreadable" && trainState !== "reachable") {
    unreadable.push("merge_trains_unreadable");
  }
  if (unreadable.length > 0) return { outcome: "unknown", unresolved: unreadable };
  if (rules === "unreachable")
    return { outcome: "config_present", unresolved: ["qc_not_reachable"] };
  if (requiredPolicy === "disabled") {
    return { outcome: "config_present", unresolved: ["required_policy_absent"] };
  }
  return { outcome: "covered", unresolved: [] };
}

function applicableContexts(mergeTrains) {
  return CONTEXTS.filter((context) => !context.train || mergeTrains !== "disabled");
}

function backlogAnswer(config, job, contexts, defaultBranch) {
  if (job === null) return "no";
  const { rules } = jobReachability(config, job, { contexts, defaultBranch });
  return { reachable: "yes", unreachable: "no", unsupported: "unknown" }[rules];
}

/**
 * §A-BACKLOG-01 computes the whole GitLab record from a file reader and the
 * hosting facts the caller read. `readFile(path)` returns tracked text or
 * `null`.
 */
export function gitlabCoverage(readFile, options) {
  const { entry, job, backlogJob = null, defaultBranch = null } = options;
  const { requiredPolicy = "unreadable", mergeTrains = "unreadable" } = options;
  const base = { entry, job, requiredPolicy, mergeTrains, graph: [], states: [] };
  let loaded;
  try {
    loaded = loadGitlabConfig(entry, readFile);
  } catch (error) {
    if (!(error instanceof Unsupported)) throw error;
    return { ...base, rules: "unsupported", outcome: "unknown", unresolved: [error.reason] };
  }
  if (loaded === null) {
    return { ...base, rules: "unreachable", outcome: "no_ci_surface", unresolved: [] };
  }
  const { config, graph } = loaded;
  // Every context is evaluated so the record shows the train too; only the
  // applicable ones decide `rules`.
  const all = jobReachability(config, job, { contexts: CONTEXTS, defaultBranch });
  const contexts = applicableContexts(mergeTrains);
  const decided = jobReachability(config, job, { contexts, defaultBranch });
  const trainState = all.states.find((entry) => entry.name === "merge_train").state;
  return {
    ...base,
    graph,
    states: all.states,
    rules: decided.rules,
    ...coverageOutcome({ ...decided, trainState, requiredPolicy, mergeTrains }),
    history: gitlabHistory(config, job),
    backlogJob: backlogAnswer(config, backlogJob, contexts, defaultBranch),
  };
}

/** §A-BACKLOG-01 renders the one line a setup report and a G2 decision copy. */
export function coverageLine(repository, record) {
  const events = record.states.map((entry) => `${entry.name}:${entry.state}`).join(",");
  return [
    "CI-Coverage/1 provider=gitlab",
    `repository=${JSON.stringify(repository)}`,
    `entrypoint=${JSON.stringify(record.entry)}`,
    `graph=${JSON.stringify(record.graph)}`,
    `job=${JSON.stringify(record.job)}`,
    `events=${events || "none"}`,
    `rules=${record.rules}`,
    `required_policy=${record.requiredPolicy}`,
    `merge_trains=${record.mergeTrains}`,
    `outcome=${record.outcome}`,
    `unresolved=${record.unresolved.join(",") || "none"}`,
    `history=${record.history ?? "unknown"}`,
    `backlog_job=${record.backlogJob ?? "no"}`,
  ].join(" ");
}

const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * One tracked regular file at the candidate, or `null` when nothing is tracked
 * at the path.
 *
 * A symbolic link, a tree or a submodule at a CI path is a CI surface this
 * helper does not evaluate: whether GitLab follows the link or fails the
 * pipeline is a hosting fact, so it is `unknown`, never `no_ci_surface`.
 */
function gitReader(root, candidate) {
  return (path) => {
    const normalized = posix.normalize(path);
    if (normalized.startsWith("../") || posix.isAbsolute(normalized)) return null;
    const listed = spawnSync("git", ["-C", root, "ls-tree", "-z", candidate, "--", normalized]);
    if (listed.error || listed.status !== 0) throw new Error("git ls-tree failed");
    const row = listed.stdout.toString("utf8").split("\0")[0];
    if (row === "") return null;
    if (!/^100(?:644|755) blob /u.test(row)) throw new Unsupported("ci_file_not_regular");
    const shown = spawnSync("git", ["-C", root, "cat-file", "blob", `${candidate}:${normalized}`], {
      maxBuffer: 16 * 1024 * 1024,
    });
    if (shown.error || shown.status !== 0) throw new Error("git cat-file failed");
    try {
      return decoder.decode(shown.stdout);
    } catch {
      throw new Unsupported("yaml_unreadable");
    }
  };
}

const FLAGS = new Set([
  "--candidate",
  "--repository",
  "--job",
  "--entry",
  "--backlog-job",
  "--default-branch",
  "--required-policy",
  "--merge-trains",
  "--repo",
]);

function parseFlags(argv) {
  const given = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (!FLAGS.has(flag) || value === undefined || given.has(flag)) return null;
    given.set(flag, value);
  }
  const valid =
    SHA.test(given.get("--candidate") ?? "") &&
    Boolean(given.get("--repository")) &&
    Boolean(given.get("--job")) &&
    POLICY.includes(given.get("--required-policy") ?? "unreadable") &&
    POLICY.includes(given.get("--merge-trains") ?? "unreadable");
  return valid ? given : null;
}

function resolveRoot(repo) {
  const result = spawnSync("git", ["-C", repo ?? process.cwd(), "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.replace(/\n$/u, "");
}

function main(argv) {
  if (argv.includes("--help")) {
    process.stdout.write(USAGE);
    return 0;
  }
  const given = parseFlags(argv);
  const root = given && resolveRoot(given.get("--repo"));
  if (!given || !root) {
    process.stderr.write(given ? "error: not a Git repository\n" : USAGE);
    return 2;
  }
  let record;
  try {
    record = gitlabCoverage(gitReader(root, given.get("--candidate")), {
      entry: given.get("--entry") ?? ".gitlab-ci.yml",
      job: given.get("--job"),
      backlogJob: given.get("--backlog-job") ?? null,
      defaultBranch: given.get("--default-branch") ?? null,
      requiredPolicy: given.get("--required-policy") ?? "unreadable",
      mergeTrains: given.get("--merge-trains") ?? "unreadable",
    });
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    return 2;
  }
  process.stdout.write(`${coverageLine(given.get("--repository"), record)}\n`);
  return record.outcome === "covered" ? 0 : 1;
}

function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) process.exitCode = main(process.argv.slice(2));
