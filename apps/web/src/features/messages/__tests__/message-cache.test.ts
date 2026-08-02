import type { FileRef, Message, RoomFile } from '@open-rocket-chat/client-sdk';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { serverKeys } from '@/lib/query';
import { patchMessage, removeMessage, syncMessageCollections, syncRoomFiles, upsertMessage } from '../message-cache';

const keys = serverKeys('server-1');
const ROOM_ID = 'room-1';

const message = (overrides: Partial<Message> & { id: string }): Message =>
  ({ pinned: false, starred: false, files: [], ...overrides }) as Message;

const fileRef = (id: string): FileRef => ({ id }) as FileRef;

/** Seeds a message panel's cache with the rows it currently lists. */
const seedCollection = (client: QueryClient, kind: 'pinned' | 'starred', items: Message[]): void => {
  client.setQueryData(keys.roomMessageCollection(ROOM_ID, kind), {
    pages: [{ items, offset: 0, limit: 30, total: items.length }],
    pageParams: [0],
  });
};

/** Seeds one of the Files panel's filters with the uploads it currently lists. */
const seedFiles = (client: QueryClient, filters: { q: string; type: string }, ids: string[]): void => {
  client.setQueryData(keys.roomFilesFiltered(ROOM_ID, filters), {
    pages: [{ items: ids.map((id) => ({ id }) as RoomFile), offset: 0, limit: 30, total: ids.length }],
    pageParams: [0],
  });
};

const seedTimeline = (client: QueryClient, items: Message[]): void => {
  client.setQueryData(keys.messages(ROOM_ID), {
    pages: [{ items, hasMore: false, gapBefore: false }],
    pageParams: [undefined],
  });
};

/**
 * Seeds an open thread pane. Pages run newest-window first, as the query that
 * fills them does, so `pages[0]` is where a fresh reply lands.
 */
const seedThread = (client: QueryClient, threadId: string, pages: Message[][]): void => {
  client.setQueryData(keys.thread(ROOM_ID, threadId), {
    pages: pages.map((items, index) => ({ items, hasMore: index < pages.length - 1, gapBefore: false })),
    pageParams: pages.map((_page, index) => index * 50),
  });
};

const threadItems = (client: QueryClient, threadId: string): Message[] =>
  client
    .getQueryData<{ pages: { items: Message[] }[] }>(keys.thread(ROOM_ID, threadId))
    ?.pages.flatMap((page) => page.items) ?? [];

/** Records the keys handed to `invalidateQueries` instead of refetching them. */
const captureInvalidations = (client: QueryClient): unknown[][] => {
  const invalidated: unknown[][] = [];
  vi.spyOn(client, 'invalidateQueries').mockImplementation((filters) => {
    invalidated.push([...((filters?.queryKey ?? []) as unknown[])]);
    return Promise.resolve();
  });
  return invalidated;
};

const ALL_FILES = { q: '', type: 'all' };
const IMAGES = { q: '', type: 'image' };

describe('syncMessageCollections', () => {
  const kindsInvalidated = (client: QueryClient, incoming: Message): unknown[] => {
    const invalidated = captureInvalidations(client);
    syncMessageCollections(client, keys, ROOM_ID, incoming);
    return invalidated.map((key) => key.at(-1));
  };

  it('refreshes a list the message has just joined', () => {
    const client = new QueryClient();
    seedCollection(client, 'pinned', []);

    expect(kindsInvalidated(client, message({ id: 'm1', pinned: true }))).toEqual(['pinned']);
  });

  it('refreshes a list the message has just left', () => {
    const client = new QueryClient();
    seedCollection(client, 'pinned', [message({ id: 'm1', pinned: true })]);

    expect(kindsInvalidated(client, message({ id: 'm1', pinned: false }))).toEqual(['pinned']);
  });

  it('leaves a list alone when the flag has not moved', () => {
    const client = new QueryClient();
    seedCollection(client, 'pinned', [message({ id: 'm1', pinned: true })]);
    seedCollection(client, 'starred', []);

    // An edit or a reaction on a pinned message: still pinned, still unstarred.
    expect(kindsInvalidated(client, message({ id: 'm1', pinned: true }))).toEqual([]);
  });

  it('leaves both lists alone for an ordinary new message', () => {
    // Every message in a busy room passes through here; refetching two panels
    // per message would cost more than the panels are worth.
    const client = new QueryClient();
    seedCollection(client, 'pinned', [message({ id: 'm1', pinned: true })]);

    expect(kindsInvalidated(client, message({ id: 'm2' }))).toEqual([]);
  });

  it('treats a panel that was never opened as listing nothing', () => {
    const client = new QueryClient();

    expect(kindsInvalidated(client, message({ id: 'm1', starred: true }))).toEqual(['starred']);
    expect(kindsInvalidated(new QueryClient(), message({ id: 'm1' }))).toEqual([]);
  });
});

describe('syncRoomFiles', () => {
  const filtersInvalidated = (client: QueryClient, incoming: Message): unknown[][] => {
    const invalidated = captureInvalidations(client);
    syncRoomFiles(client, keys, ROOM_ID, incoming);
    return invalidated;
  };

  it('refreshes every filter that is missing the upload', () => {
    const client = new QueryClient();
    seedFiles(client, ALL_FILES, []);
    seedFiles(client, IMAGES, []);

    // The server decides which filters a new upload belongs to, so both are
    // asked again rather than guessed at from the mime type.
    expect(filtersInvalidated(client, message({ id: 'm1', files: [fileRef('f1')] }))).toEqual([
      keys.roomFilesFiltered(ROOM_ID, ALL_FILES),
      keys.roomFilesFiltered(ROOM_ID, IMAGES),
    ]);
  });

  it('leaves a filter that already lists the upload alone', () => {
    // Editing a photo's caption re-sends the whole message; the panel is right.
    const client = new QueryClient();
    seedFiles(client, ALL_FILES, ['f1']);

    expect(filtersInvalidated(client, message({ id: 'm1', files: [fileRef('f1')] }))).toEqual([]);
  });

  it('refreshes only the filters that have fallen behind', () => {
    const client = new QueryClient();
    seedFiles(client, ALL_FILES, ['f1']);
    seedFiles(client, IMAGES, []);

    expect(filtersInvalidated(client, message({ id: 'm1', files: [fileRef('f1')] }))).toEqual([
      keys.roomFilesFiltered(ROOM_ID, IMAGES),
    ]);
  });

  it('ignores a message without uploads', () => {
    const client = new QueryClient();
    seedFiles(client, ALL_FILES, []);

    expect(filtersInvalidated(client, message({ id: 'm1' }))).toEqual([]);
  });
});

describe('removeMessage', () => {
  it('drops the message and reports what it carried', () => {
    const client = new QueryClient();
    const deleted = message({ id: 'm1', files: [fileRef('f1')], pinned: true });
    seedTimeline(client, [deleted, message({ id: 'm2' })]);
    const invalidated = captureInvalidations(client);

    expect(removeMessage(client, keys, ROOM_ID, 'm1')).toBe(deleted);
    expect(client.getQueryData<{ pages: { items: Message[] }[] }>(keys.messages(ROOM_ID))?.pages[0]?.items).toEqual([
      message({ id: 'm2' }),
    ]);
    expect(invalidated).toEqual([keys.roomFiles(ROOM_ID), keys.roomMessageCollection(ROOM_ID, 'pinned')]);
  });

  it('refreshes nothing for a plain message', () => {
    const client = new QueryClient();
    seedTimeline(client, [message({ id: 'm1' })]);
    const invalidated = captureInvalidations(client);

    removeMessage(client, keys, ROOM_ID, 'm1');
    expect(invalidated).toEqual([]);
  });

  it('says nothing about a message the timeline never loaded', () => {
    const client = new QueryClient();
    seedTimeline(client, [message({ id: 'm1' })]);
    const invalidated = captureInvalidations(client);

    expect(removeMessage(client, keys, ROOM_ID, 'gone')).toBeUndefined();
    expect(invalidated).toEqual([]);
  });

  it('drops the reply from an open thread pane too', () => {
    const client = new QueryClient();
    seedTimeline(client, []);
    seedThread(client, 't1', [[message({ id: 'r1', threadId: 't1' }), message({ id: 'r2', threadId: 't1' })]]);

    removeMessage(client, keys, ROOM_ID, 'r1');
    expect(threadItems(client, 't1').map((item) => item.id)).toEqual(['r2']);
  });
});

describe('thread panes', () => {
  it('appends a reply to the pane it belongs to', () => {
    const client = new QueryClient();
    seedTimeline(client, []);
    seedThread(client, 't1', [[message({ id: 'r1', threadId: 't1' })]]);

    upsertMessage(client, keys, ROOM_ID, message({ id: 'r2', threadId: 't1' }));
    expect(threadItems(client, 't1').map((item) => item.id)).toEqual(['r1', 'r2']);
  });

  it('lands the reply on the newest page rather than the one in view', () => {
    // Paging back through a long thread puts older pages after page 0; a reply
    // that arrives meanwhile still belongs at the end of the newest one.
    const client = new QueryClient();
    seedTimeline(client, []);
    seedThread(client, 't1', [[message({ id: 'r2', threadId: 't1' })], [message({ id: 'r1', threadId: 't1' })]]);

    upsertMessage(client, keys, ROOM_ID, message({ id: 'r3', threadId: 't1' }));
    expect(threadItems(client, 't1').map((item) => item.id)).toEqual(['r2', 'r3', 'r1']);
  });

  it('replaces an edited reply where it already sits', () => {
    const client = new QueryClient();
    seedTimeline(client, []);
    seedThread(client, 't1', [[message({ id: 'r1', threadId: 't1', text: 'before' })]]);

    upsertMessage(client, keys, ROOM_ID, message({ id: 'r1', threadId: 't1', text: 'after' }));
    expect(threadItems(client, 't1')).toHaveLength(1);
    expect(threadItems(client, 't1')[0]?.text).toBe('after');
  });

  it('updates the parent, which sits in the pane without being a reply', () => {
    const client = new QueryClient();
    seedTimeline(client, []);
    seedThread(client, 't1', [[message({ id: 't1' }), message({ id: 'r1', threadId: 't1' })]]);

    patchMessage(client, keys, ROOM_ID, 't1', (parent) => ({ ...parent, pinned: true }));
    expect(threadItems(client, 't1')[0]?.pinned).toBe(true);
  });

  it('leaves another thread alone', () => {
    const client = new QueryClient();
    seedTimeline(client, []);
    seedThread(client, 't1', [[message({ id: 'r1', threadId: 't1' })]]);
    seedThread(client, 't2', [[message({ id: 'r2', threadId: 't2' })]]);

    upsertMessage(client, keys, ROOM_ID, message({ id: 'r3', threadId: 't1' }));
    expect(threadItems(client, 't2').map((item) => item.id)).toEqual(['r2']);
  });

  it('ignores a main-timeline message that belongs to no thread', () => {
    const client = new QueryClient();
    seedTimeline(client, []);
    seedThread(client, 't1', [[message({ id: 'r1', threadId: 't1' })]]);

    upsertMessage(client, keys, ROOM_ID, message({ id: 'm1' }));
    expect(threadItems(client, 't1').map((item) => item.id)).toEqual(['r1']);
  });
});
