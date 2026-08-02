/**
 * §M-MARKDOWN — The one Markdown reader both gates share.
 *
 * Implements §A-CAUSAL-KNOWLEDGE. Two blocking gates read Markdown structure —
 * the knowledge chain and the production E2E contract — and they had two
 * different readers. The contract's was careful and CommonMark-accurate; the
 * knowledge chain's toggled a boolean on any line starting with three backticks
 * or three tildes, which is wrong in both directions and silently so.
 *
 * §10 asks for a parser that works from structural headings and anchors rather
 * than from a search for similar-looking lines, and a gate that loses an anchor
 * to a nested fence is doing the second while claiming the first.
 */

/**
 * §M-MARKDOWN — Track fenced code blocks across a document, line by line.
 *
 * Returns a predicate: `true` means the line is part of a fence — its opener,
 * its content, or its closer — and carries no document structure.
 *
 * The rules are CommonMark's, not an approximation. A closing fence must use
 * the same character as its opener, be at least as long, and carry no info
 * string; otherwise ```` ```` ```` wrapped around a ```` ``` ```` example ends
 * at the inner line and everything after it is read as prose. A naive toggle
 * gets that backwards *and* inverts the rest of the document with it: with the
 * knowledge gate, an architecture anchor that fell inside the phantom fence
 * vanished from the index — its own "must cite a §B" check never ran, and any
 * §M citing it failed for referencing an anchor that does exist.
 *
 * Up to three spaces of indentation open a fence, the same allowance headings
 * get, so a tab-indented code block does not open one that never closes.
 */
export function fenceScanner(): (line: string) => boolean {
  let fence: { marker: string; length: number } | undefined;

  return (line: string): boolean => {
    if (fence !== undefined) {
      const closing = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (closing && closing[1]![0] === fence.marker && closing[1]!.length >= fence.length) {
        fence = undefined;
      }
      return true;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (opening) {
      fence = { marker: opening[1]![0]!, length: opening[1]!.length };
      return true;
    }
    return false;
  };
}
