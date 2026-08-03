/**
 * Marking, in a search result, the words that were searched for.
 *
 * A list of results is read by scanning rather than by reading: the question is
 * which of these is the message I remember, and the answer is wherever the term
 * actually landed. Rocket.Chat's search returns the messages and nothing about
 * where inside them the match was, so the term is found again here.
 */

/**
 * Rocket.Chat's default provider reads `key:value` pairs out of the same box as
 * the words — `from:alice`, `has:star`, `is:pinned`, `before:2024-01-01`. Those
 * choose which messages come back rather than describe what is inside them, so
 * a result holds nothing for them to mark: taking `is:pinned` for words would
 * paint `is` across every message that happens to contain it.
 */
const OPERATOR = /^-?\w+:/;

/** Words, and runs in quotes that are one phrase however many spaces they hold. */
const TOKEN = /"([^"]+)"|(\S+)/g;

/** The characters that mean something to a regular expression, and so must not. */
const SPECIAL = /[.*+?^${}()|[\]\\]/g;

/**
 * What is worth marking in the results for `query`: its words, without the
 * operators that never appear in a message body.
 */
export const searchTerms = (query: string): string[] => {
  const terms: string[] = [];

  for (const [, quoted, word] of query.matchAll(TOKEN)) {
    // A quoted run is taken as written. Someone who types `"from:alice"` is
    // looking for that text in a message, which is the whole point of quoting.
    const term = quoted ?? word;
    if (term === undefined || (quoted === undefined && OPERATOR.test(term))) continue;

    terms.push(term);
  }

  // Longest first: where two terms match in the same place the alternation
  // takes the first that fits, and the fuller match is the one worth showing.
  return [...new Set(terms)].sort((a, b) => b.length - a.length);
};

/** One expression for every term, built once per search rather than per message. */
const patternFor = (terms: readonly string[]): RegExp | null =>
  terms.length === 0 ? null : new RegExp(terms.map((term) => term.replace(SPECIAL, '\\$&')).join('|'), 'gi');

export type HighlightSegment = { kind: 'text' | 'match'; value: string };

/**
 * Splits a run of text into what matched and what lies between.
 *
 * Empty when nothing matched, so a caller can leave the text as the single node
 * it already is rather than rebuild it into an identical one.
 */
const splitAt = (value: string, pattern: RegExp): HighlightSegment[] => {
  const segments: HighlightSegment[] = [];
  let plainFrom = 0;

  for (const match of value.matchAll(pattern)) {
    const [found] = match;
    if (found === '' || match.index === undefined) continue;

    if (match.index > plainFrom) segments.push({ kind: 'text', value: value.slice(plainFrom, match.index) });
    segments.push({ kind: 'match', value: found });
    plainFrom = match.index + found.length;
  }

  if (segments.length === 0) return [];
  if (plainFrom < value.length) segments.push({ kind: 'text', value: value.slice(plainFrom) });

  return segments;
};

/** The same, for callers holding terms rather than an expression. */
export const splitHighlights = (value: string, terms: readonly string[]): HighlightSegment[] => {
  const pattern = patternFor(terms);
  return pattern ? splitAt(value, pattern) : [];
};

/** The subset of mdast this transform touches — see `underline.ts` for the same shape. */
interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: { hName?: string };
}

const toNodes = (value: string, pattern: RegExp): MdastNode[] =>
  splitAt(value, pattern).map((segment) =>
    segment.kind === 'text'
      ? { type: 'text', value: segment.value }
      : // `mark` is the element the language already has for this, and markdown
        // produces none of its own, so every one on the page came from here.
        { type: 'highlight', data: { hName: 'mark' }, children: [{ type: 'text', value: segment.value }] },
  );

/**
 * A remark plugin that wraps each occurrence of a search term in a `<mark>`.
 *
 * Visits `text` nodes only, like the transforms beside it, so a term is not
 * marked inside a fenced block or a code span — the delimiters there are the
 * author's subject matter, and splitting the run would be the one place a match
 * changes what the message says rather than only how it is painted.
 *
 * Runs after the mention, underline and emoji transforms and before the line
 * breaks: those match within a single run of text, and cutting one in half
 * first would hide a `++underline++` or a `:shortcode:` from the transform that
 * was about to resolve it.
 */
export const makeRemarkHighlight = (terms: readonly string[]) => () => (tree: unknown) => {
  const pattern = patternFor(terms);
  if (!pattern) return;

  const walk = (node: MdastNode): void => {
    if (!node.children) return;

    const next: MdastNode[] = [];

    for (const child of node.children) {
      if (child.type === 'text' && child.value !== undefined) {
        const replaced = toNodes(child.value, pattern);

        if (replaced.length > 0) {
          next.push(...replaced);
          continue;
        }
      }

      walk(child);
      next.push(child);
    }

    node.children = next;
  };

  walk(tree as MdastNode);
};
