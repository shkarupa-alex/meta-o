/**
 * Own caller-frozen eval inputs and native execution observations.
 *
 * Keeping these records outside actor evidence prevents a model from
 * self-attesting the identity of the process that evaluated it (§A-EVAL-01).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function coordinate(envelope) {
  return `${envelope.skill}:${envelope.matrixProfile}:${envelope.repetition}`;
}

function lookup(records, envelope, label) {
  const key = coordinate(envelope);
  const value = records instanceof Map ? records.get(key) : records?.[key];
  if (value === undefined || value === null) throw new Error(`${key}: ${label} is missing`);
  return value;
}

/** §A-EVAL-01 reads the digest frozen before actor execution. */
export function expectedDigest(records, envelope) {
  const digest = lookup(records, envelope, "caller-frozen evaluation digest");
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw new Error(`${coordinate(envelope)}: caller-frozen evaluation digest is missing`);
  }
  return digest;
}

/** §A-EVAL-01 reads native execution facts observed independently by the caller. */
export function expectedExecution(records, envelope) {
  const execution = lookup(records, envelope, "caller-owned execution observation");
  if (typeof execution !== "object" || Array.isArray(execution)) {
    throw new Error(`${coordinate(envelope)}: caller-owned execution observation is missing`);
  }
  return execution;
}

/** §A-EVAL-01 writes one exclusive prompt expectation before model execution. */
export function writeExpectation(path, envelope) {
  if (!path) throw new Error("--expectations-out is required to freeze prompt inputs");
  const record = {
    coordinate: coordinate(envelope),
    evaluationDigest: envelope.execution.evaluationDigest,
  };
  writeFileSync(resolve(path), `${JSON.stringify([record], null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
}

/** §A-EVAL-01 loads the two caller-owned binding sets used by the live validator. */
export function readExpectedBindings(expectationsPath, executionsPath) {
  const expectations = JSON.parse(readFileSync(resolve(expectationsPath), "utf8"));
  const executions = JSON.parse(readFileSync(resolve(executionsPath), "utf8"));
  if (!Array.isArray(expectations)) throw new Error("--expectations must contain an array");
  if (!Array.isArray(executions)) {
    throw new Error("--execution-observations must contain an array");
  }
  return {
    expectedDigests: Object.fromEntries(
      expectations.map(({ coordinate: key, evaluationDigest }) => [key, evaluationDigest]),
    ),
    expectedExecutions: Object.fromEntries(
      executions.map(({ coordinate: key, execution }) => [key, execution]),
    ),
  };
}
