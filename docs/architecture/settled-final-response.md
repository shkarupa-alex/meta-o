# Settled final responses stay on public backend surfaces

## Decision

Meta-O retrieves the entire settled assistant response through the selected
backend's documented public native surface. Herdr uses its public agent result,
Orca uses the complete `worker_done` orchestration message, and Paseo requires a
complete settled assistant message from public `wait` output. Backend mechanics records the
exact installed commands.

A whole-session view remains available for occasional diagnosis, but a terminal
tail or bounded preview does not prove a complete final response. Long-response
acceptance requires recognizable beginning, middle and end content over roughly
three to four screens.

## Business reason

Reviews are sound only when every reviewer byte reaches the executor. Private
provider transcripts, hooks and inferred session databases are unstable
implementation details and can silently select the wrong session or turn. Asking
an agent to repeat its answer tests obedience rather than retrieval.

## Delivery consequence

Two independent review responses are stored unchanged in restrictive temporary
files. Only after both are complete does one ordinary message give the executor
both paths. The orchestrator does not merge, rank, summarize, hash, encode,
split, truncate or judge their content. File or complete-read failure is
`unknown`, never partial pass. Cleanup is best effort and targets only owned
files.

## Rejected

- private provider transcripts, hooks, session databases and goal stores;
- inline/headless direct provider invocation as a fallback;
- completion markers or verdict files created only to satisfy Meta-O;
- reconstruction from terminal snippets;
- a provider-proxy or adapter service.
