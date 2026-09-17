/**
 * Own the closed values an approved skill-eval testing profile may take.
 *
 * §A-EVAL-01 needs two different closed values per role — what a user may store
 * and what the provider must actually have executed — and they drift apart the
 * moment a catalogue alias is stored. Keeping them here, away from settings and
 * catalogue plumbing, means a change to one of them is a change to one file.
 *
 * This module takes an already parsed selection rather than a string so it never
 * has to know which routes exist; that knowledge belongs to the settings layer,
 * and importing it back would make the two modules circular.
 */

// §A-EVAL-01: an approved testing profile closes two different values, because
// they can drift apart. `id` is what a user may store in settings; `effectiveId`
// is what the provider must actually have executed. A substring test on the
// generation digit also matches the tail of a release date, which is how
// `claude-sonnet-4-5-20250929` and `deepseek-v3-4-flash` passed as the approved
// generation, so both are closed values rather than prefixes.
//
// Splitting them is what lets the Claude coordinate be stored as the catalogue
// alias the owner requires while the exact generation stays closed. The alias is
// the weaker half on purpose: it says nothing about which model runs, so the
// invariant moves to `effectiveId`, where it is actually needed. A drifting
// alias then changes `effectiveId` without touching `id`, and that difference is
// exactly what has to stop the run instead of migrating itself.
const TESTING_PROFILES = {
  testClaude: {
    route: "claude",
    effort: "low",
    id: /^sonnet$/u,
    effectiveId: /^claude-sonnet-5$/u,
    effectiveRequirement: "claude-sonnet-5",
    requirement: "testClaude must be claude/sonnet/low resolving to claude-sonnet-5",
  },
  testCodex: {
    route: "codex",
    effort: "low",
    id: /^gpt-5\.6-luna$/u,
    effectiveId: /^gpt-5\.6-luna$/u,
    effectiveRequirement: "gpt-5.6-luna",
    requirement: "testCodex must be codex/gpt-5.6-luna/low",
  },
  testCodexDesired: {
    route: "codex",
    effort: "max",
    id: /^gpt-5\.6-luna$/u,
    effectiveId: /^gpt-5\.6-luna$/u,
    effectiveRequirement: "gpt-5.6-luna",
    requirement: "testCodexDesired must be codex/gpt-5.6-luna/max",
  },
  testOpenCodeDesired: {
    route: "opencode",
    effort: "low",
    matches: isApprovedQwen38_27bModel,
    effectiveMatches: isApprovedQwen38_27bModel,
    effectiveRequirement: "qwen3.8-27b",
    requirement: "testOpenCodeDesired must be opencode/<provider>/qwen3.8-27b/low",
  },
};

/** §A-EVAL-01 recognizes only the approved closed Qwen 3.8 27B testing id. */
function isApprovedQwen38_27bModel(model) {
  const identifier = String(model).split("/").at(-1)?.toLowerCase() ?? "";
  return identifier === "qwen3.8-27b";
}

/** §A-EVAL-01 rejects testing selections outside the approved low-cost routes. */
export function testingProfileError(role, selection) {
  const profile = TESTING_PROFILES[role];
  if (!profile) return null;
  // An OpenCode selection carries `provider/model`; the id is the last segment.
  const identifier = selection.model.split("/").pop() ?? "";
  const namesApprovedProfile = profile.matches
    ? profile.matches(identifier)
    : profile.id.test(identifier.toLowerCase());
  if (selection.route !== profile.route || selection.effort !== profile.effort) {
    return profile.requirement;
  }
  return namesApprovedProfile ? null : profile.requirement;
}

/**
 * §A-EVAL-01 judges the model that actually ran, not the one written down.
 *
 * `testingPolicyError` guards the settings record, which under U7 may legally be
 * a catalogue alias. Only this check can notice that the alias dereferenced into
 * a different generation, so it returns a typed reason instead of a generic
 * unavailability: the two need different answers, and the literal is never
 * migrated automatically to match what was observed.
 */
export function testingEffectiveIdentityError(role, requestedModel, effectiveModel) {
  const profile = TESTING_PROFILES[role];
  if (!profile) return null;
  const identifier = String(effectiveModel).split("/").pop() ?? "";
  const accepted = profile.effectiveMatches
    ? profile.effectiveMatches(identifier)
    : profile.effectiveId.test(identifier.toLowerCase());
  if (accepted) return null;
  return (
    `alias_resolution_changed: ${role} requested ${requestedModel} and ` +
    `${effectiveModel} ran, but the approved effective id is ${profile.effectiveRequirement}`
  );
}
