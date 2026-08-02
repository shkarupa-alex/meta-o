/**
 * §M-CLI-CANDIDATE-GUARDS — The three refusals that stand between a revision and
 * becoming the candidate.
 *
 * They live together because they share a moment rather than a subject: this is
 * the last point before four gates begin attesting content, so anything that
 * must be true of the content *as attested* has to be true here. Afterwards the
 * attestations exist and the question is no longer "may this be the candidate"
 * but "does this attestation still describe it".
 *
 * Implements §A-CANDIDATE-ISOLATION and §A-IMMUTABLE-SPEC.
 */

import { changedPaths, git, publishedRunCommits } from "../../core/git.mjs";
import { outsideClosure, readAdoptionManifest } from "../../core/adoption.mjs";
import { fail } from "../args.mjs";
import type { RunState } from "../../core/types.mjs";

/**
 * §M-CLI-CANDIDATE-GUARDS — Apply every candidate admission guard, in order.
 *
 * Ordered cheapest-refusal-first only incidentally; each is independent, and a
 * caller must run all three because each covers a different way an attestation
 * could end up describing content nobody agreed to.
 */
export function assertCandidateAdmissible(
  repoDir: string,
  state: RunState,
  candidateCommit: string,
): void {
  assertInsideClosure(repoDir, state, candidateCommit);
  assertUnpublished(repoDir, state, candidateCommit);
  assertSpecRetired(repoDir, state, candidateCommit);
}

/**
 * §M-CLI-CANDIDATE-GUARDS — Refuse a candidate that edits source outside the adopted closure.
 *
 * Checked here, at the moment content becomes a candidate, because this is the
 * last point before four gates start attesting it. A feature that quietly
 * reached into uncertified code would otherwise arrive at COMPLETE carrying
 * attestations for files nobody has ever given a purpose, an owner or a test —
 * and the adoption boundary would have been widened by no one's decision.
 */
export function assertInsideClosure(repoDir: string, state: RunState, candidateCommit: string): void {
  const manifest = readAdoptionManifest(repoDir);
  if (!manifest) return;
  const touched = changedPaths(state.baseRevision, candidateCommit, repoDir);
  const outside = outsideClosure(touched, manifest);
  if (outside.length === 0) return;
  fail(
    "outside_adopted_closure",
    `the candidate changes source outside the adopted closure: ${outside.join(", ")}`,
    {
      adoptedRoots: manifest.adopted_roots,
      remedy:
        "widen the boundary with a separate reviewed adoption change, or keep this feature " +
        "inside the certified roots",
    },
  );
}

/**
 * §M-CLI-CANDIDATE-GUARDS — Refuse a candidate whose work has already been published.
 *
 * §00 forbids push, remote branch, PR and tag without the user asking, and the
 * rule lived only in the skills — so a run could push its candidate, tag it,
 * and still reach COMPLETE with four green gates and no remark anywhere. A tag
 * or remote ref naming a commit this run authored is the observable half of
 * that; a PR cannot be seen from inside a repository, and stays a rule the
 * orchestrator is told rather than one this can claim to enforce.
 */
export function assertUnpublished(repoDir: string, state: RunState, candidateCommit: string): void {
  const published = publishedRunCommits(state.baseRevision, candidateCommit, repoDir);
  if (published.length === 0) return;
  fail(
    "published_without_request",
    `this run's commits are already named by ${published.join(", ")}; pushing, tagging or ` +
      "opening a PR is the user's call, not the run's",
    {
      refs: published,
      remedy:
        "delete the ref if the run created it, or — if the user asked for it — say so and " +
        "start the candidate from a base that already includes it",
    },
  );
}

/**
 * §M-CLI-CANDIDATE-GUARDS — Every path in the candidate that still carries the spec's bytes.
 *
 * Matched by blob identity as well as by the original locator, because renaming
 * the file is not retiring it. `git mv docs/feature.md docs/archived-feature.md`
 * left a path check satisfied and the second source of truth exactly where
 * retirement exists to remove it from.
 */
function specCarriers(
  repoDir: string,
  state: RunState,
  candidateCommit: string,
  locator: string,
): string[] {
  const found = new Set<string>();
  const atLocator = git(["ls-tree", "--name-only", candidateCommit, "--", locator], repoDir).trim();
  if (atLocator !== "") found.add(locator);

  let blobOid: string;
  try {
    blobOid = git(["hash-object", "--", state.specBlob], repoDir).trim();
  } catch {
    return [...found];
  }
  const listing = git(["ls-tree", "-r", "-z", "--format=%(objectname) %(path)", candidateCommit], repoDir);
  for (const entry of listing.split("\0")) {
    const separator = entry.indexOf(" ");
    if (separator < 0) continue;
    if (entry.slice(0, separator) === blobOid) found.add(entry.slice(separator + 1));
  }
  return [...found].sort();
}

/**
 * §M-CLI-CANDIDATE-GUARDS — Refuse a candidate that still carries the tracked feature spec.
 *
 * Retirement happens inside the candidate window, not after it. A spec deleted
 * once the reviews are in would be a semantic change to attested content; a spec
 * left in the tree becomes a second, stale source of truth that outlives the
 * feature and quietly contradicts the knowledge layer. The immutable blob keeps
 * the acceptance oracle available to every role regardless.
 */
function assertSpecRetired(repoDir: string, state: RunState, candidateCommit: string): void {
  if (state.spec.kind !== "tracked" || state.spec.disposition !== "delete_after_sync") return;
  const locator = state.spec.locator;
  const carriers = specCarriers(repoDir, state, candidateCommit, locator);
  if (carriers.length === 0) return;
  fail("spec_not_retired", `the candidate still tracks the feature spec: ${carriers.join(", ")}`, {
    remedy:
      "distribute the spec's durable requirements into §B/§A/§M, delete the tracked spec in " +
      "this same candidate window, and set the candidate again; the pinned blob remains " +
      "available as the acceptance oracle",
    specBlob: state.specBlob,
  });
}
