import type { RoomSummary, ServerCapabilities } from '@open-rocket-chat/client-sdk';
import { describe, expect, it, vi } from 'vitest';

// The predicates under test are pure, but they sit in the module that also
// exports the capabilities hook — which reaches the SDK client, and that reads
// the page origin as it is imported. Hoisted so the stub is in place before
// the import graph is evaluated, not merely before the first test.
vi.hoisted(() => {
  vi.stubGlobal('window', { location: { origin: 'https://gateway.test' }, dispatchEvent: () => true });
});

import { canChangeOwnAvatar, canEditRoomAvatar } from '../use-capabilities';

const capabilities = (
  rolesByPermission: Record<string, string[]>,
  options: { userRoles?: string[]; allowAvatarChange?: boolean } = {},
): ServerCapabilities =>
  ({
    settings: { accounts: { allowAvatarChange: options.allowAvatarChange ?? true } },
    permissions: { rolesByPermission, userRoles: options.userRoles ?? [] },
  }) as ServerCapabilities;

const room = (overrides: Partial<RoomSummary> = {}): RoomSummary =>
  ({ id: 'r1', type: 'channel', roles: [], ...overrides }) as RoomSummary;

/** Both permissions held as an owner of the room, which is the usual case. */
const ownerOfEverything = capabilities({ 'edit-room': ['owner'], 'edit-room-avatar': ['owner'] });

describe('canEditRoomAvatar', () => {
  it('allows an owner who holds both permissions', () => {
    expect(canEditRoomAvatar(ownerOfEverything, room({ roles: ['owner'] }))).toBe(true);
  });

  it('refuses somebody who may edit the room but not its picture', () => {
    // Rocket.Chat validates the avatar field of a settings save against
    // `edit-room-avatar` on its own, so the two really do come apart.
    const capped = capabilities({ 'edit-room': ['owner'], 'edit-room-avatar': ['admin'] });
    expect(canEditRoomAvatar(capped, room({ roles: ['owner'] }))).toBe(false);
  });

  it('refuses somebody who may change pictures but not edit the room', () => {
    const capped = capabilities({ 'edit-room': ['admin'], 'edit-room-avatar': ['owner'] });
    expect(canEditRoomAvatar(capped, room({ roles: ['owner'] }))).toBe(false);
  });

  it('refuses a direct message, whose picture belongs to the other person', () => {
    expect(canEditRoomAvatar(ownerOfEverything, room({ type: 'direct', roles: ['owner'] }))).toBe(false);
  });

  it('refuses when there is no room yet', () => {
    expect(canEditRoomAvatar(ownerOfEverything, undefined)).toBe(false);
  });
});

describe('canChangeOwnAvatar', () => {
  it('follows the server-wide setting', () => {
    expect(canChangeOwnAvatar(capabilities({}, { allowAvatarChange: true }))).toBe(true);
    expect(canChangeOwnAvatar(capabilities({}, { allowAvatarChange: false }))).toBe(false);
  });

  it('is off until the capabilities have loaded', () => {
    expect(canChangeOwnAvatar(undefined)).toBe(false);
  });
});
