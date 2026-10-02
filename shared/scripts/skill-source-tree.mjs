/**
 * Name the exact build inputs of one generated skill by a Git tree id.
 *
 * A historical session has to be attributed to the skill version it actually
 * loaded, not to whatever is installed today. The generated `skills/` tree is
 * committed together with its sources, so its own commit SHA can never appear
 * inside it: writing the SHA would create the commit it names. The Git tree id
 * of the skill's inputs has no such self-reference, and a build check can
 * reproduce it from the checkout or from any commit. This module computes that
 * id byte for byte the way `git write-tree` would, without a Git index and
 * without any npm package, so the build and the session diagnostic agree.
 *
 * Implements §A-DISTRIBUTION-06.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

const OID = /^[0-9a-f]{40}$/u;
const FILE_MODES = new Set(["100644", "100755"]);
const TREE_MODE = "40000";

/**
 * One typed failure a caller can branch on without parsing prose.
 *
 * The build must stop, not guess, when an input is missing or ambiguous; the
 * `reason` is the stable part and the message only helps a human.
 */
function failure(reason, detail) {
  const error = new Error(`source_tree ${reason}: ${detail}`);
  error.reason = reason;
  return error;
}

function gitObjectId(type, body) {
  return createHash("sha1").update(`${type} ${body.length}\0`).update(body).digest("hex");
}

/**
 * §A-DISTRIBUTION-06 hashes bytes exactly as `git hash-object` does for a blob.
 *
 * @param {Buffer|Uint8Array|string} buffer file bytes; a string is taken as UTF-8
 * @returns {string} the 40-hex SHA-1 blob id
 */
export function gitBlobId(buffer) {
  return gitObjectId("blob", Buffer.from(buffer));
}

/**
 * A repository-relative POSIX path with nothing a tree cannot hold.
 *
 * Git trees never contain `.`, `..` or empty names, so accepting them here
 * would compute an id Git itself could never produce for any checkout.
 */
function pathSegments(path) {
  if (typeof path !== "string" || path === "" || path.includes("\0") || path.includes("\\")) {
    throw failure("invalid_path", JSON.stringify(path));
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw failure("invalid_path", JSON.stringify(path));
  }
  return segments;
}

function insertEntry(root, { path, mode, oid }) {
  if (!FILE_MODES.has(mode)) throw failure("invalid_mode", `${path} ${mode}`);
  if (typeof oid !== "string" || !OID.test(oid)) throw failure("invalid_oid", `${path} ${oid}`);
  const segments = pathSegments(path);
  let node = root;
  for (const name of segments.slice(0, -1)) {
    const child = node.get(name) ?? { tree: new Map() };
    if (!child.tree) throw failure("path_conflict", path);
    node.set(name, child);
    node = child.tree;
  }
  const leaf = segments.at(-1);
  if (node.has(leaf)) {
    throw failure(node.get(leaf).tree ? "path_conflict" : "duplicate_path", path);
  }
  node.set(leaf, { mode, oid });
}

/**
 * Git orders tree entries by name bytes, comparing a subtree as if its name
 * ended in `/`. That is why `a.b` < `a/` < `a0`: `.` is 0x2e, `/` is 0x2f and
 * `0` is 0x30. Sorting plain names would put the subtree first and produce a
 * tree id that no checkout has.
 */
function sortKey(name, entry) {
  return Buffer.from(entry.tree ? `${name}/` : name, "utf8");
}

function writeTree(tree) {
  const rows = [...tree.entries()]
    .map(([name, entry]) => ({ name, entry, key: sortKey(name, entry) }))
    .sort((left, right) => Buffer.compare(left.key, right.key));
  const parts = rows.map(({ name, entry }) => {
    const oid = entry.tree ? writeTree(entry.tree) : entry.oid;
    const mode = entry.tree ? TREE_MODE : entry.mode;
    return Buffer.concat([Buffer.from(`${mode} ${name}\0`, "utf8"), Buffer.from(oid, "hex")]);
  });
  return gitObjectId("tree", Buffer.concat(parts));
}

/**
 * §A-DISTRIBUTION-06 computes the nested tree id `git write-tree` would write.
 *
 * @param {{path: string, mode: "100644"|"100755", oid: string}[]} entries
 *   repository-relative POSIX file paths with their blob ids
 * @returns {string} the 40-hex id of the root tree holding exactly those files
 */
export function gitTreeId(entries) {
  const root = new Map();
  for (const entry of entries) insertEntry(root, entry ?? {});
  return writeTree(root);
}

/**
 * The file a path names inside `root`, read without following any symlink.
 *
 * Git records a symlink as mode 120000 with its target as content; reading
 * through it would hash bytes the commit does not hold. A symlinked parent
 * directory is refused for the same reason: the realpath must be the path.
 */
function checkoutEntry(rootReal, path) {
  pathSegments(path);
  const absolute = join(rootReal, ...path.split("/"));
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") throw failure("missing_path", path);
    throw failure("unreadable_path", `${path} ${error.code}`);
  }
  if (!stat.isFile() || realpathSync(absolute) !== absolute) {
    throw failure("not_regular_file", path);
  }
  const mode = (stat.mode & 0o111) !== 0 ? "100755" : "100644";
  return { path, mode, oid: gitBlobId(readFileSync(absolute)) };
}

/**
 * §A-DISTRIBUTION-06 derives the source tree id from files on disk.
 *
 * The id equals `sourceTreeOfCommit(root, "HEAD", paths)` on a clean checkout
 * without content filters, which is what lets a build check reproduce it.
 *
 * @param {string} root repository root
 * @param {string[]} paths repository-relative POSIX paths of regular files
 * @returns {string} the 40-hex tree id
 */
export function sourceTreeOfFiles(root, paths) {
  const rootReal = realpathSync(root);
  return gitTreeId(paths.map((path) => checkoutEntry(rootReal, path)));
}

function git(root, args) {
  return spawnSync("git", ["--literal-pathspecs", "-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** One `ls-tree -z` row: `<mode> SP <type> SP <oid> TAB <path>`. */
function parseListing(stdout) {
  const rows = new Map();
  for (const row of stdout.split("\0")) {
    if (row === "") continue;
    const match = /^(\d{6}) (\w+) ([0-9a-f]+)\t(.+)$/su.exec(row);
    if (!match) throw failure("git_unreadable", JSON.stringify(row));
    rows.set(match[4], { mode: match[1], type: match[2], oid: match[3] });
  }
  return rows;
}

function resolvedCommit(root, commit) {
  // A leading dash would turn the revision into an option of git itself.
  if (typeof commit !== "string" || commit === "" || commit.startsWith("-")) {
    throw failure("invalid_commit", JSON.stringify(commit));
  }
  const result = git(root, ["rev-parse", "--verify", "--quiet", `${commit}^{commit}`]);
  if (result.error) throw failure("git_unavailable", result.error.message);
  const sha = result.stdout.trim();
  if (result.status !== 0 || !OID.test(sha)) throw failure("invalid_commit", commit);
  return sha;
}

/**
 * §A-DISTRIBUTION-06 derives the source tree id from one commit's records.
 *
 * Modes and blob ids come from Git itself, so no checkout byte is read. Every
 * requested path must be a regular blob at that commit; a directory, symlink,
 * submodule or absent path fails typed instead of shrinking the input set.
 *
 * @param {string} root repository root
 * @param {string} commit any revision that resolves to a commit
 * @param {string[]} paths repository-relative POSIX paths of regular files
 * @returns {string} the 40-hex tree id
 */
export function sourceTreeOfCommit(root, commit, paths) {
  for (const path of paths) pathSegments(path);
  const sha = resolvedCommit(root, commit);
  if (paths.length === 0) return gitTreeId([]);
  const result = git(root, ["ls-tree", "-r", "-z", "--full-tree", sha, "--", ...paths]);
  if (result.error) throw failure("git_unavailable", result.error.message);
  if (result.status !== 0) throw failure("git_unreadable", result.stderr.trim());
  const rows = parseListing(result.stdout);
  return gitTreeId(
    paths.map((path) => {
      const row = rows.get(path);
      if (!row && [...rows.keys()].some((listed) => listed.startsWith(`${path}/`))) {
        throw failure("not_regular_file", `${path} at ${sha}`);
      }
      if (!row) throw failure("missing_path", `${path} at ${sha}`);
      if (row.type !== "blob" || !FILE_MODES.has(row.mode)) {
        throw failure("not_regular_file", `${path} at ${sha}`);
      }
      if (!OID.test(row.oid)) throw failure("unsupported_object_format", row.oid);
      return { path, mode: row.mode, oid: row.oid };
    }),
  );
}
