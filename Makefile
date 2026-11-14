# meta-o's own quality contract.
#
# The project eats the contract it prescribes: `make mo-qc` is the one
# authoritative gate, it rewrites nothing, and every gate under it is a mature
# tool or a plain shell comparison rather than a checker this project wrote.

.PHONY: mo-qc mo-lint mo-test mo-smoke mo-smoke-proxy mo-e2e mo-eval-cases mo-knowledge-history mo-live-adapters mo-backlog skills skills-check format contract

# >>> meta-o: agent-environment proxy >>>
# The same managed block mo-setup writes into a consumer's Makefile
# (src/skills/mo-setup/assets/make/agent-proxy.mk); a test keeps the code equal.
#
# The owner's proxy is for the agent environments' own provider API calls only.
# The commands agents run do not need it and break on it more often than
# without it, so every recipe here — QC stages, tests, smoke and a nested
# $(MAKE) — runs with the six variables removed from its environment.
MO_PROXY_VARS := HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
unexport $(MO_PROXY_VARS)

# Targets that start agent environments themselves. Target-specific variables
# are inherited by prerequisites, so these targets have no QC or test
# prerequisites.
MO_AGENT_ENV_TARGETS := mo-live-adapters

# Each listed target gets back only the variables that are set: a
# target-specific `export VAR := $(VAR)` of an unset one exports an empty
# string, and an empty lowercase variable makes Python and Node ignore a set
# uppercase one. `$(value VAR)` keeps the value out of every recipe line, so
# make never prints it, and does not expand a `$` or `#` inside it.
$(if $(strip $(MO_AGENT_ENV_TARGETS)),$(foreach var,$(MO_PROXY_VARS),$(if $(value $(var)),$(eval $(MO_AGENT_ENV_TARGETS): export $(var) := $$(value $(var))))))
# <<< meta-o: agent-environment proxy <<<

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
MO_QC_STAGES = mo-lint contract skills-check mo-eval-cases mo-vocabulary mo-knowledge-history mo-test mo-smoke

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
	node --check tools/skill-eval-corpus.mjs
	node --check tools/skill-build-plan.mjs
	node --check shared/scripts/mo-backlog.mjs
	node --check shared/scripts/mo-harness-screen.mjs
	node --check shared/scripts/mo-review-report.mjs
	node --check shared/scripts/mo-review-grammar.mjs
	node --check shared/scripts/mo-review-resource.mjs
	node --check shared/scripts/skill-source-tree.mjs
	node --check shared/scripts/mo-knowledge.mjs
	node --check shared/scripts/mo-knowledge-layer.mjs
	node --check shared/scripts/gitlab-ci-rules.mjs
	node --check shared/scripts/mo-ci-coverage.mjs
	for module in shared/scripts/mo-debug*.mjs; do node --check "$$module" || exit 1; done
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
# divergence means two providers silently working to different contracts. A copy,
# not an `@AGENTS.md` import: Claude does not expand that import from a nested cwd.
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

# An identifier nobody defined reads like a citation, so a reviewer reasons from
# a section that is not there. Errors block; a guess about somebody's coinage is
# a warning, because a checker that blocks on a guess gets switched off.
# `docs/references/` is an archive of source material, not active requirements.
# The knowledge plan the portable core checks: where ids are defined, which
# documents are declared, and every tracked Markdown file it deliberately skips.
# A feature's accepted specification is a declared document while it is
# tracked; closure deletes it, and the list then expands to nothing.
# Source skills link into references that exist only after the build, so the
# built tree is the declared one.
MO_KNOWLEDGE_PLAN = --business docs/business.md --architecture docs/architecture \
	--docs docs/business.md --docs docs/architecture --docs docs/acceptance.md \
	--docs docs/e2e.md --docs docs/glossary.md --docs docs/papercut.md \
	--docs docs/backlog.md --docs docs/backend-capabilities.md --docs README.md \
	--docs AGENTS.md --docs CLAUDE.md --docs shared/references --docs skills \
	--first-party-root docs --first-party-root shared --first-party-root skills \
	$(foreach path,$(shell git ls-files 'docs/specifications/*.md'),--docs $(path)) \
	$(foreach path,$(shell git ls-files 'docs/references/*.md' 'docs/research/*.md'),--knowledge-exclude $(path))

mo-vocabulary:
	node tools/mo-vocabulary.mjs --root . --exclude docs/references $(MO_KNOWLEDGE_PLAN)

mo-test:
	@command -v zsh >/dev/null 2>&1 || { echo "mo-test blocked: zsh is required for the cross-shell contract" >&2; exit 1; }
	@ordinary_tests=$$(find tests -maxdepth 1 -name '*.test.mjs' ! -name 'provider-posture.test.mjs' -print | sort); \
		node --test --test-concurrency=1 $$ordinary_tests
	node --test tests/provider-posture.test.mjs

# §A-BACKLOG-01 is a lifecycle closure gate, intentionally not a dependency of
# mid-feature mo-qc: valid temporary notebook entries must remain testable.
mo-backlog:
	@node shared/scripts/mo-backlog.mjs

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
		for bundle in $$(git ls-files 'skills/*/scripts/mo-backlog.mjs' \
				'skills/*/scripts/mo-knowledge-history.mjs' 'skills/*/scripts/mo-debug.mjs' \
				'skills/*/scripts/mo-ci-coverage.mjs'); do \
			cp $$bundle $$smoke_dir/bundled-helper.mjs; \
			(cd $$smoke_dir && HOME=$$smoke_dir node ./bundled-helper.mjs --help > /dev/null); \
		done
	@set -e; smoke_dir=$$(mktemp -d); trap 'rm -rf "$$smoke_dir"' 0 HUP INT TERM; \
		$(MAKE) --no-print-directory mo-smoke-proxy MO_SMOKE_DIR=$$smoke_dir
	@echo "mo-smoke ok"

# A throwaway project that applied the shipped managed proxy block: its QC and
# a nested make lose the proxy, its agent target keeps the exact value and gets
# no empty lowercase twin, the agent target has no prerequisites, and neither
# make nor the posture probe prints the value. The credential-shaped value is a
# placeholder and never leaves the comparison.
MO_SMOKE_PROXY = http://smoke-user:smoke-secret@proxy.invalid:3128
mo-smoke-proxy:
	@set -e; project=$(MO_SMOKE_DIR)/proxy-project; mkdir "$$project"; \
		sed 's/<agent-env-targets>/agent/' skills/mo-setup/assets/make/agent-proxy.mk > "$$project/Makefile"; \
		cat tests/fixtures/agent-proxy/targets.mk >> "$$project/Makefile"; \
		output=$$(HTTPS_PROXY='$(MO_SMOKE_PROXY)' MO_SMOKE_EXPECTED_PROXY='$(MO_SMOKE_PROXY)' \
			$(MAKE) --no-print-directory -C "$$project" qc agent 2>&1); \
		expected=$$(printf '%s\n' 'qc=[]' 'nested=[]' 'agent=[kept]' 'agent-lowercase=[]'); \
		[ "$$output" = "$$expected" ] || { echo "mo-smoke: the proxy block leaked or lost the proxy" >&2; exit 1; }; \
		rule=$$(HTTPS_PROXY='$(MO_SMOKE_PROXY)' $(MAKE) --no-print-directory -C "$$project" -pq agent 2>/dev/null \
			| grep '^agent:' | grep -v '=' || true); \
		[ "$$rule" = "agent:" ] || { echo "mo-smoke: the agent target has prerequisites" >&2; exit 1; }; \
		posture=$$(HTTPS_PROXY='$(MO_SMOKE_PROXY)' HOME=$(MO_SMOKE_DIR) \
			shared/scripts/mo-posture.sh --shell bash -- claude 2>&1 || true); \
		case "$$posture" in *smoke-secret*) echo "mo-smoke: posture printed a proxy value" >&2; exit 1;; esac; \
		printf '%s\n' "$$posture" | grep -qx 'MO_POSTURE_PROXY names=HTTPS_PROXY' \
			|| { echo "mo-smoke: posture did not name the proxy" >&2; exit 1; }

# Agent-required E2E pretends nothing. It says what a human or an agent must run,
# and exits 2 so no caller can mistake it for a pass. mo-qc does not depend on it.
mo-e2e:
	@echo "AGENT_REQUIRED: not executed"
	@echo
	@echo "Docs:      docs/e2e.md, docs/backend-capabilities.md"
	@echo "Scenarios: B1-B70 — Orca backend, lifecycle, setup and Qwen profile"
	@echo "           W1-W4 — watchdog target, scan, nudge, suppression"
	@echo "           LIVE-1 — proof order: task E2E converges before the first review pair"
	@echo "           47 embedded cases — positive/forbidden/degraded for 12 skills plus 11 regressions"
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
