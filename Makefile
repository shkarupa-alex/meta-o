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
	node --check skills/mo-herdr/scripts/mo-models.mjs
	node --check tools/build-skills.mjs
	bash -n shared/scripts/mo-posture.sh
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

# Does the shipped settings helper boot and answer? Under a throwaway HOME, because
# this gate judges the repository: a settings file the developer happens to have
# — or a corrupt one — must not decide whether an unmodified checkout is green.
mo-smoke:
	@home=$$(mktemp -d) && \
		HOME=$$home node shared/scripts/mo-models.mjs --help > /dev/null && \
		HOME=$$home node shared/scripts/mo-models.mjs --show > /dev/null && \
		cp skills/mo-herdr/scripts/mo-models.mjs $$home/mo-models.mjs && \
		(cd $$home && HOME=$$home node ./mo-models.mjs --help > /dev/null) && \
		(cd $$home && HOME=$$home node ./mo-models.mjs --show > /dev/null) && \
		rm -rf $$home
	@echo "mo-smoke ok"

# Agent-required E2E pretends nothing. It says what a human or an agent must run,
# and exits 2 so no caller can mistake it for a pass. mo-qc does not depend on it.
mo-e2e:
	@echo "AGENT_REQUIRED: not executed"
	@echo
	@echo "Docs:      docs/e2e.md, docs/phase-0-fixtures.md"
	@echo "Fixtures:  I3/I5 — remote installation"
	@echo "           P1-P8 — preimplementation external capability probes"
	@echo "           H7b — host-window resize"
	@echo "           H13-H37 — post-cutover Herdr acceptance"
	@echo "           OM1-OM8 — Omnigent final fixtures"
	@echo "Run:       work through docs/phase-0-fixtures.md and record evidence per row"
	@echo "Cleanup:   stop every provider session you started, including on failure"
	@exit 2
