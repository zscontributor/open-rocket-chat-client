import type { Message } from '@open-rocket-chat/client-sdk';
import { describe, expect, it } from 'vitest';

import {
  buildMessageRows,
  flaggedMessages,
  mergeReactions,
  reactedMessages,
  rowHasMessage,
  rowIndexOfMessage,
  type MessageRow,
} from '../message-rows';

const GROUPING_MS = 5 * 60 * 1000;

const message = (overrides: Partial<Message> & { id: string; createdAt: string }): Message =>
  ({
    kind: 'user',
    roomId: 'room-1',
    threadId: null,
    text: '',
    sender: { id: 'user-1', username: 'ada', displayName: 'Ada' },
    files: [],
    reactions: [],
    threadCount: 0,
    pinned: false,
    starred: false,
    encrypted: false,
    ...overrides,
  }) as Message;

/** An upload: one file, no words of its own — what the composer posts per file. */
const upload = (id: string, createdAt: string, overrides: Partial<Message> = {}): Message =>
  message({ id, createdAt, files: [{ id: `${id}-file` }] as Message['files'], ...overrides });

type MessageOnlyRow = Extract<MessageRow, { kind: 'message' }>;

const messageRows = (rows: MessageRow[]): MessageOnlyRow[] =>
  rows.filter((row): row is MessageOnlyRow => row.kind === 'message');

describe('buildMessageRows', () => {
  it('puts the files of one upload into a single row', () => {
    const rows = messageRows(
      buildMessageRows(
        [
          upload('a', '2026-08-02T10:00:00.000Z', { text: 'holiday photos' }),
          upload('b', '2026-08-02T10:00:04.000Z'),
          upload('c', '2026-08-02T10:00:09.000Z'),
        ],
        GROUPING_MS,
      ),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.messages.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    // Keyed by the message that opens the run, so the row keeps its identity as
    // the rest of the upload arrives.
    expect(rows[0]?.key).toBe('a');
    expect(rows[0]?.showHeader).toBe(true);
  });

  it('puts documents into a run the same as pictures', () => {
    const pdf = (id: string, createdAt: string) =>
      message({
        id,
        createdAt,
        files: [{ id: `${id}-file`, name: `${id}.pdf`, mimeType: 'application/pdf' }] as Message['files'],
      });

    const rows = messageRows(
      buildMessageRows([pdf('a', '2026-08-02T10:00:00.000Z'), pdf('b', '2026-08-02T10:00:03.000Z')], GROUPING_MS),
    );

    expect(rows.map((row) => row.messages.map((entry) => entry.id))).toEqual([['a', 'b']]);
  });

  it('leaves a lone upload and plain messages one row each', () => {
    const rows = messageRows(
      buildMessageRows(
        [
          message({ id: 'a', createdAt: '2026-08-02T10:00:00.000Z', text: 'hello' }),
          upload('b', '2026-08-02T10:00:02.000Z'),
          message({ id: 'c', createdAt: '2026-08-02T10:00:03.000Z', text: 'there' }),
        ],
        GROUPING_MS,
      ),
    );

    expect(rows.map((row) => row.messages.map((entry) => entry.id))).toEqual([['a'], ['b'], ['c']]);
  });

  it('does not group uploads from different people', () => {
    const rows = messageRows(
      buildMessageRows(
        [
          upload('a', '2026-08-02T10:00:00.000Z'),
          upload('b', '2026-08-02T10:00:01.000Z', {
            sender: { id: 'user-2', username: 'grace', displayName: 'Grace' } as Message['sender'],
          }),
        ],
        GROUPING_MS,
      ),
    );

    expect(rows.map((row) => row.messages.map((entry) => entry.id))).toEqual([['a'], ['b']]);
  });

  it('breaks the run on a file that carries its own words', () => {
    const rows = messageRows(
      buildMessageRows(
        [
          upload('a', '2026-08-02T10:00:00.000Z'),
          upload('b', '2026-08-02T10:00:01.000Z', { text: 'and this one is the receipt' }),
          upload('c', '2026-08-02T10:00:02.000Z'),
        ],
        GROUPING_MS,
      ),
    );

    expect(rows.map((row) => row.messages.map((entry) => entry.id))).toEqual([['a'], ['b', 'c']]);
  });

  it('breaks the run on a file that has replies of its own', () => {
    const rows = messageRows(
      buildMessageRows(
        [upload('a', '2026-08-02T10:00:00.000Z'), upload('b', '2026-08-02T10:00:01.000Z', { threadCount: 2 })],
        GROUPING_MS,
      ),
    );

    expect(rows.map((row) => row.messages.map((entry) => entry.id))).toEqual([['a'], ['b']]);
  });

  it('keeps files sent into a thread apart from files sent to the room', () => {
    const rows = messageRows(
      buildMessageRows(
        [upload('a', '2026-08-02T10:00:00.000Z'), upload('b', '2026-08-02T10:00:01.000Z', { threadId: 'thread-1' })],
        GROUPING_MS,
      ),
    );

    expect(rows.map((row) => row.messages.map((entry) => entry.id))).toEqual([['a'], ['b']]);
  });

  it('does not group uploads further apart than the grouping period', () => {
    const rows = messageRows(
      buildMessageRows([upload('a', '2026-08-02T10:00:00.000Z'), upload('b', '2026-08-02T10:06:00.000Z')], GROUPING_MS),
    );

    expect(rows.map((row) => row.messages.map((entry) => entry.id))).toEqual([['a'], ['b']]);
    // Far enough apart to be their own run, so the second gets a header back.
    expect(rows[1]?.showHeader).toBe(true);
  });

  it('never lets a run straddle a date separator', () => {
    // Built from local parts: the separator is drawn on the reader's calendar,
    // so a fixed UTC pair would land on one day or two depending on the zone.
    const beforeMidnight = new Date(2026, 7, 2, 23, 59, 30).toISOString();
    const afterMidnight = new Date(2026, 7, 3, 0, 0, 10).toISOString();

    const rows = buildMessageRows([upload('a', beforeMidnight), upload('b', afterMidnight)], GROUPING_MS);

    expect(rows.map((row) => row.kind)).toEqual(['date', 'message', 'date', 'message']);
  });

  it('drops the header on a message that continues a run from the same author', () => {
    const rows = messageRows(
      buildMessageRows(
        [
          message({ id: 'a', createdAt: '2026-08-02T10:00:00.000Z', text: 'one' }),
          message({ id: 'b', createdAt: '2026-08-02T10:00:20.000Z', text: 'two' }),
        ],
        GROUPING_MS,
      ),
    );

    expect(rows.map((row) => row.showHeader)).toEqual([true, false]);
  });

  it('opens the day with a date separator', () => {
    const rows = buildMessageRows(
      [message({ id: 'a', createdAt: '2026-08-02T10:00:00.000Z', text: 'hi' })],
      GROUPING_MS,
    );

    expect(rows[0]).toMatchObject({ kind: 'date', at: '2026-08-02T10:00:00.000Z' });
  });
});

describe('mergeReactions', () => {
  const reaction = (emoji: string, usernames: string[], reactedByMe = false) => ({
    emoji,
    usernames,
    count: usernames.length,
    reactedByMe,
  });

  it('counts the same person reacting to two files of one album once', () => {
    const merged = mergeReactions([
      message({ id: 'a', createdAt: '2026-08-02T10:00:00.000Z', reactions: [reaction(':tada:', ['ada'], true)] }),
      message({ id: 'b', createdAt: '2026-08-02T10:00:01.000Z', reactions: [reaction(':tada:', ['ada', 'grace'])] }),
    ]);

    expect(merged).toEqual([{ emoji: ':tada:', usernames: ['ada', 'grace'], count: 2, reactedByMe: true }]);
  });

  it('falls back to the summed count while a reaction is still optimistic', () => {
    const merged = mergeReactions([
      message({
        id: 'a',
        createdAt: '2026-08-02T10:00:00.000Z',
        reactions: [{ emoji: ':tada:', usernames: [], count: 1, reactedByMe: true }],
      }),
      message({
        id: 'b',
        createdAt: '2026-08-02T10:00:01.000Z',
        reactions: [{ emoji: ':tada:', usernames: [], count: 1, reactedByMe: true }],
      }),
    ]);

    expect(merged[0]?.count).toBe(2);
  });

  it('leaves the reactions of a lone message untouched', () => {
    const reactions = [reaction(':tada:', ['ada'])];

    expect(mergeReactions([message({ id: 'a', createdAt: '2026-08-02T10:00:00.000Z', reactions })])).toBe(reactions);
  });
});

describe('reactedMessages', () => {
  it('finds the files an album reaction actually sits on', () => {
    const messages = [
      message({
        id: 'a',
        createdAt: '2026-08-02T10:00:00.000Z',
        reactions: [{ emoji: ':tada:', usernames: ['grace'], count: 1, reactedByMe: false }],
      }),
      message({
        id: 'b',
        createdAt: '2026-08-02T10:00:01.000Z',
        reactions: [{ emoji: ':tada:', usernames: ['ada'], count: 1, reactedByMe: true }],
      }),
    ];

    expect(reactedMessages(messages, ':tada:').map((entry) => entry.id)).toEqual(['b']);
  });
});

describe('flaggedMessages', () => {
  it('finds the files an album marker came from', () => {
    const messages = [
      message({ id: 'a', createdAt: '2026-08-02T10:00:00.000Z' }),
      message({ id: 'b', createdAt: '2026-08-02T10:00:01.000Z', pinned: true }),
    ];

    expect(flaggedMessages(messages, 'pinned').map((entry) => entry.id)).toEqual(['b']);
    expect(flaggedMessages(messages, 'starred')).toEqual([]);
  });
});

describe('rowIndexOfMessage', () => {
  const rows = buildMessageRows(
    [
      message({ id: 'a', createdAt: '2026-08-02T10:00:00.000Z', text: 'first' }),
      upload('b', '2026-08-02T10:01:00.000Z'),
      upload('c', '2026-08-02T10:01:01.000Z'),
    ],
    GROUPING_MS,
  );

  it('finds the row a message is drawn in', () => {
    expect(rowIndexOfMessage(rows, 'a')).toBe(1);
  });

  it('finds the album a file was uploaded into, not a row of its own', () => {
    // 'b' and 'c' are one upload and share a row, so both answer with it — a
    // jump to the third photo has to land on the album, the only thing there.
    expect(rowIndexOfMessage(rows, 'c')).toBe(2);
    expect(rowIndexOfMessage(rows, 'b')).toBe(2);
  });

  it('says so when the message is not loaded', () => {
    expect(rowIndexOfMessage(rows, 'nowhere')).toBe(-1);
  });

  it('never answers with a date separator', () => {
    // The first row is one, and its key is built from the message id below it.
    expect(rows[0]?.kind).toBe('date');
    expect(rowIndexOfMessage(rows, 'date-a')).toBe(-1);
  });
});

describe('rowHasMessage', () => {
  const rows = buildMessageRows([message({ id: 'a', createdAt: '2026-08-02T10:00:00.000Z' })], GROUPING_MS);
  const [separator, only] = rows;

  it('answers for the row that draws it', () => {
    expect(only && rowHasMessage(only, 'a')).toBe(true);
    expect(only && rowHasMessage(only, 'b')).toBe(false);
  });

  it('is false for a date separator, which draws no message', () => {
    expect(separator && rowHasMessage(separator, 'a')).toBe(false);
  });

  it('is false when nothing is being marked', () => {
    expect(only && rowHasMessage(only, null)).toBe(false);
  });
});
