# Purpose and architecture contract

This file has one source owner — `shared/references/purpose-and-architecture.md`
in the meta-o repository. The copies inside `mo-review` and `mo-setup` are
produced mechanically. Never edit a copy.

Linters check that purpose is _present_ and _shaped_ correctly. Only a reviewer
can check that it _means_ something. Both halves are required; neither
substitutes for the other.

---

## 1. What a purpose actually says

A purpose explains:

- why this symbol or module exists;
- which invariant, responsibility or business role it serves;
- what would become wrong or redundant if it were deleted.

Restating the implementation is **not** a purpose. `"Loops over items and
returns the sum"` describes what a reader can already see. `"Totals a basket
without tax, because tax depends on the shipping address, which is not known
here"` says why the function exists and why it is not the obvious one-liner.

## 2. Where purpose is mandatory

Mechanically required, and enforced by the linter:

- first-party modules;
- public / exported APIs;
- classes;
- architecture boundaries;
- **every overload declaration**. Documenting the implementation signature does
  not exempt the declarations: a caller resolves against a declaration, and an
  undocumented overload is exactly the one whose distinct meaning is being lost.

Non-trivial private and test symbols are covered in proportion to risk. Trivial
accessors, short closures and generated or vendored glue get no ritual prose;
those exemptions live in the linter's config, where they can be read and
audited, not in a convention people remember differently.

## 3. What the reviewer checks

Presence is the linter's problem. The reviewer asks:

- does this purpose survive deletion of the body — would it still tell you what
  to write?
- does it name a reason, a constraint or a rejected alternative, or does it
  paraphrase the code?
- is it still true after this change, or was it written for an earlier design?
- for an overload: does it say what distinguishes _this_ signature?

A purpose that restates the implementation is a finding, not a style
preference. The reasoning is the whole contract in one sentence: what
consistently gets lost between sessions is the hidden intent — the business
reason, the constraint, the non-obvious trade-off, the forbidden alternative,
the edge case — and the code itself is the one thing a model can already read.

## 4. The architecture contract

Every review checks, proportionally to the size of the change:

- responsibility boundaries — does each part still have one reason to change?
- allowed dependencies — did this change add an edge the architecture forbids?
- independently changeable parts — can these still move separately?
- god files and god objects;
- excess coupling introduced for convenience;
- fit to the architecture that already exists, rather than a second one growing
  beside it;
- whether stale branches, dead abstractions and superseded paths can now be
  deleted.

And, always, the blunt question: **"why does this entity need to exist at
all?"** A component that survives that question is worth reviewing further; one
that does not is the cheapest finding anybody will ever write.

## 5. Documentation that is a program's input

If Markdown has to be parsed programmatically, use a real AST library found
through `mo-reuse`. A regex Markdown parser is not acceptable — it is the
classic case of a home-grown checker that is wrong in ways nobody owns.
