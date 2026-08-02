/**
 * Turning `@somebody` and `#some-room` in a message body into things you can
 * click.
 *
 * The rules for what counts live here, away from React, for the same reason the
 * composer's do: whether an `@` in the middle of an email address is a mention
 * is a question with one right answer, and it deserves a test rather than a
 * component.
 */

/**
 * Rocket.Chat usernames and room names are drawn from the same alphabet:
 * letters, digits, `.`, `-` and `_`. Anything else ends the name, which is what
 * lets `@bob,` and `(#general)` be recognised with their punctuation intact.
 */
const MENTION = /(^|[^\w@#])([@#])([\w.-]+)/g;

export type MentionKind = 'user' | 'channel' | 'all' | 'here';

export interface ResolvedMention {
  kind: MentionKind;
  /** Room or user id when one is known; a name alone is still clickable. */
  id?: string;
}

/**
 * Decides whether a name found in the text really is a mention.
 *
 * Returning `null` leaves it as ordinary text — which is what should happen to
 * `@` followed by a word that names nobody, and is why a message about
 * `#hashtags` does not turn blue.
 */
export type ResolveMention = (trigger: '@' | '#', name: string) => ResolvedMention | null;

export type MentionSegment =
  { kind: 'text'; value: string } | { kind: 'mention'; mention: ResolvedMention; trigger: '@' | '#'; name: string };

/** Splits text into runs of plain text and the mentions found between them. */
export const splitMentions = (value: string, resolve: ResolveMention): MentionSegment[] => {
  const segments: MentionSegment[] = [];
  let plainFrom = 0;

  const pushText = (upTo: number) => {
    if (upTo > plainFrom) segments.push({ kind: 'text', value: value.slice(plainFrom, upTo) });
  };

  for (const match of value.matchAll(MENTION)) {
    const [whole, prefix = '', trigger, name] = match;
    if (!trigger || !name || match.index === undefined) continue;

    const mention = resolve(trigger as '@' | '#', name);
    if (!mention) continue;

    // The prefix was only matched to prove what came before the trigger; it is
    // text, and stays text.
    const start = match.index + prefix.length;

    pushText(start);
    segments.push({ kind: 'mention', mention, trigger: trigger as '@' | '#', name });
    plainFrom = match.index + whole.length;
  }

  pushText(value.length);

  return segments;
};

/** Marks the spans this module emits, so the renderer can tell them apart. */
export const MENTION_CLASS = 'orc-mention';

/** Never resolves anything, leaving every `@` and `#` as the text it was. */
const NO_MENTIONS: ResolveMention = () => null;

/**
 * Builds the resolver for one message.
 *
 * The server's own `mentions` and `channels` are the authority: Rocket.Chat
 * resolved them when the message was posted, and they are the only way to know
 * that `@sales` is a team and `#archive` is a room that exists but which the
 * reader has never joined. A name it does not list is not a mention, however
 * much it looks like one — which is exactly what keeps `@nobody` and a `#1` in
 * somebody's prose as text.
 *
 * `assume` is for the one case with nothing to check against: the composer's
 * preview of a message that has not been posted yet. There, marking every
 * well-formed name is the honest answer — it shows what the message is about to
 * become.
 */
export const messageMentionResolver = (
  mentions: { id: string; username: string; kind: string }[] | undefined,
  channels: { id: string; name: string }[] | undefined,
  assume = false,
): ResolveMention => {
  if (!mentions && !channels) {
    if (!assume) return NO_MENTIONS;

    return (trigger, name) => ({
      kind: trigger === '#' ? 'channel' : name === 'all' ? 'all' : name === 'here' ? 'here' : 'user',
    });
  }

  const byUsername = new Map((mentions ?? []).map((mention) => [mention.username.toLowerCase(), mention] as const));
  const byRoomName = new Map((channels ?? []).map((channel) => [channel.name.toLowerCase(), channel] as const));

  return (trigger, name) => {
    const key = name.toLowerCase();

    if (trigger === '#') {
      const room = byRoomName.get(key);
      return room ? { kind: 'channel', id: room.id } : null;
    }

    const mention = byUsername.get(key);
    if (!mention) return null;

    // `all` and `here` notify a room rather than a person, so they carry no id
    // worth handing to a profile lookup.
    if (mention.kind === 'all' || mention.kind === 'here') return { kind: mention.kind };

    return { kind: 'user', id: mention.id };
  };
};

/**
 * The subset of mdast this transform touches — the same three fields the emoji
 * transform beside it needs, and typed here for the same reason.
 */
interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

const toNodes = (value: string, resolve: ResolveMention): MdastNode[] =>
  splitMentions(value, resolve).map((segment) => {
    if (segment.kind === 'text') return { type: 'text', value: segment.value };

    return {
      type: 'mention',
      data: {
        // A `span` rather than an element of its own: `mdast-util-to-hast` only
        // knows how to serialise real tags, and the renderer picks these out by
        // the data attribute below.
        hName: 'span',
        hProperties: {
          className: [MENTION_CLASS],
          'data-mention-kind': segment.mention.kind,
          'data-mention-name': segment.name,
          ...(segment.mention.id ? { 'data-mention-id': segment.mention.id } : {}),
        },
      },
      children: [{ type: 'text', value: `${segment.trigger}${segment.name}` }],
    };
  });

/**
 * A remark plugin that turns names into mentions.
 *
 * Only `text` nodes are visited, so a `#channel` inside a code span or a fenced
 * block stays exactly as it was typed — and a link's URL, which is a `link`
 * node's property rather than text, is never rewritten either.
 */
export const makeRemarkMentions = (resolve: ResolveMention) => () => (tree: unknown) => {
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
