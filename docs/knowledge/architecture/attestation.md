# Architecture — what a gate actually attests

## §A-SNAPSHOT-ATTESTATION — Content identity is a digest, not a commit

Implements §B-WORKFLOW-01.

Every gate result is stored against `(commitOid, snapshotDigest, planDigest)`,
and completion requires four results that agree on the digest
(`src/core/snapshot.mts`, `src/core/fsm.mts`).

The commit OID is provenance — useful for finding the work again. It is a poor
identity: an amend or a rebase produces a different OID for byte-identical
content, and treating that as new content would force every gate to re-run for
nothing. Conversely, "the reviews passed on this branch" is not an identity at
all, and that is the shape of the failure this decision prevents.

The digest is a sha256 over sorted `mode + identity + path` lines covering every
tracked file, so any change to code, tests, config, knowledge or the E2E catalog
invalidates the attestations that described the old content — automatically,
without anyone remembering to.

## §A-DIGEST-STABILITY — Recording a verification must not invalidate it

Implements §B-WORKFLOW-01.

There is exactly one thing a run must write *after* everything has been
verified: the fact that it was verified — `e2e.json.scenarios[*].last_run`. If
that write changed the digest, no run could ever record its own result.

So `docs/architecture/e2e.json` enters the digest through a canonical-JSON
projection that excludes only `last_run`. Everything else about the
catalog — scenario ids, refs, business links, tags, `always_required` — stays
inside the digest, because those are claims about what is verified, and changing
them after a review silently changes what the review meant.

The metadata commit is then proved rather than trusted: `verifyMetadataCommit`
checks that no other path moved, that no catalog field changed, and that the
recorded results match the run that produced them.

## §A-CANDIDATE-ISOLATION — Every gate runs in a fresh detached worktree

Implements §B-WORKFLOW-01.

A gate that modifies the tree it is judging has judged something that no longer
exists. The classic instance is benign-looking: a `format` step inside a QC
target, which turns a failing check into a passing one and a clean attestation
into a false one.

Each gate therefore gets its own detached worktree at the candidate commit, and
`git status --porcelain --untracked-files=all` must be empty before and after
(`src/core/worktree.mts`). It also lets the two reviewers and the E2E tester run
concurrently without contending for one checkout.
