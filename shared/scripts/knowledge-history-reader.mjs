/**
 * Read every historical object one knowledge-history run needs, each once.
 *
 * §A-MEMORY-01 judges the commit graph rather than the working tree, so the
 * checker cannot check anything out: it has to read historical trees through
 * Git. The naive shape of that — one `git show` per document per edge — pays a
 * process spawn for every read, and the same document is read again for every
 * edge, reference check and authorization lookup that touches its commit.
 *
 * This reader keeps the same reads and removes the repetition. One
 * `cat-file --batch-command` spawn answers a whole round of requests, an object
 * already in the cache is never requested again, and a Markdown blob is parsed
 * once per blob rather than once per path per commit. Nothing here decides
 * anything: it returns exactly what Git stores, so the rules above it stay the
 * only place where a violation is defined.
 */

import { spawnSync } from "node:child_process";

import { definitionsFromTree, parseDocument } from "./knowledge-documents.mjs";

const ARCHITECTURE_ROOT = "docs/architecture";
const BUSINESS_DOCUMENT = "docs/business.md";

/** §A-MEMORY-01 marks a read the gate must report as `unavailable`, not as a pass. */
export function unreadable(detail) {
  return Object.assign(new Error(detail), { historyUnavailable: true });
}

/** §A-MEMORY-01 runs one bounded Git command and returns its exact stdout. */
export function git(root, args, allowMissing = false) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0 && !allowMissing) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.status === 0 ? result.stdout : null;
}

function parseBatch(buffer, keys) {
  const answers = new Map();
  let offset = 0;
  for (const key of keys) {
    const end = buffer.indexOf(0x0a, offset);
    if (end < 0) throw unreadable(`truncated answer for ${key}`);
    const header = buffer.toString("utf8", offset, end);
    offset = end + 1;
    if (header.endsWith(" missing")) {
      answers.set(key, null);
      continue;
    }
    const [oid, type, size] = header.split(" ");
    const length = Number(size);
    if (!Number.isInteger(length) || offset + length > buffer.length) {
      throw unreadable(`short frame for ${key}`);
    }
    if (!["blob", "tree", "commit", "tag"].includes(type)) {
      throw unreadable(`unknown object type ${type} for ${key}`);
    }
    answers.set(key, { oid, type, body: buffer.subarray(offset, offset + length) });
    offset += length + 1;
  }
  return answers;
}

function treeEntries(body, oidBytes) {
  const entries = [];
  let offset = 0;
  while (offset < body.length) {
    const space = body.indexOf(0x20, offset);
    const nul = body.indexOf(0x00, space);
    entries.push({
      name: body.toString("utf8", space + 1, nul),
      oid: body.subarray(nul + 1, nul + 1 + oidBytes).toString("hex"),
      tree: body.toString("utf8", offset, space).startsWith("040"),
    });
    offset = nul + 1 + oidBytes;
  }
  return entries;
}

function commitMessage(body) {
  const text = body.toString("utf8");
  const blank = text.indexOf("\n\n");
  return blank < 0 ? "" : text.slice(blank + 2);
}

/** §A-MEMORY-01 answers a whole round of object reads with one Git process. */
function createObjectCache(root, stats) {
  const objects = new Map();
  let closed = false;
  let oidBytes = null;

  const alive = () => {
    if (closed) throw new Error("knowledge history reader is closed");
  };

  const run = (args, allowMissing = false) => {
    alive();
    stats.spawns += 1;
    return git(root, args, allowMissing);
  };

  const fetch = (keys) => {
    const wanted = [...new Set(keys)].filter((key) => !objects.has(key));
    if (wanted.length === 0) return;
    alive();
    stats.spawns += 1;
    stats.objectRequests += wanted.length;
    const result = spawnSync("git", ["-C", root, "cat-file", "--batch-command", "--buffer"], {
      input: `${wanted.map((key) => `contents ${key}`).join("\n")}\nflush\n`,
      maxBuffer: 1024 * 1024 * 1024,
    });
    if (result.status !== 0) {
      throw unreadable(`git cat-file exited ${result.status}: ${String(result.stderr).trim()}`);
    }
    for (const [key, value] of parseBatch(result.stdout, wanted)) objects.set(key, value);
  };

  return {
    run,
    fetch,
    object: (key) => {
      if (!objects.has(key)) fetch([key]);
      return objects.get(key);
    },
    oidLength: () => {
      if (oidBytes === null) {
        oidBytes = run(["rev-parse", "--show-object-format"]).trim() === "sha256" ? 32 : 20;
      }
      return oidBytes;
    },
    size: () => objects.size,
    close: () => {
      closed = true;
      objects.clear();
    },
  };
}

// Two rounds answer a whole run: the commits with their knowledge trees, then
// every distinct document those trees name. Anything the rules ask for later is
// already in the cache, so a late read is a cache miss worth noticing.
function prime(commits, { fetch, documents, stats, roots }) {
  const unique = [...new Set(commits)];
  fetch(
    unique.flatMap((commit) => [
      commit,
      `${commit}:${roots.architecture}`,
      `${commit}:${roots.business}`,
    ]),
  );
  const blobs = new Set(unique.flatMap((c) => documents(c).map((entry) => entry.oid)));
  fetch([...blobs]);
  stats.uniqueMarkdownBlobs = blobs.size;
}

/**
 * §A-MEMORY-01 opens one caching reader over the historical knowledge documents.
 *
 * The reader owns a live view of the repository and must be closed, so callers
 * can prove no Git child outlives the run that started it.
 */
export function createHistoryReader(root, options = {}) {
  const architectureRoot = options.architecture ?? ARCHITECTURE_ROOT;
  const businessDocument = options.business ?? BUSINESS_DOCUMENT;
  const caches = {
    trees: new Map(),
    definitions: new Map(),
    snapshot: new Map(),
    paths: new Map(),
  };
  const stats = { spawns: 0, objectRequests: 0, markdownParses: 0, uniqueMarkdownBlobs: 0 };
  const cache = createObjectCache(root, stats);
  const { fetch, object } = cache;
  const roots = { architecture: architectureRoot, business: businessDocument };

  // `ls-tree -r` would answer this with one spawn per commit. Walking the trees
  // that are already in the batch keeps the same depth-first order for free.
  const walk = (prefix, treeOid, found) => {
    const tree = object(treeOid);
    if (!tree) return;
    const nested = [];
    for (const entry of treeEntries(tree.body, cache.oidLength())) {
      if (entry.tree) nested.push(entry);
      else if (entry.name.endsWith(".md"))
        found.push({ path: `${prefix}/${entry.name}`, oid: entry.oid });
    }
    fetch(nested.map((entry) => entry.oid));
    for (const entry of nested) walk(`${prefix}/${entry.name}`, entry.oid, found);
  };

  const documents = (commit) => {
    if (!caches.paths.has(commit)) {
      const found = [];
      const architecture = object(`${commit}:${architectureRoot}`);
      if (architecture?.type === "tree") walk(architectureRoot, architecture.oid, found);
      const business = object(`${commit}:${businessDocument}`);
      if (business) found.push({ path: businessDocument, oid: business.oid });
      caches.paths.set(commit, found);
    }
    return caches.paths.get(commit);
  };

  // One `fromMarkdown` per blob, not one per path per commit per rule. Every
  // projection above reads that single AST, so the parse budget stays the
  // number of distinct documents the history actually contains.
  const tree = (oid) => {
    if (!caches.trees.has(oid)) {
      const blob = object(oid);
      if (!blob) throw unreadable(`missing blob ${oid}`);
      stats.markdownParses += 1;
      caches.trees.set(oid, parseDocument(blob.body.toString("utf8")));
    }
    return caches.trees.get(oid);
  };

  return {
    root,
    git: cache.run,
    documents,
    tree,
    snapshots: caches.snapshot,
    prime: (commits) => prime(commits, { fetch, documents, stats, roots }),
    definitions: (oid, path) => {
      const key = `${oid}\u0000${path}`;
      if (!caches.definitions.has(key))
        caches.definitions.set(key, definitionsFromTree(tree(oid), path));
      return caches.definitions.get(key);
    },
    trailers: (commit) => {
      const body = object(commit);
      if (!body) throw unreadable(`missing commit ${commit}`);
      return commitMessage(body.body);
    },
    stats: () => ({ ...stats, uniqueObjects: cache.size() }),
    close: () => {
      cache.close();
      for (const entry of Object.values(caches)) entry.clear();
    },
  };
}
