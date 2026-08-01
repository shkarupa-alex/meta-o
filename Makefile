# §M-MAKEFILE — meta-o's own quality contract.
#
# The project eats the contract it defines: `make qc` is the only authoritative
# gate, it is non-mutating, and it aggregates every gate declared in
# .quality/qc-manifest.json rather than a list maintained here in parallel.

.PHONY: build format-check lint typecheck test qc verify-e2e-metadata install clean

build:
	npx --no-install tsc -p tsconfig.json

format-check:
	node quality/format-check.mjs

lint:
	node quality/lint.mjs

typecheck:
	npx --no-install tsc -p tsconfig.tests.json

test: build
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
