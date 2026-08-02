# Python QC starter profile

These files are **templates**, not a bundled tool. Copy them into a project,
commit them, and change them: from that moment they are the project's, and the
project is the only authority on what "quality passed" means here.

That is deliberate. A QC implementation shipped inside the methodology would
make every project's gate identical and unowned — and an unowned gate is one
nobody fixes when it is wrong. `meta-o` therefore validates the *contract*
(`make qc`, the manifest, the machine-readable result) and never the
implementation.

## What to copy

```text
Makefile                        → project root (merge with an existing Makefile)
.quality/qc-manifest.json       → project root
quality/*.py                    → project root
pyproject.snippet.toml          → merge into the project's pyproject.toml
```

Then:

```bash
make qc
meta-o preflight
```

## The checkers

| File | Gate | What it proves |
|---|---|---|
| `quality/run_qc.py` | — | Runs every declared gate, refuses to skip silently, writes the result |
| `quality/purpose_check.py` | `purpose` | Every module, class and function says why it exists and cites its `§M-*` |
| `quality/knowledge_check.py` | `knowledge` | `§B → §A → §M` anchors are unique, resolvable and cite their nearest level |
| `quality/e2e_check.py` | `e2e-metadata` | The E2E catalog is well formed and its business links exist |
| `quality/import_graph.py` | `import-graph` | No new import cycle, no forbidden edge, no unknown first-party boundary, adopted roots dependency-closed |
| `quality/code_health.py` | `code-health` | File/class/function size, nesting and complexity, with a ratchet for legacy code |

All of them are standard-library only: `ast`, `tomllib`, `json`, `pathlib`. They
run on Python 3.11+.

`import_graph.py` covers what Import Linter covers — layers, independence,
forbidden edges, cycles, and a fan-in/fan-out ratchet — without being it. The
methodology names Import Linter; this profile implements its contracts in the
standard library instead, so a fresh project runs every gate offline with no
dependency it did not choose. A project that would rather have the real thing
declares it in `.quality/qc-manifest.json` and deletes this checker.

## The checkers are not judged by default

`source_roots = ["src", "tests"]` — so `quality/` itself is outside every gate,
including its own. The checkers you copy declare `§M-QC-COMMON`,
`§M-QC-KNOWLEDGE` and five more, and nothing asks those anchors to cite a `§A`
in *your* knowledge layer, because nothing reads them.

That is the one place this profile and `meta-o knowledge validate` give
different answers about the same tree. meta-o runs its own gate with
`--roots src,quality,tests`, because for meta-o the checkers *are* the product;
run it that way over a copied profile and you get seven errors of the form
`quality/_common.py: module anchor §M-QC-COMMON does not cite any §A-*`. Neither
answer is wrong — they are answers to different questions — but you should pick
one deliberately:

- **Leave it.** The checkers are third-party code you adopted, like any
  dependency, and your knowledge layer is about your product.
- **Adopt them.** Add `"quality"` to `source_roots` and give each checker's
  `§M-QC-*` a `§A` in your architecture layer to cite. Then the profile holds
  its own checkers to the standard they impose on everything else, which is the
  stronger position if you intend to modify them.

Whichever you choose, do not run meta-o's gate with `--roots` covering
`quality/` while the profile's own `source_roots` exclude it: the two will
disagree on every run, and a gate that contradicts another gate teaches people
to ignore both.

## Thresholds

`pyproject.snippet.toml` carries starter values. They are starter values, not
universal truths — a numeric-heavy codebase may justify longer functions, a
library may justify smaller files. **Accept them explicitly or change them
explicitly**; either way the decision is recorded in the repository.

Weakening a threshold, adding a baseline entry or relaxing a gate's policy is
compared against the run's base revision and requires the user's decision, not
the executor's.

## The brownfield ratchet

Existing violations can be frozen into `.quality/code-health-baseline.json` and
`.quality/import-graph-baseline.json` so that adoption does not become a
rewrite. The ratchet then allows only improvement:

- no new baseline entry;
- no existing value made worse;
- no new cycle;
- no baseline at all for missing purposes — those are cheap to fix and expensive
  to lose;
- adopted roots dependency-closed: a module inside `.quality/adoption-manifest.json`
  may not import one outside it, because certified code is only as trustworthy
  as what it calls. Widening the boundary is its own reviewed change.

Regenerate a baseline deliberately, never as a reflex:

```bash
python quality/code_health.py --write-baseline
python quality/import_graph.py --write-baseline
```
