/**
 * Newlines, kept the way they were typed.
 *
 * Markdown was written for documents, where line endings are the author's own
 * business and the renderer is free to reflow: a single `\n` inside a paragraph
 * is a *soft* break that comes out as a space, and the blank lines between two
 * paragraphs are thrown away once the paragraph boundary is known. In a chat box
 * neither is true. Someone who presses Shift+Enter is drawing a line — a list of
 * names, a stack trace, a signature — and the room has to show it back exactly
 * as many lines as they wrote, or it is not their message any more.
 *
 * So every newline in the source becomes a break in the tree: the ones inside a
 * paragraph as `<br>` between the runs of text, and the ones the parser dropped
 * between blocks rebuilt from the positions it recorded.
 */

/** The subset of mdast this transform touches — same shape as `underline.ts`. */
interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  position?: { start: { line: number }; end: { line: number } };
}

/**
 * Parents whose children are blocks and whose gaps are therefore this
 * transform's to restore. `list` is deliberately absent: the space between two
 * items belongs to the list's own layout, and a `<br>` between `<li>`s is not
 * markup a browser will keep where it was put.
 */
const BLOCK_PARENTS = new Set(['root', 'blockquote', 'listItem']);

const newBreak = (): MdastNode => ({ type: 'break' });

/**
 * A run of text carrying newlines, split into the lines it was written as.
 *
 * Only `text` nodes are ever passed here, which is what keeps the newlines
 * inside a fenced block the block's own: those arrive as `code`, with their
 * value untouched and their whitespace already meaningful to the renderer.
 */
const toLines = (value: string): MdastNode[] | null => {
  if (!value.includes('\n')) return null;

  const nodes: MdastNode[] = [];

  value.split('\n').forEach((line, index) => {
    if (index > 0) nodes.push(newBreak());
    // A blank line contributes its break and no text: an empty `text` node
    // renders as nothing, but still costs a node on every row of the timeline.
    if (line !== '') nodes.push({ type: 'text', value: line });
  });

  return nodes;
};

/**
 * How many blank lines the parser dropped between two blocks.
 *
 * One newline is already spoken for — blocks stack, so the second starts on its
 * own line whatever this returns. The rest are the author's, and each one is a
 * line of empty space they chose to leave.
 */
const blankLinesBetween = (previous: MdastNode, next: MdastNode): number => {
  const end = previous.position?.end.line;
  const start = next.position?.start.line;
  if (end === undefined || start === undefined) return 0;

  return Math.max(0, start - end - 1);
};

/**
 * A remark plugin that preserves the message's own line breaks.
 *
 * Must run last: the mention, underline and emoji transforms all match within a
 * single `text` node, and splitting those into lines first would hide anything
 * written across two of them from transforms that could still have matched it.
 * Nothing downstream reads text values, so there is nothing left to break.
 */
export const remarkLineBreaks = () => (tree: unknown) => {
  const walk = (node: MdastNode): void => {
    if (!node.children) return;

    const restoresGaps = BLOCK_PARENTS.has(node.type);
    const next: MdastNode[] = [];
    let previous: MdastNode | null = null;

    for (const child of node.children) {
      if (restoresGaps && previous) {
        for (let blank = blankLinesBetween(previous, child); blank > 0; blank -= 1) next.push(newBreak());
      }
      previous = child;

      if (child.type === 'text' && child.value !== undefined) {
        const lines = toLines(child.value);

        if (lines) {
          next.push(...lines);
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
