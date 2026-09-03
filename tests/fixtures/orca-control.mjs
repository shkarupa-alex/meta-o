/**
 * One fake Orca control for every regression that needs the public surface.
 *
 * The watchdog is the only executable Orca consumer this project owns, so this
 * is where a real-run incident family gets replayed deterministically instead
 * of through a project proxy §A-ORCHESTRATION-01 forbids.
 *
 * Protects §A-WATCHDOG-01.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SYSTEM_PATH = "/usr/bin:/bin";
const FLOCK = spawnSync("/bin/sh", ["-c", "command -v flock"], { encoding: "utf8" }).stdout.trim();

/** §A-WATCHDOG-01 puts the host's real flock on the fake control's PATH. */
export function exposeFlock(root) {
  assert.notEqual(FLOCK, "", "test host must provide flock");
  symlinkSync(FLOCK, join(root, "flock"));
}

/** §A-WATCHDOG-01 writes a fake `orca` whose replies are driven by environment. */
export function fakeOrca(root) {
  const path = join(root, "orca");
  writeFileSync(
    path,
    `#!/bin/sh
case "$*" in
  "orchestration worker-show --dispatch ctx_fixture --json")
    if [ -n "\${WATCHDOG_MALFORMED-}" ]; then echo not-json; exit 0; fi
    if [ -n "\${WATCHDOG_SCALAR_OBSERVATION-}" ]; then
      echo '{"ok":true,"result":{"dispatch":{"id":"ctx_fixture","status":"running"},"worker":{"dispatch_id":"ctx_fixture","state":"working"},"observation":"malformed"}}'
      exit 0
    fi
    if [ -n "\${WATCHDOG_SCALAR_TERMINAL-}" ]; then
      echo '{"ok":true,"result":{"dispatch":{"id":"ctx_fixture","status":"running"},"worker":{"dispatch_id":"ctx_fixture","state":"working"},"terminal":"malformed"}}'
      exit 0
    fi
    stage=\${WATCHDOG_STAGE_TEXT:-active}
    if [ -n "\${WATCHDOG_CHANGED-}" ]; then
      n=$(cat "$WATCHDOG_COUNT" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$WATCHDOG_COUNT"; stage="changed-$n"
    fi
    printf '{"ok":true,"result":{"dispatch":{"id":"ctx_fixture","status":"running"},"worker":{"dispatch_id":"ctx_fixture","state":"working","stage":"%s"},"observation":{"status":"running"}}}\n' "$stage"
    ;;
  "terminal show --terminal term_fixture --json")
    echo '{"ok":true,"result":{"terminal":{"handle":"term_fixture","connected":true,"orphaned":false}}}'
    ;;
  "orchestration send --to dispatch:ctx_fixture --subject Watchdog --body "*" --json"|"terminal send --terminal term_fixture --text "*" --enter --json")
    if [ -n "\${WATCHDOG_SLOW_SEND-}" ]; then sleep 1; fi
    printf '%s\n' "$*" >> "$WATCHDOG_LOG"; echo '{"accepted":true}'
    ;;
  "orchestration worker-list --json")
    if [ -n "\${WATCHDOG_BAD_SCAN-}" ]; then echo '"wrong"'; else echo '{"result":{"workers":[{"dispatchId":"ctx_working","workerState":"working","dispatchStatus":"running"}]}}'; fi
    ;;
  "terminal list --json")
    echo '{"result":{"terminals":[{"handle":"term_active","connected":true,"lastOutputAt":123}]}}'
    ;;
  *) exit 2 ;;
esac
`,
  );
  chmodSync(path, 0o755);
}
