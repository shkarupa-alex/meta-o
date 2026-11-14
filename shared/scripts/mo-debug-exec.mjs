/**
 * Read the JavaScript program a Codex `exec` tool call ran, without running it.
 *
 * Newer Codex wraps its tools in one `exec` call whose input is a JavaScript
 * module calling `tools.exec_command(...)` and friends. The commands live in
 * that program text, and what came back is one shared result. A command found
 * in the text is not yet a command that ran: a branch may be skipped, a
 * function never called, an exception may stop the script first. So the
 * program is parsed with `acorn`, a mature JavaScript parser, never evaluated,
 * and only a closed set of straight-line forms is read as "these calls ran in
 * this order"; anything else is reported as such instead of being guessed at.
 * A hand-written JavaScript reader would be one more tokenizer that grows with
 * every new shape, which is what §A-DIAGNOSTICS-01 rejects for shell text.
 *
 * Implements §A-DIAGNOSTICS-01.
 */

import { parse } from "acorn";

// A program that names a Meta-O helper script or an installed skill file
// anywhere in its text may run or read one, even when the command is assembled
// at run time. The authored sources under `src/skills/` are no install.
const META_O_MARK =
  /(?<![\w-])mo-[a-z0-9]+(?:-[a-z0-9]+)*\.mjs|(?<!src\/)skills\/mo-[a-z0-9]+(?:-[a-z0-9]+)*\/SKILL\.md/u;
const OUTPUT_HEADER =
  /^Script (completed|running with cell ID (\S+)|failed)\n(?:[^\n]*\n)*?Output:\n/u;
const ABORTED = /^aborted by user\b/u;

const UNSUPPORTED = Symbol("unsupported");

/**
 * The value of a literal argument, or UNSUPPORTED. Only what needs no
 * evaluation counts: strings, numbers, booleans, arrays and objects of them,
 * and template strings without substitutions.
 */
function literal(node) {
  switch (node?.type) {
    case "Literal":
      return ["string", "number", "boolean"].includes(typeof node.value) ? node.value : UNSUPPORTED;
    case "TemplateLiteral":
      return node.expressions.length === 0 ? node.quasis[0].value.cooked : UNSUPPORTED;
    case "UnaryExpression":
      return node.operator === "-" && typeof node.argument?.value === "number"
        ? -node.argument.value
        : UNSUPPORTED;
    case "ArrayExpression": {
      const values = node.elements.map(literal);
      return values.includes(UNSUPPORTED) ? UNSUPPORTED : values;
    }
    case "ObjectExpression":
      return objectLiteral(node);
    default:
      return UNSUPPORTED;
  }
}

function objectLiteral(node) {
  const value = {};
  for (const property of node.properties) {
    if (property.type !== "Property" || property.kind !== "init") return UNSUPPORTED;
    if (property.computed || property.method || property.shorthand) return UNSUPPORTED;
    const key = property.key.type === "Identifier" ? property.key.name : property.key.value;
    const nested = literal(property.value);
    if (typeof key !== "string" || nested === UNSUPPORTED) return UNSUPPORTED;
    value[key] = nested;
  }
  return value;
}

/** `tools.<name>(<literal>?)`, or null for any other expression. */
function toolCall(node) {
  if (node?.type !== "CallExpression" || node.optional) return null;
  const callee = node.callee;
  if (callee.type !== "MemberExpression" || callee.computed || callee.optional) return null;
  if (callee.object.type !== "Identifier" || callee.object.name !== "tools") return null;
  if (callee.property.type !== "Identifier" || node.arguments.length > 1) return null;
  const argument = node.arguments.length === 0 ? undefined : literal(node.arguments[0]);
  return { tool: callee.property.name, argument, start: node.start };
}

/** `await tools.<name>(…)` whose argument needs no evaluation, or null. */
function awaitedCall(node) {
  const call = node?.type === "AwaitExpression" ? toolCall(node.argument) : null;
  return call && call.argument !== UNSUPPORTED ? call : null;
}

/** `text(x)` or `console.log(x)`: the statement appends one output item. */
function emitted(node) {
  if (node?.type !== "CallExpression" || node.arguments.length !== 1 || node.optional) return null;
  const callee = node.callee;
  const text = callee.type === "Identifier" && callee.name === "text";
  const log =
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "console" &&
    callee.property.name === "log";
  return text || log ? node.arguments[0] : null;
}

/**
 * Which call one emitted argument shows: the awaited call itself, a name bound
 * to one, or one plain property of that name such as `r.output`.
 */
function emittedCall(argument, program) {
  const direct = awaitedCall(argument);
  if (direct) return { add: direct };
  const name =
    argument.type === "Identifier"
      ? argument.name
      : argument.type === "MemberExpression" &&
          !argument.computed &&
          argument.object.type === "Identifier"
        ? argument.object.name
        : null;
  if (name === null || !program.bound.has(name)) return null;
  return { index: program.bound.get(name) };
}

function readExpression(expression, program) {
  const call = awaitedCall(expression);
  if (call) {
    program.calls.push(call);
    return true;
  }
  const argument = emitted(expression);
  const shown = argument ? emittedCall(argument, program) : null;
  if (!shown) return false;
  if (shown.add) {
    program.calls.push(shown.add);
    program.emissions.push(program.calls.length - 1);
  } else program.emissions.push(shown.index);
  return true;
}

function readDeclaration(statement, program) {
  if (!["const", "let"].includes(statement.kind) || statement.declarations.length !== 1) {
    return false;
  }
  const [declarator] = statement.declarations;
  if (declarator.id.type !== "Identifier" || program.bound.has(declarator.id.name)) return false;
  const call = awaitedCall(declarator.init);
  if (call) {
    program.calls.push(call);
    program.bound.set(declarator.id.name, program.calls.length - 1);
    return true;
  }
  // `const x = text(await tools.y())` binds x to text's own undefined.
  const argument = emitted(declarator.init);
  const inner = argument ? awaitedCall(argument) : null;
  if (!inner) return false;
  program.calls.push(inner);
  program.emissions.push(program.calls.length - 1);
  program.bound.set(declarator.id.name, -1);
  return true;
}

function readStatement(statement, program) {
  if (statement.type === "EmptyStatement") return true;
  if (statement.type === "ExpressionStatement")
    return readExpression(statement.expression, program);
  if (statement.type === "VariableDeclaration") return readDeclaration(statement, program);
  return false;
}

/** Every `tools.<name>(...)` in the tree, in source order, for a program out of form. */
function anyCalls(node, found = []) {
  if (node === null || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const child of node) anyCalls(child, found);
    return found;
  }
  if (typeof node.type !== "string") return found;
  const call = toolCall(node);
  if (call) found.push(call);
  for (const [key, child] of Object.entries(node)) {
    if (key !== "type" && child !== null && typeof child === "object") anyCalls(child, found);
  }
  return found;
}

/**
 * §A-DIAGNOSTICS-01 reads which tools one `exec` program calls, unevaluated.
 *
 * A program is `supported` only when every top-level statement is one of the
 * closed forms `await tools.<name>(<literal>)`, `text(await tools.<name>(…))`,
 * `const|let <id> = await tools.<name>(…)` (also wrapped in `text(…)`) and
 * `console.log|text(<id>)` or `(<id>.<property>)`, with literal arguments only.
 * Then the calls ran in source order unless the script failed. Any other
 * statement — a condition, a loop, a function, `try`, `Promise.all`, a
 * computed argument — makes the whole program unsupported, and the calls are
 * only found in its text. `perCall` says every call is shown exactly once, in
 * order, by its own output item, which is what lets items be matched to calls.
 *
 * @param {string} source the program text exactly as recorded
 * @returns {{supported: boolean, calls: {tool: string, argument: unknown}[],
 *   perCall: boolean, shown: boolean[], marked: boolean}} what the program
 *   text proves; `shown[i]` says an output item shows call `i`
 */
export function readProgram(source) {
  const text = String(source ?? "");
  const marked = META_O_MARK.test(text);
  let tree;
  try {
    tree = parse(text, { ecmaVersion: "latest", sourceType: "module" });
  } catch {
    return { supported: false, calls: [], perCall: false, shown: [], marked };
  }
  const program = { calls: [], emissions: [], bound: new Map() };
  const supported = tree.body.every((statement) => readStatement(statement, program));
  if (!supported) {
    const calls = anyCalls(tree.body).sort((left, right) => left.start - right.start);
    const shown = calls.map(() => false);
    return { supported, calls: calls.map(publicCall), perCall: false, shown, marked };
  }
  const perCall =
    program.emissions.length === program.calls.length &&
    program.emissions.every((index, order) => index === order);
  const shown = program.calls.map((_, index) => program.emissions.includes(index));
  return { supported, calls: program.calls.map(publicCall), perCall, shown, marked };
}

function publicCall({ tool, argument }) {
  return { tool, argument: argument === UNSUPPORTED ? undefined : argument };
}

function itemText(item) {
  if (typeof item === "string") return item;
  return typeof item?.text === "string" ? item.text : "";
}

/**
 * §A-DIAGNOSTICS-01 reads one result of an `exec` cell or of its `wait`.
 *
 * Codex opens the result with `Script completed`, `Script failed` or `Script
 * running with cell ID <id>`, then `Output:`; a content array keeps one item
 * per `text(...)` after that header, a plain string runs them together. A
 * result without that header, such as a `notify(...)` note, settles nothing;
 * `aborted by user` ends the cell as failed.
 *
 * @param {unknown} output the recorded `output` field
 * @returns {{status: "completed"|"failed"|"running"|null, cell: string|null,
 *   items: string[]}} the cell state and the output items after the header
 */
export function readExecOutput(output) {
  const parts = Array.isArray(output) ? output.map(itemText) : [itemText(output)];
  const first = parts[0] ?? "";
  if (ABORTED.test(first)) return { status: "failed", cell: null, items: [] };
  const header = OUTPUT_HEADER.exec(first);
  if (!header) return { status: null, cell: null, items: parts.filter((part) => part !== "") };
  const status = header[1] === "completed" || header[1] === "failed" ? header[1] : "running";
  const rest = first.slice(header[0].length);
  const items = [...(rest === "" ? [] : [rest]), ...parts.slice(1)];
  return { status, cell: header[2] ?? null, items };
}
