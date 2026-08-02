import type { ResolveEmoji } from './use-emoji';

/**
 * A `:shortcode:` as Rocket.Chat writes it. Deliberately narrow — letters,
 * digits, `_`, `+` and `-` — so ordinary prose survives untouched: a ratio like
 * `3:4:5` or a time range `10:30:00` has no business becoming an image.
 */
const SHORTCODE = /:([a-zA-Z0-9_+-]+):/g;

/** Strips the colons Rocket.Chat stores around reaction shortcodes. */
export const bareShortcode = (shortcode: string): string => shortcode.replace(/^:+|:+$/g, '');

export type EmojiSegment =
  | { kind: 'text'; value: string }
  | { kind: 'unicode'; character: string }
  | { kind: 'custom'; name: string; url: string };

/**
 * Splits text into runs of plain text and the emoji found between them.
 *
 * A shortcode nothing can resolve stays text: showing `:shipit:` verbatim is
 * how every other client behaves, and is far better than dropping what someone
 * typed.
 */
export const splitEmoji = (value: string, resolve: ResolveEmoji): EmojiSegment[] => {
  const segments: EmojiSegment[] = [];
  let plainFrom = 0;

  const pushText = (upTo: number) => {
    if (upTo > plainFrom) segments.push({ kind: 'text', value: value.slice(plainFrom, upTo) });
  };

  // `matchAll` over a global regex is the only form that reports indices
  // without the caller having to drive `lastIndex` by hand.
  for (const match of value.matchAll(SHORTCODE)) {
    const name = match[1];
    const start = match.index;
    if (name === undefined || start === undefined) continue;

    const emoji = resolve(name);
    if (!emoji) continue;

    pushText(start);
    segments.push(emoji.kind === 'unicode' ? emoji : { kind: 'custom', name, url: emoji.url });
    plainFrom = start + match[0].length;
  }

  pushText(value.length);

  return segments;
};

/** Marks the images this module emits, so the renderer can size them as emoji. */
export const CUSTOM_EMOJI_CLASS = 'orc-custom-emoji';

/**
 * The subset of mdast this transform touches.
 *
 * Typed locally rather than pulled from `@types/mdast`: three fields is the
 * whole surface, and it keeps a syntax-tree dependency out of the app.
 */
interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

const toNodes = (value: string, resolve: ResolveEmoji): MdastNode[] =>
  splitEmoji(value, resolve).map((segment) => {
    if (segment.kind === 'text') return { type: 'text', value: segment.value };
    if (segment.kind === 'unicode') return { type: 'text', value: segment.character };

    // `hName`/`hProperties` are how a node that markdown itself has no concept
    // of gets rendered: mdast-util-to-hast turns this into an `<img>`.
    return {
      type: 'emoji',
      data: {
        hName: 'img',
        hProperties: {
          src: segment.url,
          alt: `:${segment.name}:`,
          title: `:${segment.name}:`,
          loading: 'lazy',
          className: [CUSTOM_EMOJI_CLASS],
        },
      },
    };
  });

/**
 * A remark plugin that turns shortcodes into emoji.
 *
 * It only ever visits `text` nodes, which is what keeps `:tada:` inside a code
 * span or fenced block exactly as it was written — those are `inlineCode` and
 * `code` nodes, and never descended into.
 */
export const makeRemarkEmoji = (resolve: ResolveEmoji) => () => (tree: unknown) => {
  const walk = (node: MdastNode): void => {
    if (!node.children) return;

    const next: MdastNode[] = [];

    for (const child of node.children) {
      if (child.type === 'text' && child.value !== undefined) {
        next.push(...toNodes(child.value, resolve));
        continue;
      }

      walk(child);
      next.push(child);
    }

    node.children = next;
  };

  walk(tree as MdastNode);
};
