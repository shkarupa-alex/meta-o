#!/usr/bin/env bash
# §M-UPDATE — Refresh an existing installation and re-prove the backend.
#
# An update is the same copy an install is; what makes it a separate script is
# what must happen afterwards. A backend that quietly lost a capability during
# an upgrade is the exact failure the capability suite exists to catch, and
# catching it later — mid-run, as a hang — is much more expensive.
#
# Like install.sh, this touches no project: no hooks, no per-repository config,
# no version pin.

set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'USAGE'
usage: update.sh [options]

  --prefix DIR        installation prefix to refresh   (default: ~/.local)
  --skills-dir DIR    skills directory to refresh      (default: ~/.claude/skills)
  --no-skills         refresh only the CLI, libraries and templates
  --skip-suite        do not run the capability suite (not recommended)
  --help              show this message

By default the full backend capability suite runs after the copy. A regression
stops the update loudly instead of leaving a backend that fails mid-run.
USAGE
}

FORWARD=()
RUN_SUITE=1

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-suite) RUN_SUITE=0; shift ;;
    --help|-h) usage; exit 0 ;;
    *) FORWARD+=("$1"); shift ;;
  esac
done

if [ "$RUN_SUITE" -eq 1 ]; then
  FORWARD+=(--capability-suite)
fi

exec "$SOURCE_DIR/install.sh" --update "${FORWARD[@]}"
