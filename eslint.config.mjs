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
  { ignores: ["node_modules/**", "skills/**", "dist/**", "templates/**"] },
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
          // An exported arrow or function expression is as public as a
          // declaration, and leaving it out made the gate depend on which
          // syntax the author happened to pick.
          require: {
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
          },
        },
      ],
      "jsdoc/match-description": [
        "error",
        {
          contexts: [
            "ExportNamedDeclaration > FunctionDeclaration",
            "ExportDefaultDeclaration > FunctionDeclaration",
            "ExportNamedDeclaration > ClassDeclaration",
            "ExportDefaultDeclaration > ClassDeclaration",
            "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression",
            "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > FunctionExpression",
            "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ClassExpression",
            "ExportDefaultDeclaration > ArrowFunctionExpression",
            "ExportDefaultDeclaration > FunctionExpression",
            "ExportDefaultDeclaration > ClassExpression",
          ],
          matchDescription: "(?:^|\\s)§A-[A-Z](?:[A-Z0-9]|-)*-[0-9]{2}(?=$|\\s|\\.|,|;|:|\\))",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportNamedDeclaration[source=null] > ExportSpecifier",
          message:
            "Use an inline named export so the symbol-level purpose gate can inspect its declaration.",
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
