#!/usr/bin/env node
/**
 * Build `skills/` — the installable tree — from `src/skills/` plus `shared/`.
 *
 * The methodology has one source owner (`shared/`). Each skill has to install on
 * its own, so the shared files are duplicated into every skill that needs them.
 * A duplicate maintained by hand drifts, and drifted methodology is worse than
 * no methodology, so the duplication happens here, mechanically, and `--check`
 * refuses an output tree that does not match what a build would produce.
 *
 * The output sits at the repository's own `skills/` because that is the layout
 * apm and `npx skills` discover when a *remote* repository is installed, and a
 * remote install is the advertised path. An earlier attempt put it in `dist/`,
 * following the spec's literal layout: `apm install <owner>/meta-o` then
 * resolved the authored tree instead and every skill arrived without its
 * references, while `apm install ./dist` failed validation outright because the
 * manifest sat one level above the directory being installed. The authored tree
 * lives under `src/` precisely so discovery cannot reach it.
 *
 * This is a build tool, not a runtime. Nothing installed imports it.
 */

import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";
import { buildSync } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_SRC = join(ROOT, "src", "skills");
const SHARED_SRC = join(ROOT, "shared");
const OUTPUT = join(ROOT, "skills");

/**
 * The runtime package in the settings bundle and the licence that makes its
 * redistribution terms inspectable. Any new metafile package root must acquire
 * an explicit entry here or the build fails before a generated tree can exist.
 */
const BUNDLE_LICENSE_PLAN = {
  "@anthropic-ai/claude-agent-sdk": "licenses/claude-agent-sdk-LICENSE.md",
};

/** The measured first bundle plus 25%; growth beyond it needs a fresh audit. */
const MODEL_BUNDLE_BASELINE_BYTES = 999_247;
const MODEL_BUNDLE_MAX_BYTES = Math.ceil(MODEL_BUNDLE_BASELINE_BYTES * 1.25);

/**
 * Which shared file lands in which skill.
 *
 * Every entry is a deliberate decision about standalone installability:
 * `mo-review` carries the purpose contract so its independently installable
 * package remains self-contained readable protocol material for qualified
 * backend workflows, without pretending to be a standalone executable review;
 * `mo-setup` carries the methodology because provider diagnosis has one owner
 * even though setup owns the personal-configuration remediation.
 */
const SHARED_PLAN = {
  "mo-herdr": [
    ["references/methodology.md", "references/methodology.md"],
    ["scripts/mo-models.mjs", "scripts/mo-models.mjs", { bundleLicenses: BUNDLE_LICENSE_PLAN }],
    ["scripts/mo-posture.sh", "scripts/mo-posture.sh"],
    ["licenses/claude-agent-sdk-LICENSE.md", "licenses/claude-agent-sdk-LICENSE.md"],
  ],
  "mo-omnigent": [
    ["references/methodology.md", "references/methodology.md"],
    ["scripts/mo-models.mjs", "scripts/mo-models.mjs", { bundleLicenses: BUNDLE_LICENSE_PLAN }],
    ["scripts/mo-posture.sh", "scripts/mo-posture.sh"],
    ["licenses/claude-agent-sdk-LICENSE.md", "licenses/claude-agent-sdk-LICENSE.md"],
  ],
  "mo-review": [
    ["references/purpose-and-architecture.md", "references/purpose-and-architecture.md"],
  ],
  "mo-setup": [
    ["references/methodology.md", "references/methodology.md"],
    ["references/purpose-and-architecture.md", "references/purpose-and-architecture.md"],
    ["scripts/mo-posture.sh", "scripts/mo-posture.sh"],
  ],
};

/** Return the package root represented by an esbuild metafile input path. */
function packageRoot(input) {
  const marker = "node_modules/";
  const offset = input.lastIndexOf(marker);
  if (offset < 0) return null;
  const parts = input.slice(offset + marker.length).split("/");
  return parts[0]?.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/**
 * Produce the self-contained helper whose absence would make Claude catalogue
 * discovery depend on whichever node_modules happens to surround an install.
 */
function bundleModels(destination) {
  mkdirSync(dirname(destination), { recursive: true });
  const result = buildSync({
    entryPoints: [join(SHARED_SRC, "scripts", "mo-models.mjs")],
    outfile: destination,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    minify: false,
    sourcemap: false,
    metafile: true,
    preserveSymlinks: true,
    logLevel: "silent",
  });
  chmodSync(destination, 0o755);
  const roots = [
    ...new Set(Object.keys(result.metafile.inputs).map(packageRoot).filter(Boolean)),
  ].sort();
  const licensed = Object.keys(BUNDLE_LICENSE_PLAN).sort();
  if (JSON.stringify(roots) !== JSON.stringify(licensed)) {
    throw new Error(
      `mo-models bundle packages ${roots.join(", ") || "none"}; licence plan names ` +
        `${licensed.join(", ") || "none"}`,
    );
  }
  const unresolved = Object.values(result.metafile.outputs)
    .flatMap((output) => output.imports ?? [])
    .filter((entry) => entry.external && !isBuiltin(entry.path))
    .map((entry) => entry.path);
  if (unresolved.length > 0) {
    throw new Error(`mo-models bundle has unresolved runtime imports: ${unresolved.join(", ")}`);
  }
  const bytes = readFileSync(destination).byteLength;
  if (bytes > MODEL_BUNDLE_MAX_BYTES) {
    throw new Error(
      `mo-models bundle is ${bytes} bytes; measured ceiling is ${MODEL_BUNDLE_MAX_BYTES}`,
    );
  }
}

/**
 * The only frontmatter keys the target skill managers agree on.
 *
 * Claude Code accepts many more, and packaging for the Skills API fails hard on
 * any of them. Portability across Claude Code, Codex, OpenCode, apm and
 * `npx skills` costs exactly this list, and none of the extensions are needed.
 */
const ALLOWED_FRONTMATTER = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

/**
 * Files that must exist beside the skills, at the root being installed, each with
 * the consumer that actually needs it.
 *
 * Only `apm.yml` is required by apm itself, and the evidence is its own refusal —
 * "no apm.yml, SKILL.md, or plugin.json found" — when the manifest sits one level
 * above the directory being installed. The other two are required by this
 * project: `README.md` is what `tests/install.test.mjs` reads to check that the
 * advertised commands are the ones proven, and `LICENSE` is what makes the
 * installed copy's terms knowable, since apm copies directories rather than
 * packages with metadata.
 *
 * All three are hand-maintained at the repository root, so the build only checks
 * that they are there — it never generates them.
 */
const REQUIRED_AT_ROOT = [
  ["apm.yml", "apm refuses a root without it"],
  ["README.md", "the install test reads the advertised commands from it"],
  ["LICENSE", "an installed copy has no other statement of its terms"],
];

function fail(message) {
  process.stderr.write(`build-skills: ${message}\n`);
  process.exitCode = 1;
  return false;
}

/** Every file under a directory, as paths relative to it, sorted. */
function walk(directory, prefix = "") {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...walk(join(directory, entry.name), relativePath));
    else if (entry.isFile()) found.push(relativePath);
  }
  return found;
}

/**
 * Parse a frontmatter block with a real YAML parser.
 *
 * A hand-rolled line reader stood here and was wrong in a way that matters: two
 * `name:` lines were accepted and the first silently won, so a skill could pass
 * this gate and install under a name nobody in the repository had read. `js-yaml`
 * in its default mode refuses a duplicate mapping key outright, and it is also
 * what decides quoting, anchors and block scalars — none of which a regex over
 * lines can be trusted with. The project contract forbids hand-written parsers
 * for exactly this reason, and this build is the thing that enforces the
 * contract, so it does not get an exception.
 *
 * Returns `{ data }` on success and `{ error }` when the block is not valid YAML,
 * because "this file's frontmatter is broken" is a build failure with a message,
 * not an exception to leak.
 *
 * This is the only frontmatter reader in the project, and the gate and the tests
 * both go through it. Convenience wrappers stood here briefly and re-created the
 * defect they were meant to prevent: a second place deciding what `name` means.
 */
function frontmatter(text) {
  if (!text.startsWith("---\n")) return { error: "no frontmatter block" };
  const end = text.indexOf("\n---\n", 3);
  if (end < 0) return { error: "no frontmatter block" };
  try {
    const data = yaml.load(text.slice(4, end + 1), { schema: yaml.CORE_SCHEMA });
    if (data === null || data === undefined) return { data: {} };
    if (typeof data !== "object" || Array.isArray(data)) {
      return { error: "frontmatter is not a mapping" };
    }
    return { data };
  } catch (error) {
    return { error: error.reason ?? error.message };
  }
}

/**
 * Check one source skill before it is copied.
 *
 * A skill whose directory name and `name:` disagree installs under one name and
 * is invoked under another — apm resolves that in favour of the directory, so
 * the mismatch is silent until someone wonders why their edit did nothing.
 */
function validateSkill(name) {
  const skillFile = join(SKILLS_SRC, name, "SKILL.md");
  if (!existsSync(skillFile)) return fail(`src/skills/${name} has no SKILL.md`);
  const text = readFileSync(skillFile, "utf8");
  const { data, error } = frontmatter(text);
  if (error) return fail(`src/skills/${name}/SKILL.md frontmatter: ${error}`);
  const keys = Object.keys(data);
  if (!keys.includes("name") || !keys.includes("description")) {
    return fail(`src/skills/${name}/SKILL.md needs both name and description`);
  }
  const unknown = keys.filter((key) => !ALLOWED_FRONTMATTER.has(key));
  if (unknown.length > 0) {
    return fail(
      `src/skills/${name}/SKILL.md has non-canonical frontmatter keys: ${unknown.join(", ")}. ` +
        `Allowed: ${[...ALLOWED_FRONTMATTER].join(", ")}`,
    );
  }
  const declared = typeof data.name === "string" ? data.name : null;
  if (declared !== name) {
    return fail(
      `src/skills/${name}/SKILL.md declares name "${declared}"; it must match the directory`,
    );
  }

  // A shared file present in the source tree means someone started editing a
  // copy. The copies exist only in the built tree, precisely so they cannot be
  // edited by hand.
  for (const [, destination] of SHARED_PLAN[name] ?? []) {
    if (existsSync(join(SKILLS_SRC, name, destination))) {
      return fail(
        `src/skills/${name}/${destination} shadows a shared file. Edit shared/${destination} instead.`,
      );
    }
  }
  return true;
}

/**
 * Copy the source skills plus their shared files into a fresh output tree.
 *
 * `outputRoot` holds one directory per skill and nothing else: it is installed as
 * `<repo>/skills`, and anything extra in there would be offered to the skill
 * manager as an eighth skill.
 */
function build(outputRoot) {
  const names = readdirSync(SKILLS_SRC, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (names.length === 0) throw new Error("src/skills/ is empty");

  let valid = true;
  for (const name of names) valid = validateSkill(name) && valid;
  if (!valid) throw new Error("source skills failed validation");

  for (const unknown of Object.keys(SHARED_PLAN)) {
    if (!names.includes(unknown)) {
      throw new Error(`SHARED_PLAN names "${unknown}", which is not a skill`);
    }
  }

  for (const [required, reason] of REQUIRED_AT_ROOT) {
    if (!existsSync(join(ROOT, required))) {
      throw new Error(`${required} is missing from the repository root: ${reason}`);
    }
  }

  for (const consumer of ["mo-herdr", "mo-omnigent"]) {
    const plan = SHARED_PLAN[consumer];
    const helper = plan.find(([source]) => source === "scripts/mo-models.mjs");
    const declared = Object.keys(helper?.[2]?.bundleLicenses ?? {}).sort();
    const expected = Object.keys(BUNDLE_LICENSE_PLAN).sort();
    if (JSON.stringify(declared) !== JSON.stringify(expected)) {
      throw new Error(`${consumer} mo-models SHARED_PLAN licence mapping is incomplete`);
    }
    for (const [packageName, licensePath] of Object.entries(BUNDLE_LICENSE_PLAN)) {
      if (
        !plan.some(([source, destination]) => source === licensePath && destination === licensePath)
      ) {
        throw new Error(`${consumer} does not ship the ${packageName} licence ${licensePath}`);
      }
      const installed = join(ROOT, "node_modules", ...packageName.split("/"), "LICENSE.md");
      const shared = join(SHARED_SRC, licensePath);
      if (!existsSync(installed) || !readFileSync(installed).equals(readFileSync(shared))) {
        throw new Error(`shared/${licensePath} is not the installed ${packageName} licence`);
      }
    }
  }

  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot, { recursive: true });

  for (const name of names) {
    cpSync(join(SKILLS_SRC, name), join(outputRoot, name), { recursive: true });
    for (const [source, destination] of SHARED_PLAN[name] ?? []) {
      const from = join(SHARED_SRC, source);
      if (!existsSync(from)) throw new Error(`shared/${source} does not exist`);
      const to = join(outputRoot, name, destination);
      mkdirSync(dirname(to), { recursive: true });
      if (source === "scripts/mo-models.mjs") bundleModels(to);
      else cpSync(from, to);
    }
  }

  return names;
}

/** Compare two trees byte-for-byte and list every difference. */
function diffTrees(expectedRoot, actualRoot) {
  if (!existsSync(actualRoot)) return ["skills/ does not exist"];
  const expected = walk(expectedRoot);
  const actual = walk(actualRoot);
  const differences = [];
  for (const path of expected) {
    if (!actual.includes(path)) differences.push(`missing in skills/: ${path}`);
    else if (!readFileSync(join(expectedRoot, path)).equals(readFileSync(join(actualRoot, path)))) {
      differences.push(`differs from source: ${path}`);
    }
  }
  for (const path of actual) {
    if (!expected.includes(path)) differences.push(`stale in skills/: ${path}`);
  }
  return differences;
}

function main() {
  const check = process.argv.includes("--check");
  if (process.argv.slice(2).some((argument) => argument !== "--check")) {
    process.stderr.write("usage: build-skills.mjs [--check]\n");
    process.exitCode = 2;
    return;
  }

  const staging = mkdtempSync(join(tmpdir(), "mo-skills-"));
  try {
    const names = build(staging);
    if (check) {
      const differences = diffTrees(staging, OUTPUT);
      if (differences.length > 0) {
        process.stderr.write(
          `build-skills: skills/ is out of date. Run \`make skills\`.\n  ${differences.join("\n  ")}\n`,
        );
        process.exitCode = 1;
        return;
      }
      process.stdout.write(`skills/ matches ${names.length} source skills\n`);
      return;
    }
    rmSync(OUTPUT, { recursive: true, force: true });
    cpSync(staging, OUTPUT, { recursive: true });
    process.stdout.write(`built skills/ from ${names.length} sources: ${names.join(", ")}\n`);
  } catch (error) {
    process.stderr.write(`build-skills: ${error.message}\n`);
    process.exitCode = 1;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Run only as a program; the helpers above are exported for tests.
 *
 * Both sides go through `realpath` because Node resolves the entry module's
 * symlinks while `process.argv[1]` keeps the path as typed — on macOS that alone
 * is the difference between `/var/folders` and `/private/var/folders`, and a
 * naive comparison turns a build into a silent no-op.
 */
function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) main();

export {
  ALLOWED_FRONTMATTER,
  BUNDLE_LICENSE_PLAN,
  MODEL_BUNDLE_BASELINE_BYTES,
  MODEL_BUNDLE_MAX_BYTES,
  REQUIRED_AT_ROOT,
  SHARED_PLAN,
  build,
  diffTrees,
  frontmatter,
  packageRoot,
  walk,
};
