/**
 * Underline, the one mark markdown never had.
 *
 * GitHub-flavoured markdown covers bold, italic and strikethrough, but there is
 * no underline in any flavour — `__text__` is already bold, so claiming it here
 * would silently re-render every `__bold__` that arrives from another client as
 * something its author did not write. `++text++` is the `<ins>`-style delimiter
 * other markdown extensions settled on for exactly this reason, and GFM leaves
 * `+` alone entirely.
 */

/**
 * Non-greedy, and anchored on non-whitespace at both ends the way markdown's own
 * emphasis is: `++ not this ++` stays text, and `a ++ b ++ c` does not turn the
 * middle into an underline nobody asked for.
 */
const UNDERLINE = /\+\+(?=\S)([\s\S]*?\S)\+\+/g;

/** The subset of mdast this transform touches — see `emoji.ts` for the same shape. */
interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: { hName?: string };
}

const toNodes = (value: string): MdastNode[] => {
  const nodes: MdastNode[] = [];
  let plainFrom = 0;

  for (const match of value.matchAll(UNDERLINE)) {
    const inner = match[1];
    const start = match.index;
    if (inner === undefined || start === undefined) continue;

    if (start > plainFrom) nodes.push({ type: 'text', value: value.slice(plainFrom, start) });

    // `hName` is how a node markdown has no concept of gets rendered:
    // mdast-util-to-hast turns this into a `<u>`.
    nodes.push({ type: 'underline', data: { hName: 'u' }, children: [{ type: 'text', value: inner }] });
    plainFrom = start + match[0].length;
  }

  if (nodes.length === 0) return [];
  if (plainFrom < value.length) nodes.push({ type: 'text', value: value.slice(plainFrom) });

  return nodes;
};

/**
 * A remark plugin that turns `++text++` into an underline.
 *
 * Like the emoji transform it only ever visits `text` nodes, which is what
 * keeps the delimiters intact inside code spans and fenced blocks. The flip
 * side is that it cannot span nodes: `++**bold**++` was already split into three
 * nodes by GFM before this runs, so the delimiters stay as text. Underlining a
 * plain run — which is what the toolbar produces — is the case this covers.
 *
 * Must run before the emoji transform so shortcodes inside an underline are
 * still resolved: that one descends into children, this one creates them.
 */
export const makeRemarkUnderline = () => (tree: unknown) => {
  const walk = (node: MdastNode): void => {
    if (!node.children) return;

    const next: MdastNode[] = [];

    for (const child of node.children) {
      if (child.type === 'text' && child.value !== undefined) {
        const replaced = toNodes(child.value);

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
