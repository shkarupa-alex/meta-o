/**
 * Find the whole shell word that carries a credential in session text.
 *
 * A password given as a command-line argument is one shell word, and the shell
 * builds that word from adjacent bare, escaped, single- and double-quoted
 * segments: `pre" correct horse"post` is one argument. The same bytes can
 * also sit inside a string that encloses the command — `bash -c "…"`, or a
 * JSON string where every inner quote is escaped once more — and there the
 * quote after the password closes the enclosing string instead of opening a
 * segment. No single pattern tells the two apart, because the answer depends
 * on everything before the word; so this module reads the text left to right
 * and keeps the stack of open quotes, and each word is cut by the quote that
 * is actually open around it.
 *
 * A double quote's nesting level is the number of trailing one bits in the
 * count of backslashes before it: `"` is 0, `\"` is 1, `\\\"` is 2, and `\\"`
 * is an escaped backslash followed by a level-0 quote. A single quote escapes
 * nothing and stays at the level it opens in.
 *
 * Implements §A-DIAGNOSTICS-01.
 */

// Unquoted, these end a shell word; inside a quoted segment they are content.
const WORD_END = new Set([" ", "\t", "\n", "\r", ";", "&", "|", "<", ">", "(", ")", "`"]);

function backslashesBefore(text, at) {
  let count = 0;
  while (at - count - 1 >= 0 && text[at - count - 1] === "\\") count += 1;
  return count;
}

function trailingOnes(count) {
  let ones = 0;
  while (count & (1 << ones)) ones += 1;
  return ones;
}

/**
 * The quote token that starts at `at`, if any: `{kind, level, start, end}`,
 * where a double quote's token includes the backslashes that set its level.
 */
function quoteAt(text, at) {
  if (text[at] === "'") return { kind: "'", level: null, start: at, end: at + 1 };
  if (text[at] === "\\") {
    let run = 0;
    while (text[at + run] === "\\") run += 1;
    if (text[at + run] !== '"') return null;
    // Only the full run of backslashes is one token; a run that started
    // earlier belongs to the token at its own start.
    if (backslashesBefore(text, at) > 0) return null;
    return { kind: '"', level: trailingOnes(run), start: at, end: at + run + 1 };
  }
  if (text[at] === '"' && backslashesBefore(text, at) === 0) {
    return { kind: '"', level: 0, start: at, end: at + 1 };
  }
  return null;
}

const levelOf = (stack) => {
  const doubles = stack.filter((quote) => quote.kind === '"');
  return doubles.length === 0 ? 0 : doubles.at(-1).level + 1;
};

const closes = (open, token) =>
  token.kind === open.kind && (token.kind === "'" || token.level === open.level);

/**
 * §A-DIAGNOSTICS-01 reads the stack of quotes open at every position, once
 * from the start of the text. A double quote opens at the current level and closes the innermost
 * double quote of its own level; a single quote closes an open single quote
 * and otherwise opens one.
 *
 * @param {string} text session text
 * @returns {object[][]} the open quotes before each index
 */
export function quoteContexts(text) {
  const contexts = new Array(text.length + 1);
  let stack = [];
  let at = 0;
  while (at < text.length) {
    const token = quoteAt(text, at);
    if (!token) {
      contexts[at] = stack;
      at += 1;
      continue;
    }
    for (let index = at; index < token.end; index += 1) contexts[index] = stack;
    const top = stack.at(-1);
    if (top && closes(top, token)) stack = stack.slice(0, -1);
    else if (token.kind === "'" || token.level === levelOf(stack)) stack = [...stack, token];
    at = token.end;
  }
  contexts[text.length] = stack;
  return contexts;
}

/**
 * §A-DIAGNOSTICS-01 reads the shell word that starts at `start` in the quote
 * context `stack`.
 *
 * The word ends at unquoted whitespace or a shell separator, at the quote that
 * closes the innermost enclosing string, and at a quote of a shallower level,
 * which can only close an outer one. A quote at the word's own level opens a
 * segment that runs, spaces included, to its matching quote; a deeper double
 * quote is an escaped byte of the word. An unclosed segment runs to the end of
 * the text, which fails closed at a window edge.
 *
 * The first byte is the exception: a quote there always opens a segment. A
 * stray apostrophe in prose leaves a single quote open for the rest of the
 * text, and reading `'a b'` after it as a close would redact nothing.
 *
 * @param {string} text session text
 * @param {number} start index of the word's first byte
 * @param {object[]} stack quotes open around the word
 * @returns {{end: number, segments: {open: string, close: string, start: number, end: number}[]}}
 *   the end index and the quoted segments, so a caller can keep the quotes of a
 *   word that is exactly one of them
 */
export function shellWord(text, start, stack) {
  const context = { enclosing: stack.at(-1) ?? null, level: levelOf(stack) };
  const segments = [];
  let at = start;
  while (at < text.length) {
    const step = wordStep(text, at, at === start, context);
    if (step === null) break;
    if (step.segment) segments.push(step.segment);
    at = step.next;
  }
  return { end: at, segments };
}

/**
 * One step through a word: where the word goes on after the byte at `at`, and
 * the quoted segment that step read, or null where the word ends.
 */
function wordStep(text, at, first, { enclosing, level }) {
  const token = quoteAt(text, at);
  if (!token) {
    if (WORD_END.has(text[at])) return null;
    // An escaped byte, `\ ` included, stays inside the word.
    return { next: at + (text[at] === "\\" && at + 1 < text.length ? 2 : 1) };
  }
  if (!first && enclosing && closes(enclosing, token)) return null;
  if (first || token.kind === "'" || token.level === level) {
    const end = segmentEnd(text, token);
    const open = text.slice(token.start, token.end);
    return {
      next: end.at,
      segment: { open, close: end.closed ? open : "", start: at, end: end.at },
    };
  }
  // A deeper double quote is an escaped byte; a shallower one closes an outer string.
  return token.level > level ? { next: token.end } : null;
}

/** Where a quoted segment opened by `token` ends: after its matching quote, or at the end. */
function segmentEnd(text, token) {
  let at = token.end;
  while (at < text.length) {
    const inner = quoteAt(text, at);
    if (inner && closes(token, inner)) return { at: inner.end, closed: true };
    at = inner ? inner.end : at + 1;
  }
  return { at: text.length, closed: false };
}
