/**
 * Keep JavaScript growth and public-purpose drift inside the deterministic gate.
 * Without these project-owned limits, the self-contained helpers and simulation
 * tests can grow past reviewable boundaries without any machine-readable stop.
 *
 * Implements §A-QUALITY-01.
 */

import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import globals from "globals";

const sizeRules = {
  complexity: ["error", 15],
  "max-depth": ["error", 4],
  "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
  "max-lines-per-function": [
    "error",
    { max: 80, skipBlankLines: true, skipComments: true, IIFEs: true },
  ],
};

export default [
  { ignores: ["node_modules/**", "skills/**"] },
  js.configs.recommended,
  {
    files: ["**/*.mjs"],
    plugins: { jsdoc },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      ...sizeRules,
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: { ClassDeclaration: true, FunctionDeclaration: true },
        },
      ],
    },
  },
  {
    files: ["shared/scripts/mo-models.mjs"],
    rules: {
      complexity: ["error", 20],
      "max-lines": ["error", { max: 1050, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["tools/build-skills.mjs"],
    rules: { complexity: ["error", 23] },
  },
  {
    files: ["tests/**/*.mjs"],
    rules: {
      complexity: ["error", 25],
      "max-depth": ["error", 5],
      "max-lines": ["error", { max: 1800, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": [
        "error",
        { max: 160, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
    },
  },
  {
    files: ["tests/provider-posture.test.mjs"],
    rules: {
      "max-lines-per-function": [
        "error",
        { max: 650, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
    },
  },
];
