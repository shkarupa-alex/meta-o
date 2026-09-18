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
 *
 * Implements §A-DISTRIBUTION-01: one source owner, mechanical generation and a
 * byte-exact `--check`. It also enforces §A-DISTRIBUTION-02 bundling,
 * §A-DISTRIBUTION-03 licence closure and the §A-DISTRIBUTION-06 frontmatter gate.
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
  writeFileSync,
} from "node:fs";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";
import { buildSync } from "esbuild";
import { fromMarkdown } from "mdast-util-from-markdown";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_SRC = join(ROOT, "src", "skills");
const SHARED_SRC = join(ROOT, "shared");
const OUTPUT = join(ROOT, "skills");

const SOURCE_ANCHOR = /^<!-- mo:source-anchor (§A-[A-Z][A-Z0-9-]*-[0-9]{2}) -->$/;

/**
 * Remove source-only architecture markers without serializing the Markdown.
 *
 * Positional deletion preserves every authored byte except the marker span, so
 * the block structure around the marker survives byte for byte. Taking the
 * adjacent line breaks too would join the blocks the marker stood between and
 * silently rewrite the published instruction. Parsing first is load-bearing:
 * text that only resembles a marker inside code, prose or a malformed comment
 * must stop the build instead of changing the published instructions.
 *
 * Implements §A-MEMORY-01.
 */
export function stripSourceAnchors(source, label = "Markdown source") {
  const tree = fromMarkdown(source);
  const spans = [];
  const visit = (node, parent = null) => {
    if (node.type === "html" && String(node.value).includes("mo:source-anchor")) {
      if (!SOURCE_ANCHOR.test(node.value)) {
        throw new Error(
          `${label} has malformed source anchor at line ${node.position?.start.line}`,
        );
      }
      if (parent?.type !== "root") {
        throw new Error(
          `${label} has source anchor outside a standalone HTML marker at line ${node.position?.start.line}`,
        );
      }
      spans.push([node.position.start.offset, node.position.end.offset]);
    }
    for (const child of node.children ?? []) visit(child, node);
  };
  visit(tree);

  for (let offset = source.indexOf("mo:source-anchor"); offset >= 0;) {
    if (!spans.some(([start, end]) => offset >= start && offset < end)) {
      throw new Error(`${label} has source anchor outside a standalone HTML marker`);
    }
    offset = source.indexOf("mo:source-anchor", offset + 1);
  }

  // Exactly the marker spans, right to left: every other byte of the source,
  // including the line terminator the marker sits on, is published unchanged.
  // A marker's residue is therefore controlled by where it is authored, not by
  // widening the removal.
  let result = source;
  for (const [start, end] of spans.sort((left, right) => right[0] - left[0])) {
    result = result.slice(0, start) + result.slice(end);
  }
  return result;
}

/** Strip architecture markers from every Markdown file in one generated skill. */
function stripGeneratedAnchors(skillRoot, name) {
  for (const relative of walk(skillRoot).filter((path) => path.endsWith(".md"))) {
    const destination = join(skillRoot, relative);
    const source = readFileSync(destination, "utf8");
    const stripped = stripSourceAnchors(source, `src/generated ${name}/${relative}`);
    if (stripped !== source) writeFileSync(destination, stripped);
  }
}

/**
 * The roots every Markdown-reading bundle carries.
 *
 * Measured from a trial build, not guessed: the parser pulls its own micromark
 * graph, and a hand-kept list drifts the first time upstream splits a package.
 */
const MARKDOWN_ROOTS = [
  "character-entities",
  "decode-named-character-reference",
  "mdast-util-from-markdown",
  "mdast-util-to-string",
  "micromark",
  "micromark-core-commonmark",
  "micromark-factory-destination",
  "micromark-factory-label",
  "micromark-factory-space",
  "micromark-factory-title",
  "micromark-factory-whitespace",
  "micromark-util-character",
  "micromark-util-chunked",
  "micromark-util-classify-character",
  "micromark-util-combine-extensions",
  "micromark-util-decode-numeric-character-reference",
  "micromark-util-decode-string",
  "micromark-util-encode",
  "micromark-util-html-tag-name",
  "micromark-util-normalize-identifier",
  "micromark-util-resolve-all",
  "micromark-util-sanitize-uri",
  "micromark-util-subtokenize",
  "unist-util-stringify-position",
];

/**
 * One explicit closure per bundle: the package roots its metafile may contain
 * and the measured size it may not outgrow.
 *
 * §A-DISTRIBUTION-03 keeps the licence closure here rather than in the file
 * distribution, because roots belong to the bundle that pulls them, and one
 * mapping stopped describing a build that produces more than one bundle. An
 * unexpected root or a missing entry breaks generation; that is the property.
 */
export const BUNDLES = {
  "scripts/mo-models.mjs": {
    baselineBytes: 1_012_923,
    roots: ["@anthropic-ai/claude-agent-sdk"],
  },
  "scripts/mo-backlog.mjs": {
    baselineBytes: 196_079,
    roots: MARKDOWN_ROOTS,
  },
  "scripts/mo-knowledge-history.mjs": {
    baselineBytes: 321_157,
    roots: [...MARKDOWN_ROOTS, "js-yaml"],
  },
};

/** A root under other terms breaks generation exactly as an unexpected root does. */
export const LICENSE_ALLOWLIST = new Set(["MIT"]);

/**
 * Roots whose `license` field is not an SPDX id, bound to their exact text.
 *
 * The model SDK points at its README instead of naming terms, so no allowlist
 * of identifiers can clear it. Naming it once, with the exact string, keeps the
 * closure machine-checked: if upstream changes that field, the build stops.
 */
export const LICENSE_EXCEPTIONS = {
  "@anthropic-ai/claude-agent-sdk": "SEE LICENSE IN README.md",
};

/** The notice names the ecosystem actually uses, in the order worth trying. */
const LICENSE_FILES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "LICENCE",
  "LICENCE.md",
  "license",
  "license.md",
];

/** §A-DISTRIBUTION-03 names one bundled root's notice inside a generated skill. */
export function licenseSlug(root) {
  return root.replace(/^@/u, "").replaceAll("/", "__");
}

/**
 * Which shared file lands in which skill.
 *
 * Every entry is a deliberate decision about standalone installability:
 * Orchestrators and standalone reviewers each carry their backend mechanics
 * plus the shared contracts they consume. Setup owns project readiness and the
 * watchdog owns only its methodology-independent observer helper.
 */
export const SHARED_PLAN = {
  "mo-orchestrate-orca": [
    ["references/methodology.md", "references/methodology.md"],
    ["references/backend-contract.md", "references/backend-contract.md"],
    ["references/review-protocol.md", "references/review-protocol.md"],
    ["references/purpose-and-architecture.md", "references/purpose-and-architecture.md"],
    ["references/orca-mechanics.md", "references/orca-mechanics.md"],
    ["references/issue-routing.md", "references/issue-routing.md"],
    ["scripts/mo-models.mjs", "scripts/mo-models.mjs"],
    ["scripts/mo-backlog.mjs", "scripts/mo-backlog.mjs"],
    ["scripts/mo-posture.sh", "scripts/mo-posture.sh"],
  ],
  "mo-review-orca": [
    ["references/backend-contract.md", "references/backend-contract.md"],
    ["references/review-protocol.md", "references/review-protocol.md"],
    ["references/purpose-and-architecture.md", "references/purpose-and-architecture.md"],
    ["references/orca-mechanics.md", "references/orca-mechanics.md"],
    ["scripts/mo-models.mjs", "scripts/mo-models.mjs"],
    ["scripts/mo-backlog.mjs", "scripts/mo-backlog.mjs"],
  ],
  "mo-setup": [
    ["references/project-setup.md", "references/project-setup.md"],
    ["scripts/mo-backlog.mjs", "scripts/mo-backlog.mjs"],
    ["scripts/mo-knowledge-history.mjs", "scripts/mo-knowledge-history.mjs"],
    ["references/backend-contract.md", "references/backend-contract.md"],
    ["references/purpose-and-architecture.md", "references/purpose-and-architecture.md"],
    ["scripts/mo-posture.sh", "scripts/mo-posture.sh"],
  ],
  "mo-watchdog": [
    ["references/watchdog.md", "references/watchdog.md"],
    ["scripts/mo-watchdog.sh", "scripts/mo-watchdog.sh"],
  ],
};

/** Return the package root represented by an esbuild metafile input path. */
/** §A-DISTRIBUTION-02 identifies bundled third-party roots for licence closure. */
export function packageRoot(input) {
  const marker = "node_modules/";
  const offset = input.lastIndexOf(marker);
  if (offset < 0) return null;
  const parts = input.slice(offset + marker.length).split("/");
  return parts[0]?.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/**
 * §A-DISTRIBUTION-03 produces one self-contained helper and proves its closure.
 *
 * Without the bundle, catalogue discovery and Markdown reading would depend on
 * whichever `node_modules` happened to surround an install. Returning the roots
 * lets the caller ship exactly the notices this bundle actually pulled.
 */
export function bundleShared(source, destination, closure, label) {
  mkdirSync(dirname(destination), { recursive: true });
  const result = buildSync({
    entryPoints: [source],
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
  const declared = [...closure.roots].sort();
  if (JSON.stringify(roots) !== JSON.stringify(declared)) {
    throw new Error(
      `${label} bundle packages ${roots.join(", ") || "none"}; its closure names ` +
        `${declared.join(", ") || "none"}`,
    );
  }
  const unresolved = Object.values(result.metafile.outputs)
    .flatMap((output) => output.imports ?? [])
    .filter((entry) => entry.external && !isBuiltin(entry.path))
    .map((entry) => entry.path);
  if (unresolved.length > 0) {
    throw new Error(`${label} bundle has unresolved runtime imports: ${unresolved.join(", ")}`);
  }
  const ceiling = Math.ceil(closure.baselineBytes * 1.25);
  const bytes = readFileSync(destination).byteLength;
  if (bytes > ceiling) {
    throw new Error(`${label} bundle is ${bytes} bytes; measured ceiling is ${ceiling}`);
  }
  return roots;
}

/**
 * §A-DISTRIBUTION-03 copies each bundled root's notice next to its bundle.
 *
 * The notices are build output, not a committed directory: a stored copy is one
 * more thing that can silently stop matching the package it claims to describe.
 */
export function writeLicenses(skillRoot, roots, label, packagesRoot = join(ROOT, "node_modules")) {
  for (const root of roots) {
    const packageRootPath = join(packagesRoot, ...root.split("/"));
    const declared = JSON.parse(
      readFileSync(join(packageRootPath, "package.json"), "utf8"),
    ).license;
    // An absent field reads as `undefined`, and so does a missing exception, so
    // comparing the two directly let a package that declares nothing at all
    // satisfy an exception recorded for some other root. Unstated terms are the
    // case with the least evidence behind them, so they fail first and loudest.
    const permitted =
      typeof declared === "string" &&
      (LICENSE_ALLOWLIST.has(declared) ||
        (Object.hasOwn(LICENSE_EXCEPTIONS, root) && LICENSE_EXCEPTIONS[root] === declared));
    if (!permitted) {
      throw new Error(
        `${label} bundles ${root}, licensed ${typeof declared === "string" ? declared : "with no license field"}; only ` +
          `${[...LICENSE_ALLOWLIST].join(", ")} may be redistributed`,
      );
    }
    const notice = LICENSE_FILES.map((file) => join(packageRootPath, file)).find((path) =>
      existsSync(path),
    );
    if (!notice) throw new Error(`${label} bundles ${root}, which ships no licence notice`);
    const to = join(skillRoot, "licenses", `${licenseSlug(root)}-LICENSE.txt`);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(notice, to);
  }
}

/**
 * The only frontmatter keys the target skill managers agree on.
 *
 * Claude Code accepts many more, and packaging for the Skills API fails hard on
 * any of them. Portability across Claude Code, Codex, OpenCode, apm and
 * `npx skills` costs exactly this list, and none of the extensions are needed.
 */
export const ALLOWED_FRONTMATTER = new Set([
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
export const REQUIRED_AT_ROOT = [
  ["apm.yml", "apm refuses a root without it"],
  ["README.md", "the install test reads the advertised commands from it"],
  ["LICENSE", "an installed copy has no other statement of its terms"],
];

function fail(message) {
  process.stderr.write(`build-skills: ${message}\n`);
  process.exitCode = 1;
  return false;
}

/** §A-DISTRIBUTION-01 gives build and parity checks one deterministic file inventory. */
export function walk(directory, prefix = "") {
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
 * §A-DISTRIBUTION-01 parses a frontmatter block with a real YAML parser.
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
export function frontmatter(text) {
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
/** §A-DISTRIBUTION-01 materializes the one-source skill tree into a disposable destination. */
export function build(outputRoot) {
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

  // A bundle nobody distributes is a closure nobody proves, and a plan entry
  // that names a missing source would only fail once esbuild reached it.
  for (const destination of Object.keys(BUNDLES)) {
    const shipped = Object.values(SHARED_PLAN).some((plan) =>
      plan.some(([, target]) => target === destination),
    );
    if (!shipped) throw new Error(`BUNDLES names ${destination}, which no skill receives`);
    if (!existsSync(join(SHARED_SRC, destination))) {
      throw new Error(`BUNDLES names ${destination}, which does not exist in shared/`);
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
      const closure = BUNDLES[destination];
      if (closure) {
        writeLicenses(join(outputRoot, name), bundleShared(from, to, closure, destination), name);
      } else cpSync(from, to);
    }
    stripGeneratedAnchors(join(outputRoot, name), name);
  }

  return names;
}

/** Compare two trees byte-for-byte and list every difference. */
/** §A-DISTRIBUTION-01 explains every byte-level drift between a fresh build and distribution. */
export function diffTrees(expectedRoot, actualRoot) {
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
