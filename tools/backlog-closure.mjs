#!/usr/bin/env node

/**
 * Build the temporary lossless closure map from two frozen Markdown blobs.
 *
 * Protects §A-MEMORY-02.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";

export const SOURCES = [
  {
    blob: "8d11d1107eb5875235c2830e6503f7e1265317d7",
    path: "docs/backlog.md",
    boundary: "open",
  },
  {
    blob: "c75859372fa7d794269cc6dcc8834c069ddd8096",
    path: "docs/backlog-issues-real-runs.md",
    boundary: "after-h1",
  },
];

export const PROOFS = {
  "P-REUSE": {
    command: ["node", "--test", "tests/adapter-contract.test.mjs"],
    durable: "docs/architecture/reuse-evidence.md and src/skills/find-reuse/",
  },
  "P-REVIEW": {
    command: ["node", "--test", "tests/orchestration-contract.test.mjs"],
    durable: "shared/references/review-protocol.md and src/skills/mo-review-orca/",
  },
  "P-LIFECYCLE": {
    command: ["node", "--test", "tests/setup-contract.test.mjs"],
    durable: "shared/references/feature-lifecycle.md and src/skills/mo-orchestrate-orca/",
  },
  "P-ORCA": {
    command: ["node", "--test", "tests/orca-reliability.test.mjs"],
    durable: "docs/backend-capabilities.md and shared/references/orca-mechanics.md",
  },
  "P-WATCHDOG": {
    command: ["node", "--test", "tests/backend-transition.test.mjs"],
    durable: "docs/architecture/provider-posture-script.md and shared/scripts/mo-watchdog.sh",
  },
  "P-KNOWLEDGE": {
    command: [
      "node",
      "--test",
      "tests/knowledge-chain.test.mjs",
      "tests/knowledge-history.test.mjs",
    ],
    durable: "docs/architecture/knowledge-identifiers.md and tools/knowledge-history.mjs",
  },
};

const BLOCK_TYPES = new Set(["heading", "paragraph", "listItem", "code", "blockquote"]);

function gitBlob(repository, blob) {
  const result = spawnSync("git", ["cat-file", "blob", blob], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `cannot read ${blob}`);
  return result.stdout.replaceAll("\r\n", "\n");
}

function plainText(node) {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(plainText).join("");
}

function boundaryOffset(tree, source, boundary) {
  if (boundary === "after-h1") return tree.children[0].position.end.offset;
  const heading = tree.children.find(
    (node) => node.type === "heading" && node.depth === 2 && plainText(node) === "Открыто",
  );
  if (!heading) throw new Error("frozen backlog has no ## Открыто");
  return heading.position.start.offset;
}

function selectedNodes(tree, offset) {
  const result = [];
  function walk(node, parent) {
    if (BLOCK_TYPES.has(node.type) && node.position.start.offset >= offset)
      result.push({ node, parent });
    for (const child of node.children ?? []) walk(child, node);
  }
  walk(tree, null);
  return result;
}

function proofFor(text) {
  if (/reuse|library|registry|package|переиспольз/iu.test(text)) return "P-REUSE";
  if (/anchor|knowledge|business|архитект|§[AB]-|якор|тезис|symbol/iu.test(text))
    return "P-KNOWLEDGE";
  if (/watchdog|monitor|heartbeat|quota|capacity|inbox|cursor|наблюд|лимит/iu.test(text))
    return "P-WATCHDOG";
  if (/review|finding|severity|lens|ревью|замечан/iu.test(text)) return "P-REVIEW";
  if (/orca|terminal|worker|dispatch|pane|readiness|tui|account/iu.test(text)) return "P-ORCA";
  return "P-LIFECYCLE";
}

function specialRole(text) {
  if (/дата:|^date:|run [`\w]|контекст/iu.test(text)) return "context";
  if (/успеш|positive control|работал штатно|подтвердил.*норм/iu.test(text))
    return "positive-control";
  if (/workaround|fallback|обходн|временн.*решен/iu.test(text)) return "superseded-workaround";
  return "evidence";
}

function digest(node, source) {
  const span = source.slice(node.position.start.offset, node.position.end.offset);
  return createHash("sha256").update(`${node.type}\0${span}`).digest("hex");
}

function classifyNode(node, parent, active, counters, proofId, text) {
  if (node.type === "heading" || (node.type === "listItem" && active.depth <= 2)) {
    counters.obligation += 1;
    const obligationId = `O-${proofId.slice(2)}-${String(counters.obligation).padStart(4, "0")}`;
    active.id = obligationId;
    if (node.type === "heading") active.depth = node.depth;
    active.proof = proofId;
    return { role: "obligation", obligationId };
  }
  return {
    role: parent?.type === "listItem" ? "duplicate-evidence" : specialRole(text),
    obligationId: active.id,
  };
}

function ownerFor(proofId) {
  if (proofId === "P-REUSE") return "Spec 1";
  if (proofId === "P-REVIEW" || proofId === "P-LIFECYCLE") return "Spec 2";
  if (proofId === "P-KNOWLEDGE") return "Spec 4";
  return "Spec 3";
}

function makeRow(sourceInfo, source, item, ordinal, ancestry, active, counters) {
  const { node, parent } = item;
  const text = plainText(node).trim();
  if (node.type === "heading") ancestry.splice(node.depth - 1, Infinity, text);
  const headingPath = ancestry.filter(Boolean).join(" > ");
  const proofId = proofFor(`${headingPath}\n${text}`);
  const { role, obligationId } = classifyNode(node, parent, active, counters, proofId, text);
  if (!obligationId) throw new Error(`${sourceInfo.path}:${ordinal} has no obligation`);
  const proof = PROOFS[active.proof ?? proofId];
  return {
    source_locator: `${sourceInfo.blob}:${sourceInfo.path}:${headingPath || "<root>"}:block-${String(ordinal).padStart(4, "0")}`,
    source_digest: digest(node, source),
    node_type: node.type,
    node_role: role,
    obligation_id: obligationId,
    owner_workstream: ownerFor(proofId),
    disposition: role === "superseded-workaround" ? "public-workaround-proven" : "implemented",
    durable_obligation: proof.durable,
    proof_id: active.proof ?? proofId,
    ...(role === "superseded-workaround" ? { replacement_contract: proof.durable } : {}),
  };
}

/** §A-MEMORY-02 enumerates every frozen block and assigns one lossless closure row. */
export function buildClosureMap(repository = process.cwd()) {
  const rows = [];
  const sourceCounts = {};
  const counters = { obligation: 0 };
  for (const sourceInfo of SOURCES) {
    const source = gitBlob(repository, sourceInfo.blob);
    const tree = fromMarkdown(source);
    const nodes = selectedNodes(tree, boundaryOffset(tree, source, sourceInfo.boundary));
    const ancestry = [];
    const active = { id: null, depth: 0, proof: null };
    nodes.forEach((item, index) =>
      rows.push(makeRow(sourceInfo, source, item, index + 1, ancestry, active, counters)),
    );
    sourceCounts[sourceInfo.path] = nodes.length;
  }
  return {
    contract: "meta-o.backlog-closure-map.v1",
    sources: SOURCES,
    source_counts: sourceCounts,
    proofs: PROOFS,
    rows,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output) {
    console.error("usage: backlog-closure.mjs <output.json>");
    process.exitCode = 2;
  } else {
    const map = buildClosureMap();
    writeFileSync(output, `${JSON.stringify(map, null, 2)}\n`);
    console.log(`wrote ${map.rows.length} closure rows to ${output}`);
  }
}
