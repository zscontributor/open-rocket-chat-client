import type { RoomSummary, ServerCapabilities, SlashCommand } from '@open-rocket-chat/client-sdk';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('window', { location: { origin: 'https://gateway.test' }, dispatchEvent: () => true });
});

import {
  canFavoriteRooms,
  canLeaveRoom,
  canPostToRoom,
  canReact,
  canRunSlashCommand,
  canUpload,
} from '../use-capabilities';

const capabilities = (
  rolesByPermission: Record<string, string[]> = {},
  userRoles: string[] = ['user'],
): ServerCapabilities =>
  ({
    settings: {
      fileUpload: { enabled: true, enabledDirect: true },
      ui: { favoriteRooms: true },
    },
    permissions: { rolesByPermission, userRoles },
  }) as ServerCapabilities;

const room = (overrides: Partial<RoomSummary> = {}): RoomSummary =>
  ({
    id: 'r1',
    type: 'channel',
    visibility: 'public',
    roles: [],
    joined: true,
    canLeave: true,
    archived: false,
    blocked: false,
    blocker: false,
    readOnly: false,
    mutedForPosting: false,
    unmutedForPosting: false,
    reactWhenReadOnly: false,
    ...overrides,
  }) as RoomSummary;

describe('room posting capabilities', () => {
  it('honours post-readonly and the per-user unmuted override', () => {
    const allowed = capabilities({ 'post-readonly': ['owner'] });
    expect(canPostToRoom(allowed, room({ readOnly: true, roles: ['owner'] }))).toBe(true);
    expect(canPostToRoom(capabilities(), room({ readOnly: true }))).toBe(false);
    expect(canPostToRoom(capabilities(), room({ readOnly: true, unmutedForPosting: true }))).toBe(true);
  });

  it.each([{ joined: false }, { archived: true }, { blocked: true }, { blocker: true }, { mutedForPosting: true }])(
    'refuses a room with state %o',
    (state) => {
      expect(canPostToRoom(capabilities({ 'post-readonly': ['user'] }), room(state))).toBe(false);
    },
  );

  it('allows reactions in a restricted room only when the room explicitly allows them', () => {
    expect(canReact(capabilities(), room({ readOnly: true, reactWhenReadOnly: false }))).toBe(false);
    expect(canReact(capabilities(), room({ readOnly: true, reactWhenReadOnly: true }))).toBe(true);
  });
});

describe('action capabilities', () => {
  it('uses the room-kind leave permission and membership state', () => {
    const allowed = capabilities({ 'leave-c': ['user'], 'leave-p': ['admin'] });
    expect(canLeaveRoom(allowed, room())).toBe(true);
    expect(canLeaveRoom(allowed, room({ type: 'private', visibility: 'private' }))).toBe(false);
    expect(canLeaveRoom(allowed, room({ type: 'discussion', visibility: 'public' }))).toBe(true);
    expect(canLeaveRoom(allowed, room({ joined: false }))).toBe(false);
    expect(canLeaveRoom(allowed, room({ canLeave: false }))).toBe(false);
    expect(canLeaveRoom(allowed, room({ type: 'direct', visibility: 'direct' }))).toBe(false);
  });

  it('treats a slash-command permission array as alternatives', () => {
    const command = { command: 'create', permission: ['create-c', 'create-p'] } as SlashCommand;
    const allowed = capabilities({ 'create-c': ['admin'], 'create-p': ['owner'] });
    expect(canRunSlashCommand(allowed, command, room({ roles: ['owner'] }))).toBe(true);
    expect(canRunSlashCommand(allowed, command, room())).toBe(false);
  });

  it('applies the direct-upload and favorite settings', () => {
    const capped = capabilities();
    capped.settings.fileUpload.enabledDirect = false;
    capped.settings.ui.favoriteRooms = false;

    expect(canUpload(capped, room())).toBe(true);
    expect(canUpload(capped, room({ type: 'direct' }))).toBe(false);
    expect(canFavoriteRooms(capped)).toBe(false);
  });
});
