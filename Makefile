# meta-o's own quality contract.
#
# The project eats the contract it prescribes: `make mo-qc` is the one
# authoritative gate, it rewrites nothing, and every gate under it is a mature
# tool or a plain shell comparison rather than a checker this project wrote.

.PHONY: mo-qc mo-lint mo-test mo-smoke mo-e2e mo-eval-cases mo-knowledge-history mo-live-adapters mo-backlog skills skills-check format contract

# The authoritative gate, in the order it has always run.
#
# It became a recipe so it can say how long each stage took. Nobody could tell
# which stage was slow without running them by hand, and guessing produced the
# wrong answer. The number is a diagnostic and never a threshold: a limit in
# seconds passes on one machine and fails on another, which makes the gate
# report the hardware rather than the repository.
#
# `date +%N` is not portable to macOS, so the clock is Node, which this project
# already requires. Nothing is written to disk: a timing file would be a
# baseline with no external consumer.
MO_QC_STAGES = mo-lint contract skills-check mo-eval-cases mo-knowledge-history mo-test mo-smoke

# The authoritative aggregate was always sequential; saying so keeps a `-j` on
# the command line from interleaving stages and scrambling both the timings and
# the first-failure exit code.
.NOTPARALLEL: mo-qc

mo-qc:
	@set -e; for stage in $(MO_QC_STAGES); do \
		start=$$(node -e 'process.stdout.write(String(Date.now()))'); \
		status=0; $(MAKE) --no-print-directory $$stage || status=$$?; \
		end=$$(node -e 'process.stdout.write(String(Date.now()))'); \
		echo "MO-QC-TIMING/1 stage=$$stage ms=$$((end - start)) status=$$status"; \
		if [ "$$status" -ne 0 ]; then exit "$$status"; fi; \
	done
	@echo "mo-qc ok"

# markdownlint and prettier judge; `make format` is the half that rewrites.
mo-lint:
	npx --no-install markdownlint-cli2
	npx --no-install prettier --check .
	npx --no-install eslint .
	node --check shared/scripts/mo-models.mjs
	node --check skills/mo-orchestrate-orca/scripts/mo-models.mjs
	node --check skills/mo-review-orca/scripts/mo-models.mjs
	node --check tools/build-skills.mjs
	node --check tools/adapter-contract.mjs
	node --check shared/scripts/knowledge-documents.mjs
	node --check shared/scripts/knowledge-history-reader.mjs
	node --check shared/scripts/mo-knowledge-history.mjs
	node --check tools/live-adapters.mjs
	node --check tools/skill-evals.mjs
	node --check tools/skill-eval-runtime.mjs
	node --check tools/skill-eval-legacy.mjs
	node --check tools/backlog-empty.mjs
	node tools/adapter-contract.mjs --validate
	bash -n shared/scripts/mo-posture.sh
	bash -n shared/scripts/mo-watchdog.sh
	@set -e; for shell_name in bash zsh; do \
		if command -v $$shell_name >/dev/null 2>&1; then \
			shared/scripts/mo-posture.sh --self-check --shell $$shell_name; \
		else echo "mo-posture self-check blocked: $$shell_name is not installed" >&2; exit 1; fi; \
	done

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

# The boundaries come from the decision that explains them, never from a flag:
# a run whose exemption nobody reviewed would prove nothing.
mo-knowledge-history:
	node shared/scripts/mo-knowledge-history.mjs --repo . \
		--pins-from docs/architecture/knowledge-identifiers.md --audit-exemptions

mo-test:
	@command -v zsh >/dev/null 2>&1 || { echo "mo-test blocked: zsh is required for the cross-shell contract" >&2; exit 1; }
	@ordinary_tests=$$(find tests -maxdepth 1 -name '*.test.mjs' ! -name 'provider-posture.test.mjs' -print | sort); \
		node --test --test-concurrency=1 $$ordinary_tests
	node --test tests/provider-posture.test.mjs

# §A-BACKLOG-01 is a lifecycle closure gate, intentionally not a dependency of
# mid-feature mo-qc: valid temporary notebook entries must remain testable.
mo-backlog:
	@node tools/backlog-empty.mjs

# Do the source helper and shipped Orca copy boot and answer? Under a throwaway HOME, because
# this gate judges the repository: a settings file the developer happens to have
# — or a corrupt one — must not decide whether an unmodified checkout is green.
mo-smoke:
	@set -e; smoke_dir=$$(mktemp -d); trap 'rm -rf "$$smoke_dir"' 0 HUP INT TERM; \
		HOME=$$smoke_dir node shared/scripts/mo-models.mjs --help > /dev/null; \
		HOME=$$smoke_dir node shared/scripts/mo-models.mjs --show > /dev/null; \
		(cd $$smoke_dir && HOME=$$smoke_dir \
			node $(CURDIR)/shared/scripts/mo-knowledge-history.mjs --help > /dev/null); \
		for backend in mo-orchestrate-orca mo-review-orca; do \
			cp skills/$$backend/scripts/mo-models.mjs $$smoke_dir/$$backend.mjs; \
			(cd $$smoke_dir && HOME=$$smoke_dir node ./$$backend.mjs --help > /dev/null); \
			(cd $$smoke_dir && HOME=$$smoke_dir node ./$$backend.mjs --show > /dev/null); \
		done; \
		for bundle in $$(git ls-files 'skills/*/scripts/mo-knowledge-history.mjs'); do \
			cp $$bundle $$smoke_dir/bundle-history.mjs; \
			(cd $$smoke_dir && HOME=$$smoke_dir node ./bundle-history.mjs --help > /dev/null); \
		done
	@echo "mo-smoke ok"

# Agent-required E2E pretends nothing. It says what a human or an agent must run,
# and exits 2 so no caller can mistake it for a pass. mo-qc does not depend on it.
mo-e2e:
	@echo "AGENT_REQUIRED: not executed"
	@echo
	@echo "Docs:      docs/e2e.md, docs/backend-capabilities.md"
	@echo "Scenarios: B1-B42 — Orca backend, lifecycle and Qwen profile"
	@echo "           W1-W4 — watchdog target, scan, nudge, suppression"
	@echo "           24 embedded cases — positive/forbidden/degraded for 8 skills"
	@echo "           local and authorized remote installation"
	@echo "Run:       execute the applicable scenarios without changing the frozen candidate"
	@echo "Evidence:  keep exact SHA and per-scenario actor/provider facts in the current run/final result"
	@echo "Ledger:    scenario definitions and support posture only; do not edit tracked docs for run evidence"
	@echo "Cleanup:   stop every provider session you started, including on failure"
	@exit 2

# Offline corpus/schema check. Live actors consume prompts and return untracked
# JSON evidence through the explicit commands in docs/e2e.md.
mo-eval-cases:
	node tools/skill-evals.mjs --check

# Network-enabled maintainer evidence. Missing local tools are reported; a
# present-but-unsupported probe or a failed production endpoint blocks.
mo-live-adapters:
	node tools/live-adapters.mjs
