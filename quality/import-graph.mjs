#!/usr/bin/env node
/**
 * §M-QC-IMPORT-GRAPH — Keep the module graph acyclic and layered.
 *
 * Implements §A-CONTRACT-TYPES. Architecture erodes one reasonable-looking
 * import at a time; the structural consequence — two modules that now need each
 * other — is invisible in the diff that creates it and obvious only once
 * something has to be extracted.
 *
 * Cycles come from Tarjan's algorithm, run iteratively so a deep graph cannot
 * exhaust the stack. Layering is checked explicitly because the two rules this
 * project depends on are easy to break by accident: nothing in `core/` may
 * import an adapter or the CLI, and no adapter may import the CLI.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  encoding: "utf8",
}).trim();

/**
 * §M-QC-IMPORT-GRAPH — Layers, outermost first.
 *
 * A module may import from a layer below it, never from one above. `core` is
 * last because it must stay usable without a backend or a CLI attached.
 */
const LAYERS = ["src/cli", "src/watchdog", "src/adapters", "src/core"];

/** §M-QC-IMPORT-GRAPH — Tracked TypeScript sources. */
function sources() {
  return execFileSync("git", ["ls-files", "src/**/*.mts"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

/** §M-QC-IMPORT-GRAPH — Resolve a relative `.mjs` specifier back to its `.mts` source. */
function resolveSpecifier(from, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const target = normalize(join(dirname(from), specifier));
  return target.endsWith(".mjs") ? `${target.slice(0, -4)}.mts` : target;
}

/** §M-QC-IMPORT-GRAPH — Build the first-party dependency graph. */
function buildGraph(files) {
  const known = new Set(files);
  const graph = new Map(files.map((file) => [file, new Set()]));

  for (const file of files) {
    const text = readFileSync(`${ROOT}/${file}`, "utf8");
    const specifiers = [
      ...text.matchAll(/^\s*(?:import|export)\b[^"']*?\bfrom\s+"([^"]+)"/gm),
      ...text.matchAll(/\bimport\("([^"]+)"\)/g),
    ].map((match) => match[1]);

    for (const specifier of specifiers) {
      const target = resolveSpecifier(file, specifier);
      if (target && known.has(target) && target !== file) graph.get(file).add(target);
    }
  }
  return graph;
}

/** §M-QC-IMPORT-GRAPH — Strongly connected components, iteratively. */
function tarjan(graph) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  let counter = 0;

  for (const start of [...graph.keys()].sort()) {
    if (index.has(start)) continue;
    index.set(start, counter);
    low.set(start, counter);
    counter += 1;
    stack.push(start);
    onStack.add(start);
    const work = [[start, [...(graph.get(start) ?? [])].sort()]];

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const [node, successors] = frame;
      if (successors.length > 0) {
        const successor = successors.pop();
        if (!index.has(successor)) {
          index.set(successor, counter);
          low.set(successor, counter);
          counter += 1;
          stack.push(successor);
          onStack.add(successor);
          work.push([successor, [...(graph.get(successor) ?? [])].sort()]);
        } else if (onStack.has(successor)) {
          low.set(node, Math.min(low.get(node), index.get(successor)));
        }
        continue;
      }

      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(node)));
      }
      if (low.get(node) === index.get(node)) {
        const component = [];
        for (;;) {
          const member = stack.pop();
          onStack.delete(member);
          component.push(member);
          if (member === node) break;
        }
        components.push(component.sort());
      }
    }
  }
  return components;
}

/** §M-QC-IMPORT-GRAPH — Which declared layer a file belongs to. */
function layerOf(file) {
  return LAYERS.findIndex((prefix) => file.startsWith(`${prefix}/`));
}

const files = sources();
const graph = buildGraph(files);
const problems = [];

for (const [file, targets] of [...graph].sort()) {
  for (const target of [...targets].sort()) {
    const here = layerOf(file);
    const there = layerOf(target);
    if (here >= 0 && there >= 0 && there < here) {
      problems.push(
        `${file}:1: [layer-violation] imports ${target} from ${LAYERS[there]}, which sits above ${LAYERS[here]}`,
      );
    }
  }
}

for (const component of tarjan(graph)) {
  if (component.length > 1) {
    problems.push(`${component[0]}:1: [cycle] import cycle: ${component.join(" → ")}`);
  }
}

for (const problem of problems) process.stdout.write(`${problem}\n`);
process.stdout.write(
  problems.length
    ? `import-graph: ${problems.length} problem(s)\n`
    : `import-graph: ok (${files.length} modules, no cycles)\n`,
);
process.exitCode = problems.length ? 1 : 0;
