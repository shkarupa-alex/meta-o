# §M-MAKEFILE — meta-o's own quality contract.
#
# The project eats the contract it defines: `make qc` is the only authoritative
# gate, it is non-mutating, and it aggregates every gate declared in
# .quality/qc-manifest.json rather than a list maintained here in parallel.

.PHONY: build format lint typecheck test smoke e2e qc verify-e2e-metadata install clean
.PHONY: format-check

build:
	npx --no-install tsc -p tsconfig.json

# `format` rewrites, `format-check` judges. §40 asks for both, and only the
# judging half may run inside `qc`.
format:
	npx --no-install prettier --write "src/**/*.mts" "tests/**/*.mts" "quality/*.mjs"

format-check:
	node quality/format-check.mjs

lint:
	node quality/lint.mjs

typecheck:
	npx --no-install tsc -p tsconfig.tests.json

test: build
	node quality/run-tests.mjs

# The cheap "does it boot" check: the CLI must load and answer.
smoke: build
	node dist/cli/meta-o.mjs help > /dev/null && echo "smoke ok"

# meta-o's E2E entry point is its own acceptance suite, which drives the real
# CLI against real repositories. See docs/architecture/e2e.md.
e2e: build
	node quality/run-tests.mjs

# Proves the completion metadata commit stayed inside its permitted field.
# Rewrites nothing; run it on the metadata commit itself.
verify-e2e-metadata:
	node quality/verify-e2e-metadata.mjs

# The authoritative gate. Writes its machine-readable result to
# $META_O_QC_RESULT when the orchestrator set it.
qc:
	node quality/run-qc.mjs

install:
	./install.sh

clean:
	rm -rf dist
