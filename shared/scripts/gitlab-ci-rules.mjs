/**
 * Decide statically whether a GitLab pipeline runs one job, blocking, for a
 * merge request and a merge train.
 *
 * §A-BACKLOG-01 lets an agent merge only with proven CI coverage of the exact
 * candidate, and the setup contract answers that with `CI-Coverage/1`. The
 * shipped GitLab example gates its jobs with `rules:if`, so a contract that
 * called every expression `unknown` could never certify its own example. This
 * module evaluates exactly one bounded subset — literal local `include` and
 * `extends`, first-match `workflow:rules` and `rules`, `==`/`!=` between string
 * literals and five predefined variables joined by `&&`/`||` — and answers
 * `unsupported` for everything else. A rule nobody can evaluate cannot prove
 * that QC ran, so the subset fails closed instead of guessing.
 */

import { posix } from "node:path";

import yaml from "js-yaml";

/**
 * §A-BACKLOG-01 names why a rule could not be evaluated.
 *
 * The reason is a closed snake_case token, never configuration text: the record
 * travels into reports, and a token is what a reader can act on.
 */
export class Unsupported extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

/** A `!reference` tag splices configuration GitLab resolves and this parser does not. */
class Reference {
  constructor(path) {
    this.path = path;
  }
}

const SCHEMA = yaml.DEFAULT_SCHEMA.extend([
  new yaml.Type("!reference", {
    kind: "sequence",
    construct: (data) => new Reference(data),
    instanceOf: Reference,
  }),
]);

const UNKNOWN = Symbol("unknown");
// GitLab evaluates an undefined variable to nil, which equals no string, the
// empty one included, and only another undefined variable. Reading it as ""
// would match `$CI_COMMIT_TAG == ""` in a merge request where GitLab does not,
// and so prove a QC job GitLab never adds.
const UNSET = Symbol("unset");

/**
 * The variables an expression may read. In both checked contexts a merge
 * request pipeline has no branch and no tag, so both are UNSET; only the
 * default branch comes from hosting metadata, and without it the comparison
 * has no value at all.
 */
const PREDEFINED = new Set([
  "CI_PIPELINE_SOURCE",
  "CI_MERGE_REQUEST_EVENT_TYPE",
  "CI_COMMIT_BRANCH",
  "CI_DEFAULT_BRANCH",
  "CI_COMMIT_TAG",
]);

/**
 * §A-BACKLOG-01 lists the pipelines a candidate must reach QC in. A merge
 * request can run a detached or a merged-results pipeline depending on project
 * settings this file cannot see, so both must reach QC; the train counts only
 * where trains apply.
 */
export const CONTEXTS = [
  { name: "mr_detached", eventType: "detached", train: false },
  { name: "mr_merged_result", eventType: "merged_result", train: false },
  { name: "merge_train", eventType: "merge_train", train: true },
];

const MAX_FILES = 150;
const MAX_EXTENDS_DEPTH = 11;
const RULE_KEYS = new Set(["if", "when", "allow_failure", "variables", "needs", "interruptible"]);
const RULE_KEYS_WITH_DELAY = new Set([...RULE_KEYS, "start_in"]);
const AUTOMATIC = new Set(["on_success", "always", "delayed"]);
const NOT_RUN = new Set(["never", "on_failure"]);

function isPlainObject(value) {
  return (
    value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
  );
}

function containsReference(value) {
  if (value instanceof Reference) return true;
  if (Array.isArray(value)) return value.some(containsReference);
  if (isPlainObject(value)) return Object.values(value).some(containsReference);
  return false;
}

/** GitLab merges mappings key by key and lets a later sequence or scalar replace an earlier one. */
function deepMerge(base, over) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(over)) {
    merged[key] =
      isPlainObject(merged[key]) && isPlainObject(value) ? deepMerge(merged[key], value) : value;
  }
  return merged;
}

function parseDocument(text) {
  let document;
  try {
    document = yaml.load(text, { schema: SCHEMA });
  } catch {
    throw new Unsupported("yaml_unreadable");
  }
  if (!isPlainObject(document)) throw new Unsupported("yaml_unreadable");
  return document;
}

function includeTargets(include) {
  if (include === undefined) return [];
  return (Array.isArray(include) ? include : [include]).map((item) => {
    const local =
      typeof item === "string"
        ? item
        : isPlainObject(item) && Object.keys(item).length === 1
          ? item.local
          : undefined;
    // A URL, `remote`, `project`, `template` or `component` fetches bytes this
    // candidate does not contain, and an include with `rules` or `inputs`
    // depends on values the parse does not have.
    if (typeof local !== "string" || /^[a-z][a-z0-9+.-]*:/iu.test(local)) {
      throw new Unsupported("remote_include");
    }
    if (/[*?[\]$]/u.test(local)) throw new Unsupported("include_not_literal");
    const path = posix.normalize(local.replace(/^\/+/u, ""));
    if (path === "." || path === ".." || path.startsWith("../")) {
      throw new Unsupported("include_not_literal");
    }
    return path;
  });
}

function loadFile(path, readFile, stack, graph) {
  if (stack.includes(path)) throw new Unsupported("include_cycle");
  if (graph.length >= MAX_FILES) throw new Unsupported("include_limit");
  const text = readFile(path);
  if (text === null) throw new Unsupported("include_missing");
  graph.push(path);
  const document = parseDocument(text);
  let merged = {};
  for (const target of includeTargets(document.include)) {
    merged = deepMerge(merged, loadFile(target, readFile, [...stack, path], graph));
  }
  const own = { ...document };
  delete own.include;
  // The including file wins over what it includes, as in GitLab.
  return deepMerge(merged, own);
}

/**
 * §A-BACKLOG-01 resolves the configuration the candidate's own bytes define.
 *
 * `readFile(path)` returns a tracked file's text or `null`. The answer is the
 * merged configuration plus the files read, or `null` when the entry file is
 * absent — which is no CI surface, not an unreadable one.
 */
export function loadGitlabConfig(entry, readFile) {
  const text = readFile(entry);
  if (text === null) return null;
  const graph = [];
  const read = (path) => (path === entry ? text : readFile(path));
  return { config: loadFile(entry, read, [], graph), graph };
}

function resolveJob(config, name, chain) {
  const job = config[name];
  if (!isPlainObject(job)) throw new Unsupported("extends_unresolved");
  if (chain.includes(name) || chain.length >= MAX_EXTENDS_DEPTH) {
    throw new Unsupported("extends_unresolved");
  }
  const parents = job.extends === undefined ? [] : [job.extends].flat();
  let base = {};
  for (const parent of parents) {
    if (typeof parent !== "string") throw new Unsupported("extends_unresolved");
    base = deepMerge(base, resolveJob(config, parent, [...chain, name]));
  }
  const own = { ...job };
  delete own.extends;
  return deepMerge(base, own);
}

// Global keywords are configuration, never a job, whatever their shape.
const KEYWORDS = new Set([
  "after_script",
  "before_script",
  "cache",
  "default",
  "image",
  "include",
  "services",
  "spec",
  "stages",
  "variables",
  "workflow",
]);

/** §A-BACKLOG-01 reads one job after its local `extends` chain; `null` when it does not exist. */
export function gitlabJob(config, name) {
  if (name.startsWith(".") || KEYWORDS.has(name) || config[name] === undefined) return null;
  return resolveJob(config, name, []);
}

const TOKEN =
  /\s*(?:\$([A-Za-z_][A-Za-z0-9_]*)|"([^"]*)"|'([^']*)'|(==|!=|&&|\|\||\(|\))|(=~|!~)|(\S))/uy;

function tokenize(source) {
  const tokens = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < source.length && !/^\s*$/u.test(source.slice(TOKEN.lastIndex))) {
    const match = TOKEN.exec(source);
    const [, variable, double, single, operator, regex, other] = match;
    if (regex !== undefined) throw new Unsupported("regex_match");
    if (other !== undefined) {
      throw new Unsupported(other === "$" ? "substitution" : "expression_unsupported");
    }
    if (variable !== undefined) {
      if (!PREDEFINED.has(variable)) throw new Unsupported("variable");
      tokens.push({ variable });
    } else if (operator !== undefined) {
      tokens.push({ operator });
    } else {
      const string = double ?? single;
      if (/[$\\]/u.test(string)) throw new Unsupported("substitution");
      tokens.push({ string });
    }
  }
  return tokens;
}

/** Recursive descent: `&&` binds tighter than `||`, as in GitLab. */
function parseExpression(source) {
  const tokens = tokenize(source);
  let index = 0;
  const peek = (operator) => tokens[index]?.operator === operator;
  const expect = (predicate) => {
    const token = tokens[index++];
    if (!token || !predicate(token)) throw new Unsupported("expression_unsupported");
    return token;
  };
  const operand = () => expect((token) => "variable" in token || "string" in token);
  const primary = () => {
    if (peek("(")) {
      index++;
      const inner = disjunction();
      expect((token) => token.operator === ")");
      return inner;
    }
    const left = operand();
    if (peek("==") || peek("!=")) {
      const { operator } = tokens[index++];
      return { type: "compare", operator, left, right: operand() };
    }
    if (!("variable" in left)) throw new Unsupported("expression_unsupported");
    return { type: "present", operand: left };
  };
  const chain = (type, operator, next) => () => {
    const items = [next()];
    while (peek(operator)) {
      index++;
      items.push(next());
    }
    return items.length === 1 ? items[0] : { type, items };
  };
  const conjunction = chain("and", "&&", primary);
  const disjunction = chain("or", "||", conjunction);
  const tree = disjunction();
  if (index !== tokens.length) throw new Unsupported("expression_unsupported");
  return tree;
}

const value = (operand, values) =>
  "string" in operand ? operand.string : values[operand.variable];

/**
 * Three-valued logic: a comparison with the missing default branch is unknown,
 * and stays unknown only when the other side cannot decide the result alone. So
 * the missing metadata matters exactly where an evaluated rule depends on it.
 */
function evaluate(node, values) {
  if (node.type === "compare") {
    const [left, right] = [value(node.left, values), value(node.right, values)];
    if (left === UNKNOWN || right === UNKNOWN) return UNKNOWN;
    return (left === right) === (node.operator === "==");
  }
  if (node.type === "present") {
    const present = value(node.operand, values);
    return present === UNKNOWN ? UNKNOWN : present !== "" && present !== UNSET;
  }
  const decisive = node.type === "or";
  let unknown = false;
  for (const item of node.items) {
    const result = evaluate(item, values);
    if (result === decisive) return decisive;
    if (result === UNKNOWN) unknown = true;
  }
  return unknown ? UNKNOWN : !decisive;
}

function assertNoOverride(variables) {
  if (variables === undefined) return;
  if (!isPlainObject(variables)) throw new Unsupported("yaml_unreadable");
  if (Object.keys(variables).some((name) => PREDEFINED.has(name))) {
    throw new Unsupported("predefined_override");
  }
}

/**
 * First match, as GitLab evaluates rules. Only rules up to the decisive one are
 * read, so a construct after it cannot change the answer and is not judged.
 */
function firstMatch(rules, values) {
  if (!Array.isArray(rules)) throw new Unsupported("yaml_unreadable");
  for (const rule of rules) {
    if (containsReference(rule)) throw new Unsupported("reference_tag");
    if (!isPlainObject(rule)) throw new Unsupported("yaml_unreadable");
    const keys = rule.when === "delayed" ? RULE_KEYS_WITH_DELAY : RULE_KEYS;
    // `changes` and `exists` depend on the diff and the tree at run time.
    if (Object.keys(rule).some((key) => !keys.has(key))) throw new Unsupported("rule_condition");
    if (rule.if === undefined) return rule;
    if (typeof rule.if !== "string") throw new Unsupported("expression_unsupported");
    const result = evaluate(parseExpression(rule.if), values);
    if (result === UNKNOWN) throw new Unsupported("default_branch_unknown");
    if (result) return rule;
  }
  return null;
}

function pipelineCreated(workflow, values) {
  if (workflow === undefined) return true;
  if (containsReference(workflow)) throw new Unsupported("reference_tag");
  if (!isPlainObject(workflow)) throw new Unsupported("yaml_unreadable");
  if (workflow.rules === undefined) return true;
  const rule = firstMatch(workflow.rules, values);
  if (rule === null) return false;
  assertNoOverride(rule.variables);
  if (rule.when === undefined || rule.when === "always") return true;
  if (rule.when === "never") return false;
  throw new Unsupported("when_unsupported");
}

/**
 * Whether the job runs and its failure fails the pipeline. A job without
 * `rules` gets GitLab's default `only: [branches, tags]` and never joins a
 * merge request pipeline; `when: never`, `on_failure`, an optional manual job
 * and `allow_failure` all leave the candidate's QC unproven.
 */
function jobRuns(job, values) {
  if (job === null) return false;
  if (job.only !== undefined || job.except !== undefined) throw new Unsupported("only_except");
  if (job.trigger !== undefined) throw new Unsupported("trigger");
  if (job.rules === undefined) return false;
  const rule = firstMatch(job.rules, values);
  if (rule === null) return false;
  // A job that needs another inherits that job's chance to stay skipped: QC
  // after an optional manual gate never runs while the gate is not played.
  // Whether a dependency always runs is not evaluated, so any needs is
  // unsupported rather than proof. A matched rule's needs replaces the job's.
  if (hasNeeds(rule.needs ?? job.needs)) throw new Unsupported("needs_dependency");
  return matchedRuleRuns(job, rule);
}

function hasNeeds(needs) {
  if (needs === undefined) return false;
  if (!Array.isArray(needs)) throw new Unsupported("yaml_unreadable");
  return needs.length > 0;
}

function matchedRuleRuns(job, rule) {
  // Job-level `when` beside `rules` changed meaning across GitLab versions, so
  // it is not guessed.
  if (rule.when === undefined && job.when !== undefined && job.when !== "on_success") {
    throw new Unsupported("when_unsupported");
  }
  const when = rule.when ?? "on_success";
  if (NOT_RUN.has(when)) return false;
  if (!AUTOMATIC.has(when) && when !== "manual") throw new Unsupported("when_unsupported");
  // In `rules`, `when: manual` defaults to `allow_failure: false`: a blocking
  // manual job holds the pipeline until QC is played and passes.
  const allowFailure = rule.allow_failure ?? job.allow_failure ?? false;
  if (allowFailure === false) return true;
  if (allowFailure === true || isPlainObject(allowFailure)) return false;
  throw new Unsupported("yaml_unreadable");
}

function contextValues(context, defaultBranch) {
  return {
    CI_PIPELINE_SOURCE: "merge_request_event",
    CI_MERGE_REQUEST_EVENT_TYPE: context.eventType,
    CI_COMMIT_BRANCH: UNSET,
    CI_COMMIT_TAG: UNSET,
    CI_DEFAULT_BRANCH: defaultBranch ?? UNKNOWN,
  };
}

function contextState(config, jobName, context, defaultBranch) {
  try {
    assertNoOverride(config.variables);
    const job = gitlabJob(config, jobName);
    if (job !== null && containsReference([job.rules, job.when, job.allow_failure])) {
      throw new Unsupported("reference_tag");
    }
    assertNoOverride(job?.variables);
    const values = contextValues(context, defaultBranch);
    const runs = pipelineCreated(config.workflow, values) && jobRuns(job, values);
    return { state: runs ? "reachable" : "unreachable" };
  } catch (error) {
    if (error instanceof Unsupported) return { state: "unsupported", reason: error.reason };
    throw error;
  }
}

/**
 * §A-BACKLOG-01 folds the per-context answers into the `rules` field:
 * `reachable` only when every given context runs the job blocking.
 */
export function jobReachability(config, jobName, { contexts, defaultBranch = null }) {
  const states = contexts.map((context) => ({
    name: context.name,
    ...contextState(config, jobName, context, defaultBranch),
  }));
  const unsupported = states.find((entry) => entry.state === "unsupported");
  const rules = unsupported
    ? "unsupported"
    : states.every((entry) => entry.state === "reachable")
      ? "reachable"
      : "unreachable";
  return { rules, states, reason: unsupported?.reason ?? null };
}

/** §A-BACKLOG-01 reads the clone depth a job gets; a shallow clone turns the history stage into a skip. */
export function gitlabHistory(config, jobName) {
  let job;
  try {
    job = gitlabJob(config, jobName);
  } catch {
    return "unknown";
  }
  // A matched workflow or job rule's variables override both the job's and the
  // global GIT_DEPTH. Which rule matches is not resolved here, so any rule that
  // sets the depth leaves the effective clone unknown rather than full.
  const rules = [config.workflow?.rules, job?.rules].flatMap((list) =>
    Array.isArray(list) ? list : [],
  );
  if (rules.some((rule) => isPlainObject(rule?.variables) && "GIT_DEPTH" in rule.variables)) {
    return "unknown";
  }
  const own = isPlainObject(job?.variables) ? job.variables.GIT_DEPTH : undefined;
  const global = isPlainObject(config.variables) ? config.variables.GIT_DEPTH : undefined;
  const raw = own ?? global;
  const depth = String(isPlainObject(raw) ? raw.value : (raw ?? ""));
  if (depth === "0") return "full";
  return /^[1-9][0-9]*$/u.test(depth) ? "shallow" : "unknown";
}
