import { describe, expect, it } from 'vitest';

import { resolveActiveServerId } from '../server-store';

const connected = ['acme', 'contoso'];

describe('resolveActiveServerId', () => {
  it('honours the remembered choice', () => {
    expect(resolveActiveServerId(connected, 'acme', 'contoso')).toBe('contoso');
  });

  it('falls back to the default when nothing is remembered', () => {
    expect(resolveActiveServerId(connected, 'acme', null)).toBe('acme');
  });

  it('ignores a server the session is not signed in to', () => {
    // The stored preference outlives the connection: another tab can sign out
    // of it, and an unreachable server is dropped from the session entirely.
    expect(resolveActiveServerId(connected, 'acme', 'gone')).toBe('acme');
  });

  it('picks a live connection when even the default is gone', () => {
    // Disconnecting the default server must not leave the app pointing at it.
    expect(resolveActiveServerId(['contoso'], 'acme', null)).toBe('contoso');
  });

  it('falls back to the default id when there is nothing connected', () => {
    // Only reachable in the instant between the last sign-out and the session
    // query settling on `null`; returning something keeps the render honest.
    expect(resolveActiveServerId([], 'acme', 'contoso')).toBe('acme');
  });
});
