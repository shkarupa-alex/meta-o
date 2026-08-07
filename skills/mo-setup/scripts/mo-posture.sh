#!/bin/bash -p
# Privileged mode ignores BASH_ENV, SHELLOPTS, BASHOPTS and every exported
# function before this first line executes. Bash preserves the export attribute
# on inherited option variables, so the runner can reject that materially
# different state without importing its value. BASH_ENV itself remains exported
# and is measured by child Bash modes. Run this file directly so the kernel
# applies this shebang.

# Diagnose provider resolution across shell startup modes without printing
# alias/function bodies or profile output. The exit status describes only the
# matrix: 0 = identical command kinds and first paths, 1 = divergent kinds or
# first paths, 2 = incomplete or malformed evidence. A consistently missing
# provider is recorded as missing but does not by itself make the matrix
# structurally incomplete.

usage() {
  builtin printf '%s\n' \
    'Usage: mo-posture.sh [--shell zsh|bash|all] [--self-check] [--] [provider ...]' \
    '' \
    'Providers default to: claude codex opencode' \
    'Output paths use Bash %q encoding, so whitespace and newlines remain one field.' \
    'Profile stdout/stderr is never reproduced; its presence is summarized on stderr.' \
    'Run this file directly; do not prefix it with bash, which bypasses the privileged' \
    'shebang and can load caller state before the script isolates profile output.' \
    'Runtime requires /bin/bash 3.2 or newer, /usr/bin/printf, /usr/bin/false' \
    'and /bin/sleep at those absolute paths. Bash matrices additionally require' \
    '/usr/bin/env with -0 support.'
}

requested_shell=all
self_check=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --shell)
      [[ $# -ge 2 ]] || {
        usage >&2
        exit 2
      }
      requested_shell=$2
      shift 2
      ;;
    --self-check)
      self_check=1
      shift
      ;;
    --)
      shift
      break
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      printf 'mo-posture: unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
    *) break ;;
  esac
done

case "$requested_shell" in
  zsh | bash | all) ;;
  *)
    printf 'mo-posture: unsupported shell: %s\n' "$requested_shell" >&2
    exit 2
    ;;
esac

providers=("$@")
if [[ ${#providers[@]} -eq 0 ]]; then
  providers=(claude codex opencode)
fi

# These programs execute inside the startup mode being measured. Keeping them
# here gives the fragile protocol one executable owner; --self-check parses each
# program with the shell that will execute it.
ZSH_PROBE='
probe_status=0
# Shell syntax performs this check before any dispatch primitive is trusted.
# Backslashes below also prevent aliases from intercepting the validated names.
if (( ${+functions[builtin]} || ${+aliases[builtin]} ||
      ${+functions[command]} || ${+aliases[command]} ||
      ${+functions[printf]} || ${+aliases[printf]} )); then
  /usr/bin/printf "%s\n" dispatch-shadow >"$MO_POSTURE_DIAGNOSTIC_FILE" 2>/dev/null
  /usr/bin/false
else
  for c in "$@"; do
    kind_line=$(\builtin whence -w "$c" 2>/dev/null) || kind_line="$c: missing"
    resolved_path=$(\builtin whence -p "$c" 2>/dev/null) || resolved_path=missing
    kind=${kind_line#"$c: "}
    record_valid=1
    [[ "$kind_line" == "$c: $kind" ]] || record_valid=0
    case "$kind" in
      alias | function | command | missing) ;;
      *) record_valid=0 ;;
    esac
    [[ "$resolved_path" == missing || "$resolved_path" == /* ]] || record_valid=0
    [[ "$kind" != missing || "$resolved_path" == missing ]] || record_valid=0
    [[ "$resolved_path" != missing || "$kind" == missing ||
       "$kind" == alias || "$kind" == function ]] || record_valid=0
    if (( record_valid )); then
      \builtin printf "%s\0%s\0%s\0" "$c" "$kind" "$resolved_path" >>"$MO_POSTURE_RECORD_FILE" || probe_status=2
    else
      \builtin printf "%s\0invalid\0invalid\0" "$c" >>"$MO_POSTURE_RECORD_FILE" || true
      probe_status=2
    fi
  done
  exit "$probe_status"
fi
'

BASH_PROBE='
probe_status=0
# Cross-check both dispatch builtins before trusting either. Output from a
# shadow function is captured by command substitution and never reaches the
# transcript; a mismatch fails closed before record emission.
builtin_kind=$(\command \type -t builtin 2>/dev/null) || builtin_kind=invalid
command_kind=$(\builtin \type -t command 2>/dev/null) || command_kind=invalid
if [[ "$builtin_kind" != builtin || "$command_kind" != builtin ]]; then
  /usr/bin/printf "%s\n" dispatch-shadow >"$MO_POSTURE_DIAGNOSTIC_FILE" 2>/dev/null
  /usr/bin/false
else
  printf_kind=$(\builtin \type -t printf 2>/dev/null) || printf_kind=invalid
  if [[ "$printf_kind" != builtin ]]; then
    /usr/bin/printf "%s\n" dispatch-shadow >"$MO_POSTURE_DIAGNOSTIC_FILE" 2>/dev/null
    /usr/bin/false
  else
    for c in "$@"; do
      kind=$(\builtin \type -t -- "$c" 2>/dev/null) || kind=missing
      resolved_path=$(\builtin \type -P -- "$c" 2>/dev/null) || resolved_path=missing
      record_valid=1
      case "$kind" in
        alias | function | file | missing) ;;
        *) record_valid=0 ;;
      esac
      [[ "$resolved_path" == missing || "$resolved_path" == /* ]] || record_valid=0
      [[ "$kind" != missing || "$resolved_path" == missing ]] || record_valid=0
      [[ "$resolved_path" != missing || "$kind" == missing ||
         "$kind" == alias || "$kind" == function ]] || record_valid=0
      if (( record_valid )); then
        \builtin \printf "%s\0%s\0%s\0" "$c" "$kind" "$resolved_path" >>"$MO_POSTURE_RECORD_FILE" || probe_status=2
      else
        \builtin \printf "%s\0invalid\0invalid\0" "$c" >>"$MO_POSTURE_RECORD_FILE" || true
        probe_status=2
      fi
    done
    exit "$probe_status"
  fi
fi
'

if (( self_check )); then
  check_status=0
  zsh_path=$(builtin type -P -- zsh 2>/dev/null) || zsh_path=
  bash_path=$(builtin type -P -- bash 2>/dev/null) || bash_path=
  if [[ "$zsh_path" == /* ]]; then
    "$zsh_path" -n -c "$ZSH_PROBE" || check_status=2
  elif [[ "$requested_shell" == zsh || "$requested_shell" == all ]]; then
    printf 'mo-posture: zsh is not installed\n' >&2
    check_status=2
  fi
  if [[ "$bash_path" == /* ]]; then
    "$bash_path" -p -n -c "$BASH_PROBE" || check_status=2
  elif [[ "$requested_shell" == bash || "$requested_shell" == all ]]; then
    printf 'mo-posture: bash is not installed\n' >&2
    check_status=2
  fi
  exit "$check_status"
fi

temporary_base=${TMPDIR:-/tmp}
temporary_base=${temporary_base%/}
work_directory=
active_child_pid=
active_child_pgid=
creating_work_directory=0
launching_child=0
pending_signal_status=
shutdown_started=0

cleanup() {
  case "$work_directory" in
    "$temporary_base"/mo-posture.*) builtin command -p rm -rf -- "$work_directory" ;;
    "") ;;
    *) printf 'mo-posture: refused unsafe cleanup path\n' >&2 ;;
  esac
  work_directory=
}

stop_active_child() {
  local attempt
  local process_group
  local stop_status=0
  if [[ "$active_child_pid" =~ ^[0-9]+$ && "$active_child_pgid" =~ ^[0-9]+$ ]]; then
    process_group=-$active_child_pgid
    builtin kill -TERM -- "$process_group" 2>/dev/null || true
    /bin/sleep 0.05
    if builtin kill -0 -- "$process_group" 2>/dev/null; then
      builtin kill -KILL -- "$process_group" 2>/dev/null || true
    fi
    builtin wait "$active_child_pid" 2>/dev/null || true
    attempt=0
    while builtin kill -0 -- "$process_group" 2>/dev/null && [[ $attempt -lt 20 ]]; do
      builtin kill -KILL -- "$process_group" 2>/dev/null || true
      /bin/sleep 0.01
      attempt=$((attempt + 1))
    done
    if builtin kill -0 -- "$process_group" 2>/dev/null; then
      printf 'mo-posture: child process group survived termination: %s\n' \
        "$active_child_pgid" >&2
      stop_status=1
    fi
    active_child_pid=
    active_child_pgid=
  fi
  return "$stop_status"
}

exit_on_signal() {
  local signal_status=$1
  if [[ $shutdown_started -eq 1 ]]; then
    return
  fi
  shutdown_started=1
  stop_active_child || true
  cleanup
  builtin exit "$signal_status"
}

request_signal() {
  local signal_status=$1
  if [[ $creating_work_directory -eq 1 || $launching_child -eq 1 ]]; then
    pending_signal_status=$signal_status
    return
  fi
  exit_on_signal "$signal_status"
}

builtin trap cleanup EXIT
builtin trap 'request_signal 129' HUP
builtin trap 'request_signal 130' INT
builtin trap 'request_signal 143' TERM

umask 077
creating_work_directory=1
work_directory=$(builtin command -p mktemp -d "$temporary_base/mo-posture.XXXXXX")
work_directory_status=$?
creating_work_directory=0
if [[ "$pending_signal_status" =~ ^[0-9]+$ ]]; then
  exit_on_signal "$pending_signal_status"
fi
if [[ $work_directory_status -ne 0 || -z "$work_directory" ]]; then
  printf 'mo-posture: cannot create temporary directory\n' >&2
  exit 2
fi

# Privileged Bash did not import caller functions. Their environment entries
# still describe a materially different non-privileged Bash launch. Capture the
# complete NUL-delimited environment privately and fail closed if env cannot
# produce that framing. Only Bash posture needs this scan: privileged startup is
# already the state being measured for Zsh, while Bash must account for caller
# state that its ordinary non-privileged launch would import.
environment_file="$work_directory/runner.environment"
environment_error_file="$work_directory/runner.environment.stderr"
environment_scan_ok=1
if [[ "$requested_shell" == bash || "$requested_shell" == all ]]; then
  if ! /usr/bin/env -0 >"$environment_file" 2>"$environment_error_file"; then
    environment_scan_ok=0
  fi
  [[ -s "$environment_file" ]] || environment_scan_ok=0
else
  : >"$environment_file"
  : >"$environment_error_file"
fi

inherited_bash_functions=0
environment_entry=
if [[ ( "$requested_shell" == bash || "$requested_shell" == all ) &&
      $environment_scan_ok -eq 1 ]]; then
  while IFS= read -r -d '' environment_entry; do
    environment_name=${environment_entry%%=*}
    case "$environment_name" in
      BASH_FUNC_*%% | BASH_FUNC_*'()') inherited_bash_functions=1 ;;
    esac
    environment_entry=
  done <"$environment_file"
  [[ -z "$environment_entry" ]] || environment_scan_ok=0
fi
: >"$environment_file"
: >"$environment_error_file"

inherited_bash_options=0
for option_variable in SHELLOPTS BASHOPTS; do
  option_declaration=$(builtin declare -p "$option_variable" 2>/dev/null) || continue
  option_attributes=${option_declaration#declare -}
  option_attributes=${option_attributes%% *}
  case "$option_attributes" in
    *x*) inherited_bash_options=1 ;;
  esac
done

unsafe_bash_environment=0
bash_environment_reason=inherited-shell-state
if [[ $environment_scan_ok -ne 1 ]]; then
  unsafe_bash_environment=1
  bash_environment_reason=environment-scan-failed
elif [[ $inherited_bash_options -eq 1 || $inherited_bash_functions -eq 1 ]]; then
  unsafe_bash_environment=1
fi

emit_noise_summary() {
  local shell_name=$1
  local mode=$2
  local stdout_file=$3
  local stderr_file=$4
  local stdout_state=empty
  local stderr_state=empty
  [[ -s "$stdout_file" ]] && stdout_state=present
  [[ -s "$stderr_file" ]] && stderr_state=present
  if [[ "$stdout_state" == present || "$stderr_state" == present ]]; then
    printf 'MO_POSTURE_NOISE shell=%s mode=%s stdout=%s stderr=%s\n' \
      "$shell_name" "$mode" "$stdout_state" "$stderr_state" >&2
  fi
}

kind_is_valid() {
  local shell_name=$1
  local kind=$2
  case "$shell_name:$kind" in
    zsh:alias | zsh:function | zsh:command | zsh:missing) return 0 ;;
    bash:alias | bash:function | bash:file | bash:missing) return 0 ;;
    *) return 1 ;;
  esac
}

emit_record() {
  local shell_name=$1
  local mode=$2
  local name=$3
  local kind=$4
  local path=$5
  printf 'MO_POSTURE shell=%s mode=%s name=%q type=%q path=%q\n' \
    "$shell_name" "$mode" "$name" "$kind" "$path"
}

run_matrix() {
  local shell_name=$1
  local probe=$2
  local shell_path
  local modes=(-lc -lic -c -ic)
  local baseline_set=0
  local matrix_status=0
  local baseline_kinds=()
  local baseline_paths=()
  local mode mode_key record_file diagnostic_file stdout_file stderr_file mode_status
  local field field_count expected_fields malformed provider_index offset
  local name kind path
  local fields=()

  shell_path=$(builtin type -P -- "$shell_name" 2>/dev/null) || shell_path=
  if [[ "$shell_path" != /* ]]; then
    printf 'mo-posture: requested shell is not installed: %s\n' "$shell_name" >&2
    return 2
  fi

  if [[ "$shell_name" == bash && $unsafe_bash_environment -eq 1 ]]; then
    printf 'MO_POSTURE_ENVIRONMENT shell=bash status=2 reason=%s\n' \
      "$bash_environment_reason" >&2
    for mode in "${modes[@]}"; do
      provider_index=0
      while [[ $provider_index -lt ${#providers[@]} ]]; do
        emit_record bash "$mode" "${providers[$provider_index]}" invalid invalid
        provider_index=$((provider_index + 1))
      done
    done
    return 2
  fi

  for mode in "${modes[@]}"; do
    mode_key=${mode#-}
    record_file="$work_directory/$shell_name-$mode_key.records"
    diagnostic_file="$work_directory/$shell_name-$mode_key.diagnostic"
    stdout_file="$work_directory/$shell_name-$mode_key.stdout"
    stderr_file="$work_directory/$shell_name-$mode_key.stderr"
    : >"$record_file"
    : >"$diagnostic_file"

    launching_child=1
    builtin set -m
    MO_POSTURE_RECORD_FILE="$record_file" MO_POSTURE_DIAGNOSTIC_FILE="$diagnostic_file" \
      "$shell_path" "$mode" "$probe" mo-posture "${providers[@]}" \
      >"$stdout_file" 2>"$stderr_file" </dev/null &
    active_child_pid=$!
    active_child_pgid=$active_child_pid
    builtin set +m
    launching_child=0
    if [[ "$pending_signal_status" =~ ^[0-9]+$ ]]; then
      exit_on_signal "$pending_signal_status"
    fi
    builtin wait "$active_child_pid"
    mode_status=$?
    # The shell can exit while profile-started background descendants still own
    # this process group and the capture descriptors. Quiesce the whole group
    # before any evidence file is inspected.
    stop_active_child || mode_status=2
    emit_noise_summary "$shell_name" "$mode" "$stdout_file" "$stderr_file"
    if [[ -s "$diagnostic_file" ]]; then
      printf 'MO_POSTURE_SHADOW shell=%s mode=%s primitives=builtin,command,printf\n' \
        "$shell_name" "$mode" >&2
    fi

    fields=()
    field=
    field_count=0
    while IFS= read -r -d '' field; do
      fields[$field_count]=$field
      field_count=$((field_count + 1))
      field=
    done <"$record_file"

    expected_fields=$((${#providers[@]} * 3))
    malformed=0
    [[ -z "$field" && $field_count -eq $expected_fields ]] || malformed=1
    [[ $mode_status -eq 0 ]] || malformed=1

    if (( !malformed )); then
      provider_index=0
      while [[ $provider_index -lt ${#providers[@]} ]]; do
        offset=$((provider_index * 3))
        name=${fields[$offset]}
        kind=${fields[$((offset + 1))]}
        path=${fields[$((offset + 2))]}
        [[ "$name" == "${providers[$provider_index]}" ]] || malformed=1
        kind_is_valid "$shell_name" "$kind" || malformed=1
        [[ "$path" == missing || "$path" == /* ]] || malformed=1
        [[ "$kind" != missing || "$path" == missing ]] || malformed=1
        [[ "$path" != missing || "$kind" == missing ||
           "$kind" == alias || "$kind" == function ]] || malformed=1
        provider_index=$((provider_index + 1))
      done
    fi

    if (( malformed )); then
      matrix_status=2
      provider_index=0
      while [[ $provider_index -lt ${#providers[@]} ]]; do
        emit_record "$shell_name" "$mode" "${providers[$provider_index]}" invalid invalid
        provider_index=$((provider_index + 1))
      done
      continue
    fi

    provider_index=0
    while [[ $provider_index -lt ${#providers[@]} ]]; do
      offset=$((provider_index * 3))
      name=${fields[$offset]}
      kind=${fields[$((offset + 1))]}
      path=${fields[$((offset + 2))]}
      emit_record "$shell_name" "$mode" "$name" "$kind" "$path"
      if (( !baseline_set )); then
        baseline_kinds[$provider_index]=$kind
        baseline_paths[$provider_index]=$path
      elif [[ ( "$kind" != "${baseline_kinds[$provider_index]}" ||
                "$path" != "${baseline_paths[$provider_index]}" ) &&
              $matrix_status -eq 0 ]]; then
        matrix_status=1
      fi
      provider_index=$((provider_index + 1))
    done
    baseline_set=1
  done

  return "$matrix_status"
}

overall_status=0
if [[ "$requested_shell" == zsh || "$requested_shell" == all ]]; then
  run_matrix zsh "$ZSH_PROBE"
  shell_status=$?
  printf 'MO_POSTURE_MATRIX shell=zsh status=%s\n' "$shell_status"
  if [[ $shell_status -eq 2 ]]; then
    overall_status=2
  elif [[ $shell_status -eq 1 && $overall_status -eq 0 ]]; then
    overall_status=1
  fi
fi
if [[ "$requested_shell" == bash || "$requested_shell" == all ]]; then
  run_matrix bash "$BASH_PROBE"
  shell_status=$?
  printf 'MO_POSTURE_MATRIX shell=bash status=%s\n' "$shell_status"
  if [[ $shell_status -eq 2 ]]; then
    overall_status=2
  elif [[ $shell_status -eq 1 && $overall_status -eq 0 ]]; then
    overall_status=1
  fi
fi

exit "$overall_status"
