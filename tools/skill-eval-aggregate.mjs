/** Build the deterministic §A-EVAL-01 identity and aggregate projections. */

/** §A-EVAL-01 serializes JSON semantics independently of object insertion order. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** §A-EVAL-01 rejects a repeated actor/harness identity for one case coordinate. */
export function registerCompositeIdentities(envelope, seen) {
  const composite = canonicalJson({ requested: envelope.requested, harness: envelope.harness });
  for (const result of envelope.results ?? []) {
    const identity = `${envelope.skillRevision}:${result.caseId}:${composite}`;
    if (seen.has(identity)) {
      throw new Error(`${envelope.skill}: duplicate composite identity for ${result.caseId}`);
    }
    seen.add(identity);
  }
}

/** §A-EVAL-01 groups case coordinates in the spec-owned fixed profile order. */
export function buildEvidenceAggregate(envelopes, matrixOrder) {
  const groups = new Map();
  for (const envelope of envelopes) {
    for (const result of envelope.results) {
      const key = `${envelope.skillRevision}:${result.caseId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          skillRevision: envelope.skillRevision,
          caseId: result.caseId,
          coordinates: [],
        });
      }
      groups.get(key).coordinates.push({
        matrixProfile: envelope.matrixProfile,
        status: result.verdict.toLowerCase(),
      });
    }
  }
  return [...groups.values()]
    .sort((left, right) =>
      `${left.skillRevision}/${left.caseId}`.localeCompare(
        `${right.skillRevision}/${right.caseId}`,
        "en",
      ),
    )
    .map((group) => ({
      ...group,
      coordinates: group.coordinates.sort(
        (left, right) =>
          matrixOrder.indexOf(left.matrixProfile) - matrixOrder.indexOf(right.matrixProfile),
      ),
    }));
}
