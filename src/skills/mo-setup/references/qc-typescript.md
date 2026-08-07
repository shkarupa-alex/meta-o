# TypeScript QC profile

Mature tools with a project-owned config. Preserve what already works.

## Candidates

| Gate             | Tool                                                              | Notes                                                                                                    |
| ---------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| types            | **`tsc --noEmit`** / **`tsc -b`**, or the framework's own checker | this stays the type source of truth                                                                      |
| lint             | **ESLint** flat config + **typescript-eslint** typed rules        | typed lint is the point; untyped lint catches much less                                                  |
| tests            | whatever the project already uses                                 | see below                                                                                                |
| formatting       | **Prettier**                                                      | kept separate from correctness                                                                           |
| purpose coverage | **`eslint-plugin-jsdoc`**                                         | mechanical presence and shape only                                                                       |
| speed            | **Oxlint**                                                        | may accelerate typed lint; it does **not** replace `tsc`, and it does not cover the JSDoc and size rules |

Test runner: a greenfield Node-only project may use `node:test`. Choose Vitest
for Vite, browser, DOM or richer mocking needs. An existing Jest or Vitest setup
is **not** migrated for the sake of uniformity.

## Wiring

```make
mo-typecheck:
	npx --no-install tsc -p tsconfig.json --noEmit

mo-lint:
	npx --no-install eslint .
	npx --no-install prettier --check .

mo-test:
	npm test

mo-qc: mo-typecheck mo-lint mo-test
```

`prettier --write` rewrites and must stay out of `mo-qc`; `prettier --check`
judges and belongs in it.

## Starting thresholds

Configurable, and meant to be argued with once per project:

| Thing                   | Start at          |
| ----------------------- | ----------------- |
| file length             | 400–500 lines     |
| function length         | 60–80 lines       |
| cyclomatic complexity   | warn 10, error 15 |
| statements per function | 30–40             |
| nesting depth           | 4                 |

Generated files, declaration files, migrations and config get explicit
exceptions. Tests may be looser. Those exceptions live in the ESLint config
where they can be read, not in a convention people remember differently.

Do not create a brownfield baseline automatically. A baseline is admitted only if
adoption is otherwise practically impossible, and it is a decision with a
recorded reason.

## JSDoc as a purpose gate

`eslint-plugin-jsdoc` checks presence and shape — exported symbols, classes,
module boundaries and **every overload declaration**. Whether the text means
anything is a reviewer's judgement; see `purpose-and-architecture.md`.

```js
// eslint.config.js — starting point
import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";

export default tseslint.config(
  ...tseslint.configs.recommendedTypeChecked,
  jsdoc.configs["flat/recommended-typescript"],
  {
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "max-lines": ["error", 500],
      "max-lines-per-function": ["error", 80],
      complexity: ["error", 15],
      "max-depth": ["error", 4],
      "jsdoc/require-jsdoc": [
        "error",
        { publicOnly: true, require: { ClassDeclaration: true, FunctionDeclaration: true } },
      ],
    },
  },
);
```
