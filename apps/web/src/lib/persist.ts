import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';
import { clear, del, get, set } from 'idb-keyval';

/**
 * Bumped whenever a cached shape changes incompatibly.
 *
 * A restored cache written by an older build would feed components fields they
 * no longer expect — worse than a cold start, because it fails after render.
 */
const CACHE_VERSION = 'v3';

/** A day. Beyond that a cold fetch is cheaper than reasoning about staleness. */
export const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Server-scoped queries worth keeping between visits, named by the segment
 * that follows the server id in `['server', <id>, …]`.
 *
 * Deliberately an allow-list rather than "everything except": a query added
 * later should have to opt in, so nothing sensitive is persisted by accident.
 * Searches and user lookups are left out — they are cheap to redo and go stale
 * fast.
 */
const PERSISTED_SERVER_SCOPES = ['rooms', 'capabilities', 'commands', 'emoji'];

/**
 * Mirrors `SERVER_SCOPE_ROOT` in `lib/query.ts`, spelled out rather than
 * imported: `query.ts` already imports this module for the cache lifetime, and
 * importing it back would close the cycle.
 */
const SERVER_SCOPE_ROOT = 'server';

/**
 * Whether a query survives a reload.
 *
 * Only server-scoped queries are eligible, and only the ones that cost a
 * round-trip. Two kinds are deliberately excluded:
 *
 * - **The session.** It lives in an `HttpOnly` cookie and is re-validated
 *   against the gateway on every load, which is what keeps a signed-out user
 *   from seeing a restored view of someone else's account.
 * - **The bundled emoji datasets** (`['emoji', …]`). They are dynamic imports
 *   of JSON that ships inside the app, so persisting them writes hundreds of
 *   kilobytes to IndexedDB to avoid reading the bundle the browser already
 *   has. Worse, the shortcode index is a `Map`, and the persister serialises
 *   with `JSON.stringify` — a `Map` round-trips as `{}`, so a restored cache
 *   handed every message body an object with no `.get`. Custom emoji are the
 *   half that *is* a network call, and they are server-scoped, so they stay.
 */
export const shouldPersistQuery = (query: Query): boolean => {
  if (query.state.status !== 'success') return false;

  const [root, , scope] = query.queryKey;
  // Server-scoped keys carry the server id in position 1, so what decides
  // persistence is the segment after it.
  if (root !== SERVER_SCOPE_ROOT) return false;

  return typeof scope === 'string' && PERSISTED_SERVER_SCOPES.includes(scope);
};

/**
 * IndexedDB rather than `localStorage`: a room list with a few hundred
 * messages exceeds the 5 MB string quota, and `localStorage` writes block the
 * main thread.
 */
const indexedDbStorage = {
  getItem: async (key: string): Promise<string | null> => (await get<string>(key)) ?? null,
  setItem: async (key: string, value: string): Promise<void> => set(key, value),
  removeItem: async (key: string): Promise<void> => del(key),
};

export const createCachePersister = () =>
  createAsyncStoragePersister({
    storage: indexedDbStorage,
    key: `orc:query-cache:${CACHE_VERSION}`,
    // Writes are batched: without this, every realtime message would trigger a
    // serialisation of the whole cache.
    throttleTime: 2_000,
  });

/**
 * Drops everything cached on disk.
 *
 * Called on sign-out. Two accounts on one machine must not see each other's
 * rooms, and "the cache is gone" is the only guarantee simple enough to trust.
 */
export const clearPersistedCache = async (): Promise<void> => {
  try {
    await clear();
  } catch {
    // Private browsing modes reject IndexedDB entirely. Nothing was written,
    // so nothing needs clearing.
  }
};
