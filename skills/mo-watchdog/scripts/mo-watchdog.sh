#!/bin/bash
# Observe public backend state without depending on cloud-model inference.
# The helper exists because the orchestrator itself may be stalled by an API
# limit or overload; without an external observer no actor can notify the user.

set -u

usage() {
  /usr/bin/printf '%s\n' \
    'usage: mo-watchdog.sh scan' \
    '       mo-watchdog.sh target --backend herdr|orca|paseo --session ID [--nudge MESSAGE]'
}

classify() {
  WATCHDOG_TEXT=$1
  WATCHDOG_COMPACT=$(/usr/bin/printf '%s' "$WATCHDOG_TEXT" | tr -d '[:space:]')
  if /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | grep -Eiq 'rate.?limit|quota|too many requests|overload|capacity|inference.*busy'; then
    /usr/bin/printf 'limit_or_overload'
  elif /usr/bin/printf '%s\n' "$WATCHDOG_COMPACT" | grep -Eiq '"(PendingPermissions|pending_permissions)":\[\{' || \
    /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | grep -Eiq 'question|blocked|approval|required input'; then
    /usr/bin/printf 'question'
  elif /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | grep -Eiq 'failed|error|lost|unknown|crash|stopped'; then
    /usr/bin/printf 'failed'
  elif /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | grep -Eiq 'done|completed|idle|worker_done|succeeded'; then
    /usr/bin/printf 'completed'
  elif /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | grep -Eiq 'working|running|active|in_progress'; then
    /usr/bin/printf 'working'
  else
    /usr/bin/printf 'unclassified'
  fi
}

read_target() {
  WATCHDOG_BACKEND=$1
  WATCHDOG_SESSION=$2
  case "$WATCHDOG_BACKEND" in
    herdr) herdr agent get "$WATCHDOG_SESSION" 2>&1 ;;
    orca)
      case "$WATCHDOG_SESSION" in
        ctx_*) orca orchestration worker-show --dispatch "$WATCHDOG_SESSION" --json 2>&1 ;;
        task_*) orca orchestration dispatch-show --task "$WATCHDOG_SESSION" --json 2>&1 ;;
        term_*) orca terminal show --terminal "$WATCHDOG_SESSION" --json 2>&1 ;;
        *) return 64 ;;
      esac
      ;;
    paseo) paseo inspect "$WATCHDOG_SESSION" --json 2>&1 ;;
    *) return 64 ;;
  esac
}

scan_backend() {
  WATCHDOG_BACKEND=$1
  case "$WATCHDOG_BACKEND" in
    herdr) herdr agent list 2>&1 ;;
    orca)
      orca orchestration worker-list --json 2>&1
      orca terminal list --json 2>&1
      ;;
    paseo) paseo ls --json 2>&1 ;;
  esac
}

if [ "$#" -lt 1 ]; then
  usage >&2
  exit 64
fi

WATCHDOG_MODE=$1
shift

if [ "$WATCHDOG_MODE" = scan ]; then
  if [ "$#" -ne 0 ]; then
    usage >&2
    exit 64
  fi
  for WATCHDOG_BACKEND in herdr orca paseo; do
    if ! command -v "$WATCHDOG_BACKEND" >/dev/null 2>&1; then
      /usr/bin/printf 'backend=%s state=missing-control\n' "$WATCHDOG_BACKEND"
      continue
    fi
    WATCHDOG_OUTPUT=$(scan_backend "$WATCHDOG_BACKEND")
    WATCHDOG_STATUS=$?
    WATCHDOG_STATE=$(classify "$WATCHDOG_OUTPUT")
    /usr/bin/printf 'backend=%s status=%s state=%s\n%s\n' \
      "$WATCHDOG_BACKEND" "$WATCHDOG_STATUS" "$WATCHDOG_STATE" "$WATCHDOG_OUTPUT"
  done
  exit 0
fi

if [ "$WATCHDOG_MODE" != target ]; then
  usage >&2
  exit 64
fi

WATCHDOG_BACKEND=
WATCHDOG_SESSION=
WATCHDOG_NUDGE=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --backend|--session|--nudge)
      if [ "$#" -lt 2 ]; then
        usage >&2
        exit 64
      fi
      WATCHDOG_VALUE=$2
      case "$1" in
        --backend) WATCHDOG_BACKEND=$WATCHDOG_VALUE ;;
        --session) WATCHDOG_SESSION=$WATCHDOG_VALUE ;;
        --nudge) WATCHDOG_NUDGE=$WATCHDOG_VALUE ;;
      esac
      shift 2
      ;;
    *) usage >&2; exit 64 ;;
  esac
done

case "$WATCHDOG_BACKEND" in herdr|orca|paseo) ;; *) usage >&2; exit 64 ;; esac
if [ -z "$WATCHDOG_SESSION" ]; then
  usage >&2
  exit 64
fi
if ! command -v "$WATCHDOG_BACKEND" >/dev/null 2>&1; then
  /usr/bin/printf 'backend=%s session=%s state=missing-control action=none\n' \
    "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION"
  exit 1
fi

WATCHDOG_BEFORE=$(read_target "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION")
WATCHDOG_STATUS=$?
WATCHDOG_STATE=$(classify "$WATCHDOG_BEFORE")
if [ -z "$WATCHDOG_NUDGE" ]; then
  /usr/bin/printf 'backend=%s session=%s status=%s state=%s action=observed\n%s\n' \
    "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" "$WATCHDOG_STATUS" "$WATCHDOG_STATE" "$WATCHDOG_BEFORE"
  exit "$WATCHDOG_STATUS"
fi

# Re-read immediately before the only authorized action. A changed state aborts
# the nudge, so the same invocation cannot repeat a message against stale state.
WATCHDOG_AFTER=$(read_target "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION")
if [ "$WATCHDOG_BEFORE" != "$WATCHDOG_AFTER" ]; then
  /usr/bin/printf 'backend=%s session=%s state=changed action=suppressed\n' \
    "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION"
  exit 2
fi

case "$WATCHDOG_BACKEND" in
  herdr) herdr agent prompt "$WATCHDOG_SESSION" "$WATCHDOG_NUDGE" --wait ;;
  orca)
    case "$WATCHDOG_SESSION" in
      ctx_*) orca orchestration send --to "dispatch:$WATCHDOG_SESSION" --subject Watchdog --body "$WATCHDOG_NUDGE" --json ;;
      term_*) orca terminal send --terminal "$WATCHDOG_SESSION" --text "$WATCHDOG_NUDGE" --enter --json ;;
      *) usage >&2; exit 64 ;;
    esac
    ;;
  paseo) paseo send "$WATCHDOG_SESSION" --prompt "$WATCHDOG_NUDGE" --json ;;
esac
WATCHDOG_NUDGE_STATUS=$?
/usr/bin/printf 'backend=%s session=%s state=%s action=nudge status=%s\n' \
  "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" "$WATCHDOG_STATE" "$WATCHDOG_NUDGE_STATUS"
exit "$WATCHDOG_NUDGE_STATUS"
