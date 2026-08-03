import type { Message } from '@open-rocket-chat/client-sdk';
import { isSameDay } from 'date-fns';

/**
 * A row of the timeline.
 *
 * `messages` is usually one message. It holds several when a single upload put
 * several of them there: Rocket.Chat's upload endpoint takes one file per
 * request, so attaching five photos posts five messages, and showing them as
 * five stacked bubbles would break one action by the user into five entries in
 * the room. Those runs are put back together here and drawn as one album.
 */
export type MessageRow =
  | { kind: 'date'; key: string; at: string }
  | { kind: 'message'; key: string; messages: [Message, ...Message[]]; showHeader: boolean };

/**
 * Consecutive messages from one author share a header when they fall inside the
 * server's `Message_GroupingPeriod`, so this client groups exactly where every
 * other Rocket.Chat client does.
 */
export const shouldShowHeader = (message: Message, previous: Message | undefined, groupingMs: number): boolean => {
  if (!previous) return true;
  if (previous.sender.id !== message.sender.id) return true;
  if (previous.kind === 'system' || message.kind === 'system') return true;

  return new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() > groupingMs;
};

/** A message carrying files the client can actually show — the raw material of an album. */
const isUpload = (message: Message): boolean =>
  message.kind === 'user' && message.files.length > 0 && !message.encrypted;

/**
 * Whether `message` is another file from the upload `previous` came out of.
 *
 * There is no batch id to match on — the server sees each file as its own
 * message — so the run is recognised from what a single upload always looks
 * like: the same author, files only, no words of their own, one after another
 * inside the grouping period.
 */
export const continuesUpload = (previous: Message, message: Message, windowMs: number): boolean => {
  if (!isUpload(previous) || !isUpload(message)) return false;
  if (previous.sender.id !== message.sender.id) return false;
  // A file sent into a thread and one sent to the room are two different places.
  if ((previous.threadId ?? null) !== (message.threadId ?? null)) return false;
  // The composer sends its text with the first file, so only the message that
  // opens a run may carry any: words of its own make this a statement somebody
  // wrote, not another tile in a grid.
  if (message.text.trim().length > 0) return false;
  // Replies hang off one specific message and are opened from its own footer,
  // which an album has nowhere to put.
  if (message.threadCount > 0) return false;

  const previousAt = new Date(previous.createdAt);
  const at = new Date(message.createdAt);
  // A run that straddled midnight would have to be split by a date separator.
  if (!isSameDay(previousAt, at)) return false;

  return at.getTime() - previousAt.getTime() <= windowMs;
};

/**
 * Turns the loaded history into the rows the timeline draws: date separators,
 * single messages, and albums of the messages one upload produced.
 *
 * Pure, and the only place the timeline's shape is decided — the list itself
 * only measures and positions what comes back.
 */
export const buildMessageRows = (messages: Message[], groupingMs: number): MessageRow[] => {
  const rows: MessageRow[] = [];
  /** The row the last message went into, and so the one a run can grow into. */
  let open: Extract<MessageRow, { kind: 'message' }> | null = null;

  messages.forEach((message, index) => {
    const previous = messages[index - 1];

    if (previous && open && continuesUpload(previous, message, groupingMs)) {
      open.messages.push(message);
      return;
    }

    const startsNewDay = !previous || !isSameDay(new Date(previous.createdAt), new Date(message.createdAt));

    if (startsNewDay) {
      rows.push({ kind: 'date', key: `date-${message.id}`, at: message.createdAt });
    }

    // Keyed by the message that opens the row: a run that grows as the rest of
    // the upload arrives keeps its identity, and so its measured height.
    open = {
      kind: 'message',
      key: message.id,
      messages: [message],
      showHeader: startsNewDay || shouldShowHeader(message, previous, groupingMs),
    };
    rows.push(open);
  });

  return rows;
};

/**
 * Which row draws the message with this id, or `-1` when none of them does.
 *
 * The row that holds it rather than the one keyed by it: an upload of five
 * photos is five messages in one album, and jumping to the third of them has to
 * land on the album, which is the only thing on the screen that exists.
 */
export const rowIndexOfMessage = (rows: readonly MessageRow[], messageId: string): number =>
  rows.findIndex((row) => row.kind === 'message' && row.messages.some((message) => message.id === messageId));

/** Whether this row draws the message with that id — the same question, per row. */
export const rowHasMessage = (row: MessageRow, messageId: string | null): boolean =>
  messageId !== null && row.kind === 'message' && row.messages.some((message) => message.id === messageId);

/**
 * The reactions an album shows: one pill per emoji, counted by person rather
 * than by file, because reacting to three photos of one upload is one reaction
 * to the album as far as anyone reading it is concerned.
 */
export const mergeReactions = (messages: readonly Message[]): Message['reactions'] => {
  const first = messages[0];
  if (messages.length === 1 && first) return first.reactions;

  const merged = new Map<string, Message['reactions'][number] & { totalCount: number }>();

  for (const message of messages) {
    for (const reaction of message.reactions) {
      const existing = merged.get(reaction.emoji);

      if (!existing) {
        merged.set(reaction.emoji, {
          ...reaction,
          usernames: [...reaction.usernames],
          totalCount: reaction.count,
        });
        continue;
      }

      for (const username of reaction.usernames) {
        if (!existing.usernames.includes(username)) existing.usernames.push(username);
      }

      existing.reactedByMe ||= reaction.reactedByMe;
      existing.totalCount += reaction.count;
    }
  }

  return [...merged.values()].map(({ totalCount, ...reaction }) => ({
    ...reaction,
    // An optimistic reaction is counted before its username is known, so the
    // summed count is the only figure available until the event lands.
    count: reaction.usernames.length > 0 ? reaction.usernames.length : totalCount,
  }));
};

/**
 * The messages in a row that carry this reaction from the caller.
 *
 * Removing a reaction from an album has to clear it wherever in the run it
 * actually sits, which is not necessarily the message the album is keyed by.
 */
export const reactedMessages = (messages: readonly Message[], emoji: string): Message[] =>
  messages.filter((message) => message.reactions.some((reaction) => reaction.emoji === emoji && reaction.reactedByMe));

/** The same, for the flags an album shows as a single marker in its header. */
export const flaggedMessages = (messages: readonly Message[], flag: 'pinned' | 'starred'): Message[] =>
  messages.filter((message) => message[flag]);
