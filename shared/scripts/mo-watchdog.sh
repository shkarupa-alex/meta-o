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
  elif /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | grep -Eiq 'working|running|active|in_progress|connected'; then
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

# Orca generates a fresh RPC request ID and runtime ID for every read. They are
# transport metadata, not observed session state, so they cannot participate in
# stale-state suppression. All result fields, including lastOutputAt, remain.
stable_snapshot() {
  WATCHDOG_BACKEND=$1
  WATCHDOG_TEXT=$2
  if [ "$WATCHDOG_BACKEND" = orca ] && \
    /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | jq -e . >/dev/null 2>&1; then
    /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | jq -cS 'del(.id, ._meta.runtimeId)'
  else
    /usr/bin/printf '%s' "$WATCHDOG_TEXT"
  fi
}

digest() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 | awk '{print $NF}'
  else
    return 69
  fi
}

state_file() {
  WATCHDOG_KEY=$(/usr/bin/printf '%s\0%s' "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" | digest) || return 69
  WATCHDOG_STATE_ROOT=${WATCHDOG_STATE_DIR:-${XDG_STATE_HOME:-${HOME:-/tmp}/.local/state}/meta-o/watchdog}
  umask 077
  mkdir -p "$WATCHDOG_STATE_ROOT" || return 73
  chmod 700 "$WATCHDOG_STATE_ROOT" 2>/dev/null || true
  /usr/bin/printf '%s/%s' "$WATCHDOG_STATE_ROOT" "$WATCHDOG_KEY"
}

remember_nudge() {
  WATCHDOG_FILE=$1
  WATCHDOG_STATE_FINGERPRINT=$2
  WATCHDOG_MESSAGE_FINGERPRINT=$3
  WATCHDOG_TEMP=$(mktemp "${WATCHDOG_FILE}.XXXXXX") || return 73
  if [ -f "$WATCHDOG_FILE" ] && \
    [ "$(sed -n '1p' "$WATCHDOG_FILE")" = "$WATCHDOG_STATE_FINGERPRINT" ]; then
    cp "$WATCHDOG_FILE" "$WATCHDOG_TEMP" || return 73
  else
    /usr/bin/printf '%s\n' "$WATCHDOG_STATE_FINGERPRINT" > "$WATCHDOG_TEMP" || return 73
  fi
  /usr/bin/printf '%s\n' "$WATCHDOG_MESSAGE_FINGERPRINT" >> "$WATCHDOG_TEMP" || return 73
  chmod 600 "$WATCHDOG_TEMP" 2>/dev/null || true
  mv "$WATCHDOG_TEMP" "$WATCHDOG_FILE"
}

report_item() {
  WATCHDOG_BACKEND=$1
  WATCHDOG_LOCATOR=$2
  WATCHDOG_ITEM=$3
  WATCHDOG_STATE=$(classify "$WATCHDOG_ITEM")
  /usr/bin/printf 'backend=%s session=%s state=%s action=observed\n' \
    "$WATCHDOG_BACKEND" "$WATCHDOG_LOCATOR" "$WATCHDOG_STATE"
}

scan_json_items() {
  WATCHDOG_BACKEND=$1
  WATCHDOG_SURFACE=$2
  WATCHDOG_OUTPUT=$3
  WATCHDOG_FILTER=$4
  WATCHDOG_LOCATOR_FILTER=$5
  if ! /usr/bin/printf '%s\n' "$WATCHDOG_OUTPUT" | jq -e . >/dev/null 2>&1; then
    /usr/bin/printf 'backend=%s surface=%s state=unclassified action=observe-error\n%s\n' \
      "$WATCHDOG_BACKEND" "$WATCHDOG_SURFACE" "$WATCHDOG_OUTPUT"
    return 1
  fi
  WATCHDOG_COUNT=$(/usr/bin/printf '%s\n' "$WATCHDOG_OUTPUT" | jq "$WATCHDOG_FILTER | length")
  if [ "$WATCHDOG_COUNT" -eq 0 ]; then
    /usr/bin/printf 'backend=%s surface=%s state=no-sessions action=observed\n' \
      "$WATCHDOG_BACKEND" "$WATCHDOG_SURFACE"
    return 0
  fi
  /usr/bin/printf '%s\n' "$WATCHDOG_OUTPUT" | jq -c "($WATCHDOG_FILTER)[]" | while IFS= read -r WATCHDOG_ITEM; do
    WATCHDOG_LOCATOR=$(/usr/bin/printf '%s\n' "$WATCHDOG_ITEM" | jq -r "$WATCHDOG_LOCATOR_FILTER")
    report_item "$WATCHDOG_BACKEND" "$WATCHDOG_LOCATOR" "$WATCHDOG_ITEM"
  done
}

scan_command() {
  WATCHDOG_BACKEND=$1
  WATCHDOG_SURFACE=$2
  WATCHDOG_FILTER=$3
  WATCHDOG_LOCATOR_FILTER=$4
  shift 4
  WATCHDOG_OUTPUT=$("$@" 2>&1)
  WATCHDOG_STATUS=$?
  if [ "$WATCHDOG_STATUS" -ne 0 ]; then
    /usr/bin/printf 'backend=%s surface=%s status=%s state=control-error action=observe-error\n%s\n' \
      "$WATCHDOG_BACKEND" "$WATCHDOG_SURFACE" "$WATCHDOG_STATUS" "$WATCHDOG_OUTPUT"
    return "$WATCHDOG_STATUS"
  fi
  scan_json_items "$WATCHDOG_BACKEND" "$WATCHDOG_SURFACE" "$WATCHDOG_OUTPUT" \
    "$WATCHDOG_FILTER" "$WATCHDOG_LOCATOR_FILTER"
}

if [ "$#" -lt 1 ]; then
  usage >&2
  exit 64
fi

if ! command -v jq >/dev/null 2>&1; then
  /usr/bin/printf '%s\n' 'watchdog requires jq to parse native backend JSON safely' >&2
  exit 69
fi

WATCHDOG_MODE=$1
shift

if [ "$WATCHDOG_MODE" = scan ]; then
  if [ "$#" -ne 0 ]; then
    usage >&2
    exit 64
  fi
  WATCHDOG_SCAN_STATUS=0
  for WATCHDOG_BACKEND in herdr orca paseo; do
    if ! command -v "$WATCHDOG_BACKEND" >/dev/null 2>&1; then
      /usr/bin/printf 'backend=%s state=missing-control action=none\n' "$WATCHDOG_BACKEND"
      continue
    fi
    case "$WATCHDOG_BACKEND" in
      herdr)
        scan_command herdr agents '.result.agents // []' \
          '(.name // .pane_id // .terminal_id // "unknown")' herdr agent list || WATCHDOG_SCAN_STATUS=1
        ;;
      orca)
        scan_command orca workers '.result.workers // .workers // []' \
          '(.dispatchId // .taskId // .agentTerminalHandle // "unknown")' \
          orca orchestration worker-list --json || WATCHDOG_SCAN_STATUS=1
        scan_command orca terminals '.result.terminals // .terminals // []' \
          '(.handle // "unknown")' orca terminal list --json || WATCHDOG_SCAN_STATUS=1
        ;;
      paseo)
        scan_command paseo agents 'if type == "array" then . else (.agents // .result.agents // []) end' \
          '(.id // .agentId // .name // "unknown")' paseo ls --json || WATCHDOG_SCAN_STATUS=1
        ;;
    esac
  done
  exit "$WATCHDOG_SCAN_STATUS"
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

# Re-read immediately before the only authorized action. Compare semantic
# backend state, not an RPC envelope whose request IDs change on every read.
WATCHDOG_AFTER=$(read_target "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION")
WATCHDOG_AFTER_STATUS=$?
WATCHDOG_STABLE_BEFORE=$(stable_snapshot "$WATCHDOG_BACKEND" "$WATCHDOG_BEFORE")
WATCHDOG_STABLE_AFTER=$(stable_snapshot "$WATCHDOG_BACKEND" "$WATCHDOG_AFTER")
if [ "$WATCHDOG_STATUS" -ne "$WATCHDOG_AFTER_STATUS" ] || \
  [ "$WATCHDOG_STABLE_BEFORE" != "$WATCHDOG_STABLE_AFTER" ]; then
  /usr/bin/printf 'backend=%s session=%s state=changed action=suppressed\n' \
    "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION"
  exit 2
fi

WATCHDOG_FILE=$(state_file)
WATCHDOG_STATE_STATUS=$?
if [ "$WATCHDOG_STATE_STATUS" -ne 0 ]; then
  /usr/bin/printf 'backend=%s session=%s state=%s action=state-error\n' \
    "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" "$WATCHDOG_STATE"
  exit "$WATCHDOG_STATE_STATUS"
fi
WATCHDOG_STATE_FINGERPRINT=$(
  /usr/bin/printf '%s\0%s\0%s' "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" \
    "$WATCHDOG_STABLE_AFTER" | digest
) || exit 69
WATCHDOG_MESSAGE_FINGERPRINT=$(/usr/bin/printf '%s' "$WATCHDOG_NUDGE" | digest) || exit 69
if [ -f "$WATCHDOG_FILE" ] && \
  [ "$(sed -n '1p' "$WATCHDOG_FILE")" = "$WATCHDOG_STATE_FINGERPRINT" ] && \
  sed -n '2,$p' "$WATCHDOG_FILE" | grep -Fqx "$WATCHDOG_MESSAGE_FINGERPRINT"; then
  /usr/bin/printf 'backend=%s session=%s state=%s action=duplicate-suppressed\n' \
    "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" "$WATCHDOG_STATE"
  exit 2
fi

case "$WATCHDOG_BACKEND" in
  herdr) herdr agent prompt "$WATCHDOG_SESSION" "$WATCHDOG_NUDGE" ;;
  orca)
    case "$WATCHDOG_SESSION" in
      ctx_*) orca orchestration send --to "dispatch:$WATCHDOG_SESSION" --subject Watchdog --body "$WATCHDOG_NUDGE" --json ;;
      term_*) orca terminal send --terminal "$WATCHDOG_SESSION" --text "$WATCHDOG_NUDGE" --enter --json ;;
      *) usage >&2; exit 64 ;;
    esac
    ;;
  paseo) paseo send "$WATCHDOG_SESSION" --prompt "$WATCHDOG_NUDGE" --no-wait --json ;;
esac
WATCHDOG_NUDGE_STATUS=$?
if [ "$WATCHDOG_NUDGE_STATUS" -eq 0 ]; then
  remember_nudge "$WATCHDOG_FILE" "$WATCHDOG_STATE_FINGERPRINT" \
    "$WATCHDOG_MESSAGE_FINGERPRINT" || WATCHDOG_NUDGE_STATUS=$?
fi
/usr/bin/printf 'backend=%s session=%s state=%s action=nudge status=%s\n' \
  "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" "$WATCHDOG_STATE" "$WATCHDOG_NUDGE_STATUS"
exit "$WATCHDOG_NUDGE_STATUS"
