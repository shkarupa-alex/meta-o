# meta-o's own quality contract.
#
# The project eats the contract it prescribes: `make mo-qc` is the one
# authoritative gate, it rewrites nothing, and every gate under it is a mature
# tool or a plain shell comparison rather than a checker this project wrote.

.PHONY: mo-qc mo-lint mo-test mo-smoke mo-e2e skills skills-check format contract

# The authoritative gate.
mo-qc: mo-lint contract skills-check mo-test mo-smoke
	@echo "mo-qc ok"

# markdownlint and prettier judge; `make format` is the half that rewrites.
mo-lint:
	npx --no-install markdownlint-cli2
	npx --no-install prettier --check .
	node --check shared/scripts/mo-models.mjs
	node --check skills/mo-orchestrate-herdr/scripts/mo-models.mjs
	node --check skills/mo-orchestrate-orca/scripts/mo-models.mjs
	node --check skills/mo-orchestrate-paseo/scripts/mo-models.mjs
	node --check tools/build-skills.mjs
	bash -n shared/scripts/mo-posture.sh
	bash -n shared/scripts/mo-watchdog.sh
	shared/scripts/mo-posture.sh --self-check --shell all

format:
	npx --no-install prettier --write .

# AGENTS.md and CLAUDE.md must not drift: each provider reads its own file, so a
# divergence means two providers silently working to different contracts.
contract:
	@cmp AGENTS.md CLAUDE.md && echo "project instructions identical"

# skills/ is committed because the package managers install what the repository
# has committed, so it has to be provably a build of src/skills/ + shared/ and
# not hand-edited.
skills-check:
	node tools/build-skills.mjs --check

skills:
	node tools/build-skills.mjs

mo-test:
	node --test "tests/*.test.mjs"

# Do the source helper and both shipped backend copies boot and answer? Under a throwaway HOME, because
# this gate judges the repository: a settings file the developer happens to have
# — or a corrupt one — must not decide whether an unmodified checkout is green.
mo-smoke:
	@set -e; smoke_dir=$$(mktemp -d); trap 'rm -rf "$$smoke_dir"' 0 HUP INT TERM; \
		HOME=$$smoke_dir node shared/scripts/mo-models.mjs --help > /dev/null; \
		HOME=$$smoke_dir node shared/scripts/mo-models.mjs --show > /dev/null; \
		for backend in mo-orchestrate-herdr mo-orchestrate-orca mo-orchestrate-paseo; do \
			cp skills/$$backend/scripts/mo-models.mjs $$smoke_dir/$$backend.mjs; \
			(cd $$smoke_dir && HOME=$$smoke_dir node ./$$backend.mjs --help > /dev/null); \
			(cd $$smoke_dir && HOME=$$smoke_dir node ./$$backend.mjs --show > /dev/null); \
		done
	@echo "mo-smoke ok"

# Agent-required E2E pretends nothing. It says what a human or an agent must run,
# and exits 2 so no caller can mistake it for a pass. mo-qc does not depend on it.
mo-e2e:
	@echo "AGENT_REQUIRED: not executed"
	@echo
	@echo "Docs:      docs/e2e.md, docs/backend-capabilities.md"
	@echo "Scenarios: B1-B14 — each Herdr, Orca, and Paseo backend"
	@echo "           W1-W4 — watchdog target, scan, nudge, suppression"
	@echo "           local and authorized remote installation"
	@echo "Run:       execute the applicable scenarios without changing the frozen candidate"
	@echo "Evidence:  keep exact SHA and per-scenario actor/provider facts in the current run/final result"
	@echo "Ledger:    scenario definitions and support posture only; do not edit tracked docs for run evidence"
	@echo "Cleanup:   stop every provider session you started, including on failure"
	@exit 2
