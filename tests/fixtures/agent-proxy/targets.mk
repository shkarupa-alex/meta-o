
# Targets of a throwaway project that applied the managed proxy block: a QC
# target, a nested make from it, and an agent-environment target. Each prints
# whether a proxy reached it and never the value itself.
qc:
	@printf 'qc=[%s]\n' "$${HTTPS_PROXY+set}"
	@$(MAKE) --no-print-directory nested

nested:
	@printf 'nested=[%s]\n' "$${HTTPS_PROXY+set}"

agent:
	@if [ "$${HTTPS_PROXY-}" = "$$MO_SMOKE_EXPECTED_PROXY" ]; then echo 'agent=[kept]'; else echo 'agent=[lost]'; fi
	@printf 'agent-lowercase=[%s]\n' "$${https_proxy+set}"
