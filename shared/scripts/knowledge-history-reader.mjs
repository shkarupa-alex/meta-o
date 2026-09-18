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
 *
 * Paths are resolved by descending object ids from each commit's own root tree
 * rather than by asking for `<commit>:<path>`. Git answers `missing` both for a
 * path a tree does not carry and for an object it cannot read, and those two
 * must not look alike: the first means the document is absent, the second means
 * the gate has no idea what the commit contained and has to fail closed.
 */

import { spawnSync } from "node:child_process";

import { definitionsFromTree, parseDocument } from "./knowledge-documents.mjs";

const ARCHITECTURE_ROOT = "docs/architecture";
const BUSINESS_DOCUMENT = "docs/business.md";
const OBJECT_TYPES = ["blob", "tree", "commit", "tag"];
// A raw tree object stores a directory as `40000`. Only `ls-tree` pads it to
// `040000`, so testing the padded form skips every subdirectory in silence.
const TREE_MODE = Buffer.from("40000");
const MARKDOWN_SUFFIX = Buffer.from(".md");
const SEPARATOR = Buffer.from("/");
const UTF8 = new TextDecoder("utf-8", { fatal: true });

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

function decode(buffer, what) {
  try {
    return UTF8.decode(buffer);
  } catch {
    throw unreadable(`${what} is not valid UTF-8`);
  }
}

function parseBatch(buffer, keys) {
  const answers = new Map();
  let offset = 0;
  for (const key of keys) {
    const end = buffer.indexOf(0x0a, offset);
    if (end < 0) throw unreadable(`truncated answer for ${key}`);
    const header = decode(buffer.subarray(offset, end), `the answer header for ${key}`);
    offset = end + 1;
    if (header.endsWith(" missing")) {
      answers.set(key, null);
      continue;
    }
    const [oid, type, size] = header.split(" ");
    const length = Number(size);
    if (!Number.isInteger(length) || offset + length >= buffer.length) {
      throw unreadable(`short frame for ${key}`);
    }
    if (!OBJECT_TYPES.includes(type)) throw unreadable(`unknown object type ${type} for ${key}`);
    // Every frame ends with its own newline. Checking it here catches a
    // desynchronised stream at the frame that broke it, not one frame later.
    if (buffer[offset + length] !== 0x0a) throw unreadable(`unterminated frame for ${key}`);
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
    const nul = space < 0 ? -1 : body.indexOf(0x00, space);
    if (nul < 0 || nul + 1 + oidBytes > body.length) {
      throw unreadable("a tree object ends inside an entry");
    }
    // Names stay bytes. A Git path name is opaque, and decoding one the checker
    // never needs would let a legacy-encoded filename anywhere in the repository
    // replace a real violation with a generic unavailability. A name that is not
    // valid UTF-8 can never equal an ASCII knowledge path, so bytes answer it.
    entries.push({
      name: body.subarray(space + 1, nul),
      oid: body.subarray(nul + 1, nul + 1 + oidBytes).toString("hex"),
      tree: body.subarray(offset, space).equals(TREE_MODE),
    });
    offset = nul + 1 + oidBytes;
  }
  return entries;
}

function commitMessage(body) {
  // Deliberately lossy: a commit message is not a knowledge document, Git lets
  // it carry any encoding, and the trailer grammar is pure ASCII, which a lossy
  // decode can neither invent nor destroy. Failing closed here would block the
  // gate on a legitimate repository whose old message is not UTF-8.
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

// One round per path segment, shared by every commit: the trees at one depth
// are all requested before any of them is read, so the number of Git processes
// follows the depth of the knowledge paths and the shape of the graph, never
// the number of commits.
function prime(commits, context) {
  const { fetch, object, oidLength, rootTree, documents, stats, paths } = context;
  const unique = [...new Set(commits)];
  fetch(unique);
  const segments = paths.map((path) => path.split("/"));
  let level = unique.map(rootTree);
  for (let depth = 0; depth < Math.max(...segments.map((path) => path.length)); depth += 1) {
    fetch(level);
    const names = [...new Set(segments.map((path) => path[depth]).filter(Boolean))].map((name) =>
      Buffer.from(name),
    );
    level = level.flatMap((oid) => {
      const value = object(oid);
      if (value?.type !== "tree") return [];
      return treeEntries(value.body, oidLength())
        .filter((entry) => names.some((name) => entry.name.equals(name)))
        .map((entry) => entry.oid);
    });
  }
  fetch(level);
  const blobs = new Set(unique.flatMap((commit) => documents(commit).map((item) => item.oid)));
  fetch([...blobs]);
  stats.uniqueMarkdownBlobs = blobs.size;
}

/** §A-MEMORY-01 resolves a path through the objects a commit itself names. */
function createTreeNavigator(cache) {
  const must = (key, what) => {
    const value = cache.object(key);
    if (!value) throw unreadable(`${what} ${key} cannot be read`);
    return value;
  };

  const readTree = (oid) => {
    const value = must(oid, "tree");
    if (value.type !== "tree") throw unreadable(`${oid} is not a tree`);
    return treeEntries(value.body, cache.oidLength());
  };

  const rootTree = (commit) => {
    const value = must(commit, "commit");
    if (value.type !== "commit") throw unreadable(`${commit} is not a commit`);
    const end = value.body.indexOf(0x0a);
    const first = end < 0 ? "" : decode(value.body.subarray(0, end), `commit ${commit}`);
    const oid = first.startsWith("tree ") ? first.slice(5) : "";
    if (!/^[0-9a-f]+$/u.test(oid)) throw unreadable(`commit ${commit} names no tree`);
    return oid;
  };

  // Absence has two shapes, and neither is corruption: a readable tree that does
  // not carry the name, and a segment that is readable but is not a directory at
  // all. A project may legitimately keep `docs` as a symlink or a file, and the
  // knowledge path simply is not there — descending into it is what would be
  // wrong. `readTree` therefore only ever sees an entry whose mode says tree.
  const locate = (commit, path) => {
    const names = path.split("/");
    let entry = null;
    let oid = rootTree(commit);
    for (const [index, name] of names.entries()) {
      const wanted = Buffer.from(name);
      entry = readTree(oid).find((item) => item.name.equals(wanted)) ?? null;
      if (!entry) return null;
      if (index < names.length - 1 && !entry.tree) return null;
      oid = entry.oid;
    }
    return entry;
  };

  return { must, readTree, rootTree, locate };
}

/**
 * §A-MEMORY-01 opens one caching reader over the historical knowledge documents.
 *
 * The reader owns a live view of the repository and must be closed, so callers
 * can prove no Git child outlives the run that started it.
 */
export function createHistoryReader(root, options = {}) {
  const paths = [options.architecture ?? ARCHITECTURE_ROOT, options.business ?? BUSINESS_DOCUMENT];
  const caches = {
    trees: new Map(),
    definitions: new Map(),
    snapshot: new Map(),
    paths: new Map(),
  };
  const stats = { spawns: 0, objectRequests: 0, markdownParses: 0, uniqueMarkdownBlobs: 0 };
  const cache = createObjectCache(root, stats);
  const { fetch, object } = cache;

  const { must, readTree, rootTree, locate } = createTreeNavigator(cache);

  // The prefix stays bytes for the same reason the names do. Only a path that
  // names a knowledge document is decoded, and that one has to be decodable:
  // a violation message has to be able to say which document it is about.
  const walk = (prefix, treeOid, found) => {
    const nested = [];
    for (const entry of readTree(treeOid)) {
      if (entry.tree) nested.push(entry);
      else if (entry.name.subarray(-MARKDOWN_SUFFIX.length).equals(MARKDOWN_SUFFIX)) {
        const path = Buffer.concat([prefix, SEPARATOR, entry.name]);
        found.push({ path: decode(path, "a knowledge document path"), oid: entry.oid });
      }
    }
    fetch(nested.map((entry) => entry.oid));
    for (const entry of nested) {
      walk(Buffer.concat([prefix, SEPARATOR, entry.name]), entry.oid, found);
    }
  };

  const documents = (commit) => {
    if (!caches.paths.has(commit)) {
      const found = [];
      const [architectureRoot, businessDocument] = paths;
      const architecture = locate(commit, architectureRoot);
      if (architecture?.tree) walk(Buffer.from(architectureRoot), architecture.oid, found);
      const business = locate(commit, businessDocument);
      if (business && !business.tree) found.push({ path: businessDocument, oid: business.oid });
      caches.paths.set(commit, found);
    }
    return caches.paths.get(commit);
  };

  // One `fromMarkdown` per blob, not one per path per commit per rule. Every
  // projection above reads that single AST, so the parse budget stays the
  // number of distinct documents the history actually contains.
  const tree = (oid) => {
    if (!caches.trees.has(oid)) {
      const blob = must(oid, "document");
      stats.markdownParses += 1;
      caches.trees.set(oid, parseDocument(decode(blob.body, `document ${oid}`)));
    }
    return caches.trees.get(oid);
  };

  return {
    root,
    git: cache.run,
    documents,
    tree,
    snapshots: caches.snapshot,
    prime: (commits) =>
      prime(commits, {
        fetch,
        object,
        oidLength: cache.oidLength,
        rootTree,
        documents,
        stats,
        paths,
      }),
    definitions: (oid, path) => {
      const key = `${oid} ${path}`;
      if (!caches.definitions.has(key))
        caches.definitions.set(key, definitionsFromTree(tree(oid), path));
      return caches.definitions.get(key);
    },
    trailers: (commit) => commitMessage(must(commit, "commit").body),
    stats: () => ({ ...stats, uniqueObjects: cache.size() }),
    close: () => {
      cache.close();
      for (const entry of Object.values(caches)) entry.clear();
    },
  };
}
