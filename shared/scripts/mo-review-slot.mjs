/**
 * Name the private directories of one review pair.
 *
 * §A-RESPONSE-03 links two reviewer slots into a pair by nothing but the names
 * `namespace` gives their directories, `mo-review-<pair_id>-<slot>-<random>`,
 * and names the one pair directory after the same id. The handoff helper
 * creates and reads those names, and the input helper copies a specification
 * into a slot by them (§A-REVIEW-05); both read the grammar here, so the two
 * can never disagree about which directory belongs to which slot.
 */

/** §A-RESPONSE-03 the pair id `namespace` prints: twelve lowercase hex digits. */
export const PAIR_ID = /^[a-f0-9]{12}$/u;

// `mkdtemp` appends six random characters to the prefix.
const SLOT_DIR = /^mo-review-([a-f0-9]{12})-([AB])-[A-Za-z0-9]{6}$/u;

/** §A-RESPONSE-03 the `mkdtemp` prefix of one slot directory of a pair. */
export const slotDirPrefix = (pairId, slot) => `mo-review-${pairId}-${slot}-`;

/**
 * §A-RESPONSE-03 the one pair directory a pair id may ever have.
 *
 * Fixed rather than random: its existence is the record that this pair was
 * already published, so a second `pair` call finds it and refuses instead of
 * minting a second pair from the same two slots.
 */
export const pairDirName = (pairId) => `mo-review-${pairId}-pair`;

/** §A-RESPONSE-03 the pair id and slot letter a slot directory's base name carries, or `null`. */
export function slotDirName(name) {
  const match = SLOT_DIR.exec(name);
  return match === null ? null : { pairId: match[1], slot: match[2] };
}
