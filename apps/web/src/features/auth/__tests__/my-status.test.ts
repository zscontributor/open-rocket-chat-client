import type { Session, UserProfile } from '@open-rocket-chat/client-sdk';
import { describe, expect, it } from 'vitest';

import { SELECTABLE_STATUSES, withUpdatedProfile } from '../status';

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: 'u1',
  username: 'ada',
  displayName: 'Ada',
  avatarUrl: null,
  status: 'online',
  email: null,
  statusText: null,
  bio: null,
  roles: [],
  timezone: null,
  language: null,
  createdAt: null,
  ...overrides,
});

const session = (): Session => ({
  connections: [
    {
      user: profile(),
      server: { id: 'acme', name: 'Acme', baseUrl: 'https://acme.example', version: '7.0.0' },
    },
    {
      user: profile({ id: 'u2', username: 'ada2', status: 'away' }),
      server: { id: 'other', name: 'Other', baseUrl: 'https://other.example', version: '7.0.0' },
    },
  ],
  defaultServerId: 'acme',
  expiresAt: null,
});

describe('withUpdatedProfile', () => {
  it('replaces the profile on the named server only', () => {
    const before = session();
    const updated = withUpdatedProfile(before, 'acme', profile({ status: 'busy', statusText: 'Heads down' }));

    expect(updated?.connections[0]?.user.status).toBe('busy');
    expect(updated?.connections[0]?.user.statusText).toBe('Heads down');
    // Presence belongs to an account on one server; setting it here says
    // nothing about the same person on the other server.
    expect(updated?.connections[1]?.user.status).toBe('away');
  });

  it('leaves untouched connections identical, so their consumers do not re-render', () => {
    const before = session();
    const updated = withUpdatedProfile(before, 'acme', profile({ status: 'busy' }));

    expect(updated?.connections[1]).toBe(before.connections[1]);
    expect(updated).not.toBe(before);
  });

  it('ignores a server the session is not signed in to', () => {
    const before = session();
    const updated = withUpdatedProfile(before, 'nowhere', profile({ status: 'busy' }));

    expect(updated?.connections.map((connection) => connection.user.status)).toEqual(['online', 'away']);
  });

  it('passes a signed-out session straight through', () => {
    expect(withUpdatedProfile(null, 'acme', profile())).toBeNull();
    expect(withUpdatedProfile(undefined, 'acme', profile())).toBeUndefined();
  });
});

describe('SELECTABLE_STATUSES', () => {
  it('offers every presence a person can set for themselves', () => {
    // `offline` is Rocket.Chat's "invisible" — a choice, not just a state the
    // server reports, which is why it belongs in the picker.
    expect([...SELECTABLE_STATUSES]).toEqual(['online', 'away', 'busy', 'offline']);
  });
});
