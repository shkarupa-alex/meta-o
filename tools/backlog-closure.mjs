#!/usr/bin/env node
/**
 * Join frozen Markdown blocks to the reviewed semantic inventory in Appendix A.
 * Source prose is never classified by keywords. Protects §A-MEMORY-03.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { fromMarkdown } from "mdast-util-from-markdown";

export const SOURCES = [
  { blob: "8d11d1107eb5875235c2830e6503f7e1265317d7", path: "docs/backlog.md", boundary: "open" },
  {
    blob: "c75859372fa7d794269cc6dcc8834c069ddd8096",
    path: "docs/backlog-issues-real-runs.md",
    boundary: "after-h1",
  },
];
export const PROOFS = {
  "P-REUSE": {
    command: ["node", "--test", "tests/adapter-contract.test.mjs", "tests/live-adapters.test.mjs"],
    durable_paths: ["docs/architecture/reuse-evidence.md", "src/skills/find-reuse/SKILL.md"],
  },
  "P-REVIEW": {
    command: [
      "node",
      "--test",
      "tests/skill-evals.test.mjs",
      "tests/orchestration-contract.test.mjs",
    ],
    durable_paths: ["shared/references/review-protocol.md", "src/skills/mo-review-orca/SKILL.md"],
  },
  "P-LIFECYCLE": {
    command: ["node", "--test", "tests/skill-evals.test.mjs", "tests/backend-transition.test.mjs"],
    durable_paths: ["shared/references/methodology.md", "src/skills/mo-orchestrate-orca/SKILL.md"],
  },
  "P-ORCA": {
    command: ["node", "--test", "tests/backend-transition.test.mjs"],
    durable_paths: ["docs/backend-capabilities.md", "shared/references/orca-mechanics.md"],
  },
  "P-WATCHDOG": {
    command: ["node", "--test", "tests/backend-transition.test.mjs"],
    durable_paths: [
      "docs/architecture/watchdog-local-classifier.md",
      "shared/scripts/mo-watchdog.sh",
    ],
  },
  "P-KNOWLEDGE": {
    command: [
      "node",
      "--test",
      "tests/knowledge-chain.test.mjs",
      "tests/knowledge-history.test.mjs",
      "tests/build-skills.test.mjs",
      "tests/eslint-symbol-purpose.test.mjs",
    ],
    durable_paths: ["docs/architecture/knowledge-identifiers.md", "tools/knowledge-history.mjs"],
  },
};
const BLOCKS = new Set(["heading", "paragraph", "listItem", "code", "blockquote"]);
const BACKLOG = [
  ["Watchdog с локальной моделью", "Spec 3", "P-WATCHDOG", "architecture-rejected"],
  ["Цепочка id проверяется только до уровня модуля", "Spec 4", "P-KNOWLEDGE", "implemented"],
  ["Якоря не снимаются при сборке", "Spec 4", "P-KNOWLEDGE", "implemented"],
  ["Удаление тезиса и переиспользование id", "Spec 4", "P-KNOWLEDGE", "implemented"],
  ["Реальный запуск mo-review", "Specs 2–3", "P-LIFECYCLE", "implemented"],
  ["Про ревью", "Specs 1–2", "P-REVIEW", "implemented"],
  ["Еще про ревью", "Specs 1–2", "P-REVIEW", "architecture-rejected"],
  ["Про важные штуки", "Specs 1–2", "P-REVIEW", "implemented"],
  ["Быстрое ревью", "Spec 2", "P-REVIEW", "implemented"],
  ["Скилл ревью", "Specs 1–2", "P-REVIEW", "implemented"],
  ["Названия вкладок/панелей", "Specs 2–3", "P-LIFECYCLE", "implemented"],
  ["Вербозность ревьюеров", "Spec 2", "P-REVIEW", "implemented"],
  ["31.08.26 - новый фокус кодекса", "Spec 3", "P-WATCHDOG", "implemented"],
  ["Ошибки набитые в реальных запусках", "Specs 2–4", "P-LIFECYCLE", "implemented"],
];
const DUPLICATES = new Map([
  [102, 47],
  [162, 147],
  [252, 153],
  [276, 224],
  [290, 244],
  [333, 96],
  [344, 24],
]);

function gitBlob(root, blob) {
  const result = spawnSync("git", ["cat-file", "blob", blob], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2 ** 24,
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `cannot read ${blob}`);
  return result.stdout.replaceAll("\r\n", "\n");
}
function text(node) {
  return typeof node.value === "string" ? node.value : (node.children ?? []).map(text).join("");
}
function selected(tree, boundary) {
  const offset =
    boundary === "after-h1"
      ? tree.children[0].position.end.offset
      : tree.children.find(
          (node) => node.type === "heading" && node.depth === 2 && text(node) === "Открыто",
        )?.position.start.offset;
  if (offset === undefined) throw new Error("frozen source boundary is absent");
  const found = [];
  function visit(node, parent) {
    if (BLOCKS.has(node.type) && node.position.start.offset >= offset) found.push({ node, parent });
    for (const child of node.children ?? []) visit(child, node);
  }
  visit(tree, null);
  return found;
}
function tables(markdown) {
  const tokens = new MarkdownIt().parse(markdown, {});
  const rows = [];
  let heading = "",
    row = null,
    cell = null;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "heading_open") heading = tokens[index + 1]?.content ?? "";
    if (token.type === "tr_open") row = [];
    if (token.type === "th_open" || token.type === "td_open") cell = "";
    if (cell !== null && token.type === "inline") cell += token.content;
    if (token.type === "th_close" || token.type === "td_close") {
      row.push(cell.trim());
      cell = null;
    }
    if (token.type === "tr_close") {
      rows.push({ heading, cells: row });
      row = null;
    }
  }
  return rows;
}
function locators(value) {
  return [...value.matchAll(/RR:L(\d+)(?:-L?(\d+))?/gu)].map((match) => ({
    start: +match[1],
    end: +(match[2] ?? match[1]),
  }));
}
function proofFor(owner) {
  if (owner === "Spec 4") return "P-KNOWLEDGE";
  if (owner === "Spec 2" || owner === "Specs 1–2") return "P-REVIEW";
  if (owner.includes("2–3") || owner.includes("2–4") || owner === "Specs 1–3") return "P-LIFECYCLE";
  return "P-ORCA";
}
function assignments(root) {
  const spec = readFileSync(
    resolve(root, "spec/2026-08-31-backlog-zero/spec-04-knowledge-backlog-closure.md"),
    "utf8",
  );
  const result = [];
  let sequence = 0;
  for (const { heading, cells } of tables(spec)) {
    if (!heading.includes("observations") && !heading.includes("incident families")) continue;
    if (cells[0] === "Obligation") continue;
    const ranges = locators(cells[1]);
    if (!ranges.length) continue;
    const withRole = cells.length === 5;
    const role = withRole ? cells[2] : "obligation + evidence";
    const owner = withRole ? cells[3] : cells[2];
    const canonical = DUPLICATES.get(ranges[0].start);
    sequence += 1;
    result.push({
      id: `O-RR-${String(sequence).padStart(3, "0")}`,
      ranges,
      role,
      owner,
      proof: proofFor(owner),
      canonical,
      disposition: canonical
        ? "merged-duplicate"
        : role.includes("superseded workaround")
          ? "public-workaround-proven"
          : "implemented",
    });
  }
  return result;
}
function digest(node, source) {
  return createHash("sha256")
    .update(`${node.type}\0${source.slice(node.position.start.offset, node.position.end.offset)}`)
    .digest("hex");
}
function locator(info, node, headings, ordinal) {
  return `${info.blob}:${info.path}:L${node.position.start.line}-L${node.position.end.line}:${headings.filter(Boolean).join(" > ") || "<root>"}:block-${String(ordinal).padStart(4, "0")}`;
}
function row(info, source, node, headings, ordinal, assignment, role, obligation = assignment.id) {
  const proof = PROOFS[assignment.proof];
  return {
    source_locator: locator(info, node, headings, ordinal),
    source_digest: digest(node, source),
    node_type: node.type,
    node_role: role,
    obligation_id: obligation,
    owner_workstream: assignment.owner,
    disposition: assignment.disposition,
    durable_obligation: proof.durable_paths,
    proof_id: assignment.proof,
    ...(role === "superseded-workaround" ? { replacement_contract: proof.durable_paths } : {}),
  };
}
function backlogRows(info, source, items) {
  const result = [],
    headings = [];
  let active = null;
  items.forEach(({ node }, index) => {
    const value = text(node).trim();
    let matched = null;
    if (node.type === "heading") {
      headings.length = node.depth - 1;
      headings[node.depth - 2] = value;
      matched = BACKLOG.find(([title]) => value.includes(title));
      if (matched)
        active = {
          id: `O-BL-${String(BACKLOG.indexOf(matched) + 1).padStart(2, "0")}`,
          owner: matched[1],
          proof: matched[2],
          disposition: matched[3],
        };
    }
    active ??= {
      id: "O-BL-CONTEXT",
      owner: "Spec 4",
      proof: "P-KNOWLEDGE",
      disposition: "implemented",
    };
    result.push(
      row(
        info,
        source,
        node,
        headings,
        index + 1,
        active,
        matched ? "obligation" : active.id === "O-BL-CONTEXT" ? "context" : "evidence",
      ),
    );
  });
  return result;
}
function realRows(info, source, items, semantic) {
  const result = [],
    headings = [],
    byStart = new Map();
  for (const item of semantic) for (const range of item.ranges) byStart.set(range.start, item.id);
  items.forEach(({ node }, index) => {
    const value = text(node).trim();
    if (node.type === "heading") {
      headings.length = node.depth - 1;
      headings[node.depth - 2] = value;
    }
    const line = node.position.start.line;
    const found = semantic.find(({ ranges }) =>
      ranges.some(({ start, end }) => line >= start && line <= end),
    );
    if (!found) {
      const context = {
        id: "O-RR-CONTEXT",
        owner: "Specs 2–4",
        proof: "P-LIFECYCLE",
        disposition: "implemented",
      };
      result.push(row(info, source, node, headings, index + 1, context, "context"));
      return;
    }
    const first =
      line === found.ranges[0].start &&
      !result.some(
        ({ obligation_id, node_role }) => obligation_id === found.id && node_role === "obligation",
      );
    const role = found.canonical
      ? "duplicate-evidence"
      : first
        ? "obligation"
        : found.role.includes("superseded workaround")
          ? "superseded-workaround"
          : found.role.includes("positive control")
            ? "positive-control"
            : "evidence";
    result.push(
      row(
        info,
        source,
        node,
        headings,
        index + 1,
        found,
        role,
        found.canonical ? byStart.get(found.canonical) : found.id,
      ),
    );
  });
  return result;
}
/** §A-MEMORY-03 emits one exact row for every selected frozen AST block. */
export function buildClosureMap(root = process.cwd()) {
  const rows = [],
    source_counts = {},
    semantic_assignments = assignments(root);
  for (const info of SOURCES) {
    const source = gitBlob(root, info.blob);
    const items = selected(fromMarkdown(source), info.boundary);
    rows.push(
      ...(info.path === "docs/backlog.md"
        ? backlogRows(info, source, items)
        : realRows(info, source, items, semantic_assignments)),
    );
    source_counts[info.path] = items.length;
  }
  return {
    contract: "meta-o.backlog-closure-map.v2",
    sources: SOURCES,
    source_counts,
    proofs: PROOFS,
    semantic_assignments,
    rows,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) {
    console.error("usage: backlog-closure.mjs <output.json>");
    process.exitCode = 2;
  } else {
    const map = buildClosureMap();
    writeFileSync(process.argv[2], `${JSON.stringify(map, null, 2)}\n`);
    console.log(`wrote ${map.rows.length} closure rows to ${process.argv[2]}`);
  }
}
