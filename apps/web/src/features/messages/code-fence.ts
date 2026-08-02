/**
 * Code fences as they are actually typed in a chat box.
 *
 * Markdown was written for documents, where a fence opens with a language and
 * the code follows on the next line. In a room nobody writes that: they type
 * ```` ```ABC ```` and send it, and CommonMark reads `ABC` as the language of a
 * block that then turns out to be empty — so the message renders as an empty
 * box and the text the user typed is gone. Rocket.Chat never loses it, because
 * its own grammar only accepts a language when the fence has a body under it.
 *
 * These two transforms restore that: an info string is a language only when
 * there is code beneath it, and is the code itself otherwise.
 */

/** The subset of mdast this transform touches — same shape as `underline.ts`. */
interface MdastNode {
  type: string;
  value?: string;
  lang?: string | null;
  meta?: string | null;
  children?: MdastNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

/** The source the node was parsed from, when the parser recorded its offsets. */
const sourceOf = (node: MdastNode, source: string): string | null => {
  const { start, end } = node.position ?? {};
  if (start?.offset === undefined || end?.offset === undefined) return null;

  return source.slice(start.offset, end.offset);
};

/**
 * ```` ```ABC ```` with nothing under it — whether or not a closing fence
 * follows. An empty block is nothing anyone sets out to send, so the info
 * string is the message: it is moved into the block and rendered as the code
 * the author was writing. The cost is that ```` ```js ```` closed with nothing
 * in it shows `js`, which is a stranger thing to type than it is to lose
 * somebody's line.
 */
const asContent = (node: MdastNode, source: string): boolean => {
  if (node.type !== 'code' || (node.value ?? '') !== '') return false;

  const info = [node.lang, node.meta].filter(Boolean).join(' ');

  if (info) {
    node.value = info;
    node.lang = null;
    node.meta = null;
    return true;
  }

  // Nothing on the fence line either: bare ```` ``` ````, which the composer
  // closes for you, sent before a word of code was written. An empty panel says
  // nothing at all, so — as Rocket.Chat does — the fence is shown as the text
  // it is, and the author can see why nothing happened.
  const raw = sourceOf(node, source);
  if (raw === null) return false;

  node.type = 'paragraph';
  node.value = undefined;
  node.lang = null;
  node.meta = null;
  node.children = [{ type: 'text', value: raw }];
  return true;
};

/**
 * A whole message that is one ```` ```ABC``` ```` — three backticks on a single
 * line, which CommonMark reads as a code *span* because an info string may not
 * contain backticks. Typed into a chat box it is a block, so it is promoted to
 * one, but only when it is the entire paragraph: inside a sentence it stays
 * inline, where the author clearly meant it to sit.
 */
const asBlock = (paragraph: MdastNode, source: string): boolean => {
  const [only, ...rest] = paragraph.children ?? [];
  if (!only || rest.length > 0 || only.type !== 'inlineCode') return false;

  const raw = sourceOf(only, source);
  if (raw === null || !raw.startsWith('```')) return false;

  paragraph.type = 'code';
  paragraph.value = only.value ?? '';
  paragraph.lang = null;
  paragraph.meta = null;
  delete paragraph.children;
  return true;
};

/**
 * A remark plugin, so it sees the tree the same parser the rest of the client
 * uses produced rather than second-guessing it with a regular expression.
 *
 * Order does not matter against the other transforms: none of them descend into
 * code, and this one only ever looks at code.
 */
export const remarkCodeFence = () => (tree: unknown, file: unknown) => {
  const source = String(file ?? '');

  const walk = (node: MdastNode): void => {
    if (asContent(node, source)) return;
    if (node.type === 'paragraph' && asBlock(node, source)) return;

    node.children?.forEach(walk);
  };

  walk(tree as MdastNode);
};
