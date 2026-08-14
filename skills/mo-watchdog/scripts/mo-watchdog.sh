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
    /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | grep -Eiq 'question|blocked|required input|pending.?permission'; then
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

# Orca generates fresh RPC request/runtime IDs and Paseo refreshes `UpdatedAt`
# on otherwise identical reads. Those observation fields cannot participate in
# stale-state suppression. Semantic result fields, including Orca lastOutputAt,
# remain.
stable_snapshot() {
  WATCHDOG_BACKEND=$1
  WATCHDOG_TEXT=$2
  if /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | jq -e . >/dev/null 2>&1; then
    case "$WATCHDOG_BACKEND" in
      orca) /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | jq -cS 'del(.id, ._meta.runtimeId)' ;;
      paseo) /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | jq -cS 'del(.UpdatedAt)' ;;
      *) /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | jq -cS . ;;
    esac
  else
    /usr/bin/printf '%s' "$WATCHDOG_TEXT"
  fi
}

# Classify JSON values, never field names: a null `releaseError` is not an error
# and `connected: false` is not working. Pending-permission arrays need one
# explicit semantic token because their meaning otherwise lives in the key.
classification_text() {
  WATCHDOG_TEXT=$1
  if /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | jq -e . >/dev/null 2>&1; then
    /usr/bin/printf '%s\n' "$WATCHDOG_TEXT" | jq -r '
      ([.. | scalars | select(. != null and . != false and . != true)] | map(tostring) | join(" "))
      + (if (((.PendingPermissions? // .pending_permissions? // []) | length) > 0)
         then " pending_permission" else "" end)
    '
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
  if [ ! -d "$WATCHDOG_STATE_ROOT" ]; then
    mkdir -p "$WATCHDOG_STATE_ROOT" || return 73
    chmod 700 "$WATCHDOG_STATE_ROOT" || return 73
  fi
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

# One atomic file per backend locator serializes the duplicate check, delivery
# and digest update. A live owner suppresses a concurrent invocation; a dead
# owner's exact stale lock is reclaimed without touching any session data.
acquire_nudge_lock() {
  WATCHDOG_LOCK_FILE=${WATCHDOG_FILE}.lock
  WATCHDOG_LOCK_ATTEMPT=0
  while [ "$WATCHDOG_LOCK_ATTEMPT" -lt 2 ]; do
    if (set -C; /usr/bin/printf '%s\n' "$$" > "$WATCHDOG_LOCK_FILE") 2>/dev/null; then
      chmod 600 "$WATCHDOG_LOCK_FILE" 2>/dev/null || true
      return 0
    fi
    WATCHDOG_LOCK_OWNER=$(sed -n '1p' "$WATCHDOG_LOCK_FILE" 2>/dev/null)
    case "$WATCHDOG_LOCK_OWNER" in
      ''|*[!0-9]*) ;;
      *)
        if kill -0 "$WATCHDOG_LOCK_OWNER" 2>/dev/null; then
          return 1
        fi
        ;;
    esac
    rm -f "$WATCHDOG_LOCK_FILE" 2>/dev/null || return 1
    WATCHDOG_LOCK_ATTEMPT=$((WATCHDOG_LOCK_ATTEMPT + 1))
  done
  return 1
}

release_nudge_lock() {
  if [ -f "$WATCHDOG_LOCK_FILE" ] && \
    [ "$(sed -n '1p' "$WATCHDOG_LOCK_FILE")" = "$$" ]; then
    rm -f "$WATCHDOG_LOCK_FILE"
  fi
}

report_item() {
  WATCHDOG_BACKEND=$1
  WATCHDOG_LOCATOR=$2
  WATCHDOG_ITEM=$3
  WATCHDOG_CLASSIFICATION=$(classification_text "$WATCHDOG_ITEM")
  WATCHDOG_STATE=$(classify "$WATCHDOG_CLASSIFICATION")
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
  WATCHDOG_COUNT=$(
    /usr/bin/printf '%s\n' "$WATCHDOG_OUTPUT" |
      jq -er "($WATCHDOG_FILTER) | if type == \"array\" then length else error(\"expected array\") end"
  )
  WATCHDOG_FILTER_STATUS=$?
  case "$WATCHDOG_COUNT" in ''|*[!0-9]*) WATCHDOG_FILTER_STATUS=1 ;; esac
  if [ "$WATCHDOG_FILTER_STATUS" -ne 0 ]; then
    /usr/bin/printf 'backend=%s surface=%s state=unclassified action=observe-error\n%s\n' \
      "$WATCHDOG_BACKEND" "$WATCHDOG_SURFACE" "$WATCHDOG_OUTPUT"
    return 1
  fi
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
        scan_command herdr agents 'if (.result.agents? | type) == "array" then .result.agents else error("missing agents array") end' \
          '(.name // .pane_id // .terminal_id // "unknown")' herdr agent list || WATCHDOG_SCAN_STATUS=1
        ;;
      orca)
        scan_command orca workers 'if (.result.workers? | type) == "array" then .result.workers elif (.workers? | type) == "array" then .workers else error("missing workers array") end' \
          '(.dispatchId // .taskId // .agentTerminalHandle // "unknown")' \
          orca orchestration worker-list --json || WATCHDOG_SCAN_STATUS=1
        scan_command orca terminals 'if (.result.terminals? | type) == "array" then .result.terminals elif (.terminals? | type) == "array" then .terminals else error("missing terminals array") end' \
          '(.handle // "unknown")' orca terminal list --json || WATCHDOG_SCAN_STATUS=1
        ;;
      paseo)
        scan_command paseo agents 'if type == "array" then . elif (.agents? | type) == "array" then .agents elif (.result.agents? | type) == "array" then .result.agents else error("missing agents array") end' \
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
WATCHDOG_CLASSIFICATION=$(classification_text "$WATCHDOG_BEFORE")
WATCHDOG_STATE=$(classify "$WATCHDOG_CLASSIFICATION")
if [ -z "$WATCHDOG_NUDGE" ]; then
  /usr/bin/printf 'backend=%s session=%s status=%s state=%s action=observed\n%s\n' \
    "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" "$WATCHDOG_STATUS" "$WATCHDOG_STATE" "$WATCHDOG_BEFORE"
  exit "$WATCHDOG_STATUS"
fi

if [ "$WATCHDOG_STATUS" -ne 0 ]; then
  /usr/bin/printf 'backend=%s session=%s status=%s state=%s action=observe-error\n' \
    "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" "$WATCHDOG_STATUS" "$WATCHDOG_STATE"
  exit "$WATCHDOG_STATUS"
fi

WATCHDOG_FILE=$(state_file)
WATCHDOG_STATE_STATUS=$?
if [ "$WATCHDOG_STATE_STATUS" -ne 0 ]; then
  /usr/bin/printf 'backend=%s session=%s state=%s action=state-error\n' \
    "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" "$WATCHDOG_STATE"
  exit "$WATCHDOG_STATE_STATUS"
fi
if ! acquire_nudge_lock; then
  /usr/bin/printf 'backend=%s session=%s state=%s action=concurrent-suppressed\n' \
    "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" "$WATCHDOG_STATE"
  exit 2
fi

# Re-read inside the per-locator critical section immediately before the only
# authorized action. Compare semantic backend state, not a changing RPC envelope.
WATCHDOG_AFTER=$(read_target "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION")
WATCHDOG_AFTER_STATUS=$?
if [ "$WATCHDOG_AFTER_STATUS" -ne 0 ]; then
  release_nudge_lock
  /usr/bin/printf 'backend=%s session=%s status=%s state=%s action=observe-error\n' \
    "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" "$WATCHDOG_AFTER_STATUS" "$WATCHDOG_STATE"
  exit "$WATCHDOG_AFTER_STATUS"
fi
WATCHDOG_STABLE_BEFORE=$(stable_snapshot "$WATCHDOG_BACKEND" "$WATCHDOG_BEFORE")
WATCHDOG_STABLE_AFTER=$(stable_snapshot "$WATCHDOG_BACKEND" "$WATCHDOG_AFTER")
if [ "$WATCHDOG_STABLE_BEFORE" != "$WATCHDOG_STABLE_AFTER" ]; then
  release_nudge_lock
  /usr/bin/printf 'backend=%s session=%s state=changed action=suppressed\n' \
    "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION"
  exit 2
fi
WATCHDOG_STATE_FINGERPRINT=$(
  /usr/bin/printf '%s\0%s\0%s' "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" \
    "$WATCHDOG_STABLE_AFTER" | digest
) || { WATCHDOG_DIGEST_STATUS=$?; release_nudge_lock; exit "$WATCHDOG_DIGEST_STATUS"; }
WATCHDOG_MESSAGE_FINGERPRINT=$(/usr/bin/printf '%s' "$WATCHDOG_NUDGE" | digest) || {
  WATCHDOG_DIGEST_STATUS=$?
  release_nudge_lock
  exit "$WATCHDOG_DIGEST_STATUS"
}
if [ -f "$WATCHDOG_FILE" ] && \
  [ "$(sed -n '1p' "$WATCHDOG_FILE")" = "$WATCHDOG_STATE_FINGERPRINT" ] && \
  sed -n '2,$p' "$WATCHDOG_FILE" | grep -Fqx "$WATCHDOG_MESSAGE_FINGERPRINT"; then
  release_nudge_lock
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
release_nudge_lock
/usr/bin/printf 'backend=%s session=%s state=%s action=nudge status=%s\n' \
  "$WATCHDOG_BACKEND" "$WATCHDOG_SESSION" "$WATCHDOG_STATE" "$WATCHDOG_NUDGE_STATUS"
exit "$WATCHDOG_NUDGE_STATUS"
