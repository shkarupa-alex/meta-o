/**
 * §M-CONFIG — Optional machine-wide defaults for a project that has none yet.
 *
 * Implements §A-EXTERNAL-STATE. Every project keeps its own confirmed settings,
 * and those always win; this file exists so that the second and tenth project
 * on a machine do not each require the same four models to be typed out again
 * before a run can even start.
 *
 * It is deliberately only a *default*. Nothing here bypasses the user's
 * confirmation: a run seeded from this file still begins in
 * `AWAITING_MODEL_SET` and still has to be confirmed, because "which models am
 * I about to spend" is a question the user answers, not one a config file
 * answers on their behalf.
 */

import { configPath } from "./paths.mjs";
import { readSecureJson } from "./safe-fs.mjs";
import { validateModelSet } from "./model-set.mjs";
import type { Backend, ModelSet } from "./types.mjs";

/** §M-CONFIG — Shape of `~/.meta-o/config.json`. */
export interface GlobalConfig {
  schema_version: 1;
  defaultModelSet?: ModelSet;
  defaultBackend?: Backend;
  handoffDefault?: boolean;
  watchdogEnabled?: boolean;
}

/**
 * §M-CONFIG — Read the machine-wide defaults, tolerating their absence.
 *
 * An unreadable or invalid config is treated as absent rather than fatal: it is
 * a convenience file, and letting a stray comma in it block every run on the
 * machine would make the convenience a liability.
 */
export function readGlobalConfig(): GlobalConfig | undefined {
  let raw: GlobalConfig | undefined;
  try {
    raw = readSecureJson<GlobalConfig>(configPath());
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;

  if (raw.defaultModelSet && !validateModelSet(raw.defaultModelSet).ok) {
    const { defaultModelSet: _invalid, ...rest } = raw;
    return rest as GlobalConfig;
  }
  return raw;
}
