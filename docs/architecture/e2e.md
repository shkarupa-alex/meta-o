# End-to-end contract

meta-o's own E2E scenarios. Each anchor below is referenced from
`docs/architecture/e2e.json` and is what a tester executes.

## Environment

Everything runs locally. Requirements:

- Node ≥ 22 and Git on `PATH`;
- Python 3.11+ (only for the `templates/python` scenario);
- no network, no backend server, no credentials.

Scenarios that need a session backend use the scripted stand-in at
`tests/fixtures/fake-herdr.mjs`, driven through `META_O_HERDR_BIN`. That is
deliberate: the real Herdr requires a terminal multiplexer and a human-visible
pane, which cannot be provisioned unattended, and a scenario that can only run
when someone is watching is a scenario that stops running.

## Fixtures

Every scenario builds its own throwaway repository and its own state tree:

- the repository comes from `createTempRepo()` in `tests/helpers.mts`;
- the state tree comes from `createTempHome()`, which points `META_O_HOME` at a
  fresh directory so no test can touch a developer's real `~/.meta-o`.

## Execution

```bash
make e2e               # build, then every scenario including the Python fixtures
node quality/run-tests.mjs                      # the same thing without the build
node --test tests/cli-lifecycle.test.mts        # one scenario file
python3 templates/python/tests/test_quality_gates.py   # E2E-QC-TEMPLATES-01 alone
```

`npm test` runs the TypeScript scenarios only. It is not the E2E entry point:
E2E-QC-TEMPLATES-01 lives in the Python starter profile, and `make e2e` is what
runs all of them.

## Cleanup and isolation

Each scenario disposes of its repository, its state tree and its fake-backend
directory in a `finally` block, so a failing scenario still cleans up. Temporary
directories are created with `mkdtemp`, giving every scenario a namespace unique
to its process. Nothing is shared between scenarios and nothing survives them.

## Production

There is no production environment for this project, and no scenario may create
one. `meta-o` writes only to `$META_O_HOME` and to temporary directories.

## Failure interpretation

A failing scenario is a fact about the candidate. Before calling one flaky, say
which shared resource or timing assumption caused it — the suite has no sleeps
and no network, so "it passed on the retry" almost always means a real ordering
bug.

## e2e-cli-lifecycle-01

Drive one run from `run start` to `COMPLETE` through the CLI: preflight, model
confirmation, candidate, sealed selection plan, all four gates, metadata phase,
cleanup. Prove that a completion attempt before the four attestations agree is
refused, and that project settings survive the cleanup.

Covered by `tests/cli-lifecycle.test.mts`.

## e2e-session-protocol-01

Drive the write-ahead backend protocol against the scripted backend: spawn,
deliver, stall, reconcile, stop. Prove that a crashed effect leaves its intent
recorded, that reconciliation reaches `applied` or `not_applied` from evidence,
and that an unprovable effect pauses the run instead of resending.

Covered by `tests/session-protocol.test.mts`.

## e2e-attestation-integrity-01

Prove the content-identity rules end to end: a rebase preserving the tree
preserves the digest, any tracked change invalidates the attestations that
described the old content, and a metadata commit touching anything beyond
`scenarios[*].last_run` is rejected.

Covered by `tests/snapshot.test.mts` and `tests/fsm-and-findings.test.mts`.

## e2e-qc-templates-01

Run the Python starter profile's own acceptance fixtures against generated
projects: a missing tool fails rather than skips, a mutating gate is invalid, a
new import cycle is blocked, and the code-health ratchet only turns one way.

Covered by `templates/python/tests/test_quality_gates.py`.

## e2e-install-01

Install into a temporary prefix with `install.sh`, then run the installed
`meta-o` binary. Prove the target machine needs no `npm install`, that only
dependency-free `.mjs` was copied, and that no project file was touched.

Covered by `tests/install.test.mts`.
