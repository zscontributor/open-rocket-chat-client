import type { Query } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { shouldPersistQuery } from '../persist';
import { serverKeys } from '../query';

const query = (queryKey: unknown[], status: 'success' | 'error' | 'pending' = 'success') =>
  ({ queryKey, state: { status } }) as unknown as Query;

const acme = serverKeys('acme');

describe('shouldPersistQuery', () => {
  it('keeps the data a cold start would otherwise wait for', () => {
    expect(shouldPersistQuery(query([...acme.rooms]))).toBe(true);
    expect(shouldPersistQuery(query([...acme.messages('room-1')]))).toBe(true);
    expect(shouldPersistQuery(query([...acme.capabilities]))).toBe(true);
    expect(shouldPersistQuery(query([...acme.customEmoji]))).toBe(true);
  });

  it('never persists the bundled emoji datasets', () => {
    // They are dynamic imports of JSON that ships with the app, so persisting
    // them trades hundreds of kilobytes of IndexedDB for a read of a bundle the
    // browser already has. The shortcode index is also a `Map`, and the
    // persister serialises with `JSON.stringify`: it would come back as `{}`
    // and every message body would call `.get` on an object that has none.
    expect(shouldPersistQuery(query(['emoji', 'standard']))).toBe(false);
    expect(shouldPersistQuery(query(['emoji', 'unicode-shortcodes']))).toBe(false);
  });

  it('keeps each server apart on disk', () => {
    // The two key sets differ only by the server id, which is what stops one
    // server's rooms being restored as another's.
    expect(acme.rooms).not.toEqual(serverKeys('contoso').rooms);
    expect(shouldPersistQuery(query([...serverKeys('contoso').rooms]))).toBe(true);
  });

  it('never persists the session', () => {
    // It lives in an HttpOnly cookie and is re-validated on every load. A
    // restored copy would show a signed-out user someone else's account.
    expect(shouldPersistQuery(query(['session']))).toBe(false);
  });

  it('requires an explicit opt-in for anything new', () => {
    expect(shouldPersistQuery(query([...acme.user('admin')]))).toBe(false);
    expect(shouldPersistQuery(query([...acme.userSearch('quy', 20)]))).toBe(false);
    expect(shouldPersistQuery(query(['servers']))).toBe(false);
  });

  it('does not persist failed or in-flight queries', () => {
    expect(shouldPersistQuery(query([...acme.rooms], 'error'))).toBe(false);
    expect(shouldPersistQuery(query([...acme.rooms], 'pending'))).toBe(false);
  });

  it('ignores a non-string key root', () => {
    expect(shouldPersistQuery(query([{ scope: 'rooms' }]))).toBe(false);
  });
});
