/**
 * §M-CLI-REPO-JSON — Read a contract document out of the project under test.
 *
 * Implements §A-AUTHORITATIVE-QC. Shared rather than duplicated because the
 * failure messages are part of the contract: a project whose manifest is absent
 * and one whose manifest is malformed are different problems with different
 * fixes, and every command that reads one owes the user the same distinction.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fail } from "./args.mjs";

/** §M-CLI-REPO-JSON — Read a repository JSON file or fail with its path. */
export function readRepoJson<T>(repoDir: string, relative: string): T {
  const path = join(repoDir, relative);
  if (!existsSync(path)) fail("missing_file", `${relative} is absent`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    fail("invalid_json", `${relative} is not valid JSON: ${(error as Error).message}`);
  }
}
