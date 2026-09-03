/**
 * Prove that every supported exported declaration reaches the purpose gate.
 *
 * Protects §A-MEMORY-01.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { ESLint } from "eslint";

const eslint = new ESLint({ cwd: process.cwd() });

async function messages(source) {
  const [result] = await eslint.lintText(source, { filePath: "tools/purpose-fixture.mjs" });
  return result.messages;
}

test("inline exported functions require a purpose decision", async () => {
  const result = await messages("/** Loads a value. */\nexport function load() { return 1; }\n");
  assert.ok(result.some(({ ruleId }) => ruleId === "jsdoc/match-description"));
});

test("trailing export specifiers cannot bypass declaration inspection", async () => {
  const result = await messages("function load() { return 1; }\nexport { load };\n");
  assert.ok(result.some(({ ruleId }) => ruleId === "no-restricted-syntax"));
});

test("an exported expression cannot escape the gate by not being a declaration", async () => {
  for (const source of [
    "export const load = () => 1;\n",
    "export const load = function () { return 1; };\n",
    "export default () => 1;\n",
  ]) {
    const result = await messages(source);
    assert.ok(
      result.some(({ ruleId }) => ruleId === "jsdoc/require-jsdoc"),
      source,
    );
  }
  const described = await messages("/** Loads a value. */\nexport const load = () => 1;\n");
  assert.ok(described.some(({ ruleId }) => ruleId === "jsdoc/match-description"));
  const decided = await messages(
    "/** §A-MEMORY-01 keeps the fixture tied to its governing decision. */\n" +
      "export const load = () => 1;\n",
  );
  assert.deepEqual(
    decided.filter(({ ruleId }) =>
      new Set(["jsdoc/require-jsdoc", "jsdoc/match-description"]).has(ruleId),
    ),
    [],
  );
});

test("an inline export with a purpose decision passes the symbol rules", async () => {
  const result = await messages(
    "/** §A-MEMORY-01 keeps the fixture tied to its governing decision. */\n" +
      "export function load() { return 1; }\n",
  );
  assert.deepEqual(
    result.filter(({ ruleId }) =>
      new Set(["jsdoc/match-description", "no-restricted-syntax"]).has(ruleId),
    ),
    [],
  );
});
