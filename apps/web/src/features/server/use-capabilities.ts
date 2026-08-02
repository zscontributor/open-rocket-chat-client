import type { Message, RoomSummary, ServerCapabilities, SlashCommand, UserSummary } from '@open-rocket-chat/client-sdk';
import { useQuery } from '@tanstack/react-query';
import { differenceInMinutes } from 'date-fns';

import { useClient, useServerKeys } from '@/features/servers/server-scope';

/**
 * What the connected Rocket.Chat server allows.
 *
 * Every feature gate in the client reads from here rather than assuming, so a
 * server with editing disabled or uploads capped does not show buttons that
 * fail when pressed. The checks below mirror the ones Rocket.Chat's own client
 * performs, so this client agrees with every other one on the same server.
 */
export const useCapabilities = (enabled = true) => {
  const client = useClient();
  const keys = useServerKeys();

  return useQuery({
    // Per server: two Rocket.Chat servers in one session routinely differ on
    // message editing, upload limits and permissions.
    queryKey: keys.capabilities,
    queryFn: () => client.server.capabilities(),
    enabled,
    // Administrators change these rarely, and the gateway caches them anyway.
    staleTime: 60_000,
  });
};

export type Capabilities = ServerCapabilities;

/**
 * Rocket.Chat's permission model: a permission is held when its role list
 * intersects the user's server-wide roles or their roles in this room.
 */
export const hasPermission = (
  capabilities: Capabilities | undefined,
  permission: string,
  roomRoles: string[] = [],
): boolean => {
  const roles = capabilities?.permissions.rolesByPermission[permission];
  if (!roles || roles.length === 0) return false;

  const held = new Set([...(capabilities?.permissions.userRoles ?? []), ...roomRoles]);
  return roles.some((role) => held.has(role));
};

/** Rocket.Chat treats a permission array as alternatives, notably on slash commands. */
export const hasAtLeastOnePermission = (
  capabilities: Capabilities | undefined,
  permissions: string | readonly string[],
  roomRoles: string[] = [],
): boolean => {
  const ids = typeof permissions === 'string' ? [permissions] : permissions;
  return ids.some((permission) => hasPermission(capabilities, permission, roomRoles));
};

/** Whether this subscription may currently post messages or files. */
export const canPostToRoom = (capabilities: Capabilities | undefined, room: RoomSummary | undefined): boolean => {
  if (!capabilities || !room?.joined || room.archived || room.blocked || room.blocker) return false;
  if (room.mutedForPosting) return false;
  if (!room.readOnly || room.unmutedForPosting) return true;
  return hasPermission(capabilities, 'post-readonly', room.roles);
};

export const canRunSlashCommand = (
  capabilities: Capabilities | undefined,
  command: SlashCommand,
  room: RoomSummary | undefined,
): boolean =>
  Boolean(room?.joined) &&
  (command.permission === null || hasAtLeastOnePermission(capabilities, command.permission, room?.roles ?? []));

const withinTimeLimit = (createdAt: string, limitMinutes: number): boolean => {
  if (limitMinutes <= 0) return true;
  return differenceInMinutes(new Date(), new Date(createdAt)) < limitMinutes;
};

/**
 * Mirrors `useEditMessageAction` in Rocket.Chat's client: the permission alone
 * is enough; otherwise the setting must be on *and* the message must be your
 * own — and the time limit applies unless you can bypass it.
 */
export const canEditMessage = (
  capabilities: Capabilities | undefined,
  message: Message,
  room: RoomSummary | undefined,
  currentUserId: string,
): boolean => {
  if (!capabilities || message.kind === 'system') return false;

  const roomRoles = room?.roles ?? [];
  const isOwn = message.sender.id === currentUserId;

  if (!hasPermission(capabilities, 'edit-message', roomRoles)) {
    if (!capabilities.settings.message.allowEditing || !isOwn) return false;
  }

  if (hasPermission(capabilities, 'bypass-time-limit-edit-and-delete', roomRoles)) return true;
  return withinTimeLimit(message.createdAt, capabilities.settings.message.blockEditInMinutes);
};

/** The delete counterpart, including Rocket.Chat's `force-delete-message` override. */
export const canDeleteMessage = (
  capabilities: Capabilities | undefined,
  message: Message,
  room: RoomSummary | undefined,
  currentUserId: string,
): boolean => {
  if (!capabilities) return false;

  const roomRoles = room?.roles ?? [];
  if (hasPermission(capabilities, 'force-delete-message', roomRoles)) return true;

  const isOwn = message.sender.id === currentUserId;
  if (!hasPermission(capabilities, 'delete-message', roomRoles)) {
    if (!capabilities.settings.message.allowDeleting || !isOwn) return false;
  }

  if (hasPermission(capabilities, 'bypass-time-limit-edit-and-delete', roomRoles)) return true;
  return withinTimeLimit(message.createdAt, capabilities.settings.message.blockDeleteInMinutes);
};

export const canPinMessage = (capabilities: Capabilities | undefined, room: RoomSummary | undefined): boolean =>
  Boolean(capabilities?.settings.message.allowPinning) && hasPermission(capabilities, 'pin-message', room?.roles ?? []);

export const canStarMessage = (capabilities: Capabilities | undefined): boolean =>
  Boolean(capabilities?.settings.message.allowStarring);

/** Off when the server disables it, or the room is read-only and you cannot post. */
export const canReact = (capabilities: Capabilities | undefined, room: RoomSummary | undefined): boolean => {
  if (!capabilities || !room?.joined || room.archived || room.blocked || room.blocker) return false;

  const writeRestricted =
    room.mutedForPosting ||
    (room.readOnly && !room.unmutedForPosting && !hasPermission(capabilities, 'post-readonly', room.roles));
  return !writeRestricted || room.reactWhenReadOnly;
};

export const canUseThreads = (capabilities: Capabilities | undefined): boolean =>
  Boolean(capabilities?.settings.threads.enabled);

export const canUpload = (capabilities: Capabilities | undefined, room?: RoomSummary): boolean =>
  Boolean(capabilities?.settings.fileUpload.enabled) &&
  (room?.type !== 'direct' || Boolean(capabilities?.settings.fileUpload.enabledDirect));

export const canFavoriteRooms = (capabilities: Capabilities | undefined): boolean =>
  Boolean(capabilities?.settings.ui.favoriteRooms);

export const canChangeStatusMessage = (capabilities: Capabilities | undefined): boolean =>
  Boolean(capabilities?.settings.accounts.allowStatusMessageChange);

/**
 * Presence is user-controlled unless the server switched broadcasting off.
 *
 * The section is read defensively because capabilities survive a reload from
 * IndexedDB: a payload written before `presence` joined the contract restores
 * without it, and a required-by-type field that is missing at runtime would
 * take the whole menu down. Absent means "not disabled", which is what a server
 * too old to report the setting is in fact doing.
 */
export const canChangePresence = (capabilities: Capabilities | undefined): boolean =>
  capabilities !== undefined && !capabilities.settings?.presence?.broadcastDisabled;

export const canLeaveRoom = (capabilities: Capabilities | undefined, room: RoomSummary): boolean => {
  if (!room.joined || !room.canLeave) return false;
  if (room.visibility === 'public') return hasPermission(capabilities, 'leave-c', room.roles);
  if (room.visibility === 'private') return hasPermission(capabilities, 'leave-p', room.roles);
  return false;
};

// ---------------------------------------------------------------------------
// Creating rooms
//
// Rocket.Chat grants a separate permission per kind, so an administrator can
// switch off public channels while leaving private ones and direct messages
// alone. `useCreateNewItems` checks each one before offering the matching entry
// and `useCreateNewMenu` hides the whole "Create new" section when none of them
// is held — a client that only checks `create-c`/`create-p` still lets people
// open a form the server will refuse.
// ---------------------------------------------------------------------------

const CREATE_PERMISSION = { channel: 'create-c', private: 'create-p', direct: 'create-d' } as const;

export type CreateRoomKind = keyof typeof CREATE_PERMISSION;

/** Every kind, in the order the create form offers them. */
export const CREATE_ROOM_KINDS = Object.keys(CREATE_PERMISSION) as CreateRoomKind[];

export const canCreateRoom = (capabilities: Capabilities | undefined, type: CreateRoomKind): boolean =>
  hasPermission(capabilities, CREATE_PERMISSION[type]);

/** Whether anything at all may be created, i.e. whether to offer the entry point. */
export const canCreateAnyRoom = (capabilities: Capabilities | undefined): boolean =>
  CREATE_ROOM_KINDS.some((kind) => canCreateRoom(capabilities, kind));

/**
 * Whether the new room may be made read-only.
 *
 * Rocket.Chat checks `set-readonly` with `owner` added to the scope, because
 * whoever creates a room owns it: holding the permission as an owner is enough
 * for the room being created, even without it server-wide.
 */
export const canSetReadOnlyOnNewRoom = (capabilities: Capabilities | undefined): boolean =>
  hasPermission(capabilities, 'set-readonly', ['owner']);

/**
 * Encryption is offered for private rooms only, and only when the server has
 * end-to-end encryption switched on. Mirrors `e2eDisabled` in Rocket.Chat's
 * create-channel modal, which disables the toggle on both counts.
 */
export const canEncryptNewRoom = (capabilities: Capabilities | undefined, type: CreateRoomKind): boolean =>
  type === 'private' && Boolean(capabilities?.settings.encryption.enabled);

export const canEditRoom = (capabilities: Capabilities | undefined, room: RoomSummary | undefined): boolean =>
  hasPermission(capabilities, 'edit-room', room?.roles ?? []);

/**
 * Whether the room's picture may be changed.
 *
 * `edit-room-avatar` is granted separately from `edit-room`, and Rocket.Chat
 * checks it on its own when a settings save carries the avatar field — so
 * somebody who may rename a room is not necessarily allowed to re-picture it.
 * A direct message is excluded because its picture is the other person's.
 */
export const canEditRoomAvatar = (capabilities: Capabilities | undefined, room: RoomSummary | undefined): boolean => {
  if (!room || room.type === 'direct' || room.type === 'omnichannel') return false;
  return canEditRoom(capabilities, room) && hasPermission(capabilities, 'edit-room-avatar', room.roles);
};

/**
 * Whether the signed-in user may change their own picture.
 *
 * `Accounts_AllowUserAvatarChange` is a server-wide setting rather than a
 * permission: an administrator can freeze avatars for everybody, usually
 * because they come from an identity provider instead.
 */
export const canChangeOwnAvatar = (capabilities: Capabilities | undefined): boolean =>
  Boolean(capabilities?.settings.accounts.allowAvatarChange);

/**
 * Whether a room may be switched between public and private.
 *
 * Mirrors `getCanChangeType`: the switch amounts to creating a room of the
 * other kind, so it needs that kind's create permission — and a server default
 * room is pinned to its type for everyone but an administrator.
 */
export const canChangeRoomType = (capabilities: Capabilities | undefined, room: RoomSummary): boolean => {
  if (room.isDefault && !(capabilities?.permissions.userRoles.includes('admin') ?? false)) return false;
  if (room.type === 'private') return canCreateRoom(capabilities, 'channel');
  if (room.type === 'channel') return canCreateRoom(capabilities, 'private');
  return false;
};

// ---------------------------------------------------------------------------
// Contextual bar
//
// Rocket.Chat gates each panel and each member action separately, and several
// of them also depend on the *kind* of room: there is no owner to promote in a
// direct message, and nobody to remove from one. Both halves are checked here
// so a panel never offers an action the server will refuse.
// ---------------------------------------------------------------------------

/** Room kinds that have a membership worth listing or managing. */
const hasManagedMembership = (room: RoomSummary | undefined): boolean =>
  room !== undefined && room.type !== 'direct' && room.type !== 'omnichannel';

/**
 * Mirrors `useMembersListRoomAction`: a broadcast room hides its roll from
 * everyone without the permission, because in a broadcast the audience is not
 * meant to be able to enumerate itself.
 */
export const canViewMembers = (capabilities: Capabilities | undefined, room: RoomSummary | undefined): boolean => {
  if (!hasManagedMembership(room)) return false;
  if (room?.broadcast && !hasPermission(capabilities, 'view-broadcast-member-list', room.roles)) return false;
  return true;
};

/**
 * Rocket.Chat accepts any one of three permissions here — two that grant it for
 * every room of a kind, and one that grants it only for rooms you are in.
 */
export const canAddMembers = (capabilities: Capabilities | undefined, room: RoomSummary | undefined): boolean => {
  if (!hasManagedMembership(room) || !room?.joined || room.archived) return false;

  const roomRoles = room?.roles ?? [];
  const scoped = room?.type === 'channel' ? 'add-user-to-any-c-room' : 'add-user-to-any-p-room';
  return (
    hasPermission(capabilities, scoped, roomRoles) || hasPermission(capabilities, 'add-user-to-joined-room', roomRoles)
  );
};

export const canRemoveMember = (capabilities: Capabilities | undefined, room: RoomSummary | undefined): boolean =>
  hasManagedMembership(room) && hasPermission(capabilities, 'remove-user', room?.roles ?? []);

/** `set-owner`, `set-moderator` and `set-leader` are granted independently. */
export const canSetRoomRole = (
  capabilities: Capabilities | undefined,
  room: RoomSummary | undefined,
  role: 'owner' | 'moderator' | 'leader',
): boolean => hasManagedMembership(room) && hasPermission(capabilities, `set-${role}`, room?.roles ?? []);

export const canMuteMember = (capabilities: Capabilities | undefined, room: RoomSummary | undefined): boolean =>
  hasManagedMembership(room) && hasPermission(capabilities, 'mute-user', room?.roles ?? []);

/** Bulk deletion. The one action in the bar that can destroy a room's history. */
export const canPruneMessages = (capabilities: Capabilities | undefined, room: RoomSummary | undefined): boolean =>
  hasPermission(capabilities, 'clean-channel-history', room?.roles ?? []);

/**
 * Whether the Pinned panel is offered at all.
 *
 * Gated on the setting rather than the permission: `pin-message` says who may
 * pin, while the panel merely lists what already is, and Rocket.Chat hides the
 * tab entirely when pinning is switched off server-wide.
 */
export const canViewPinnedMessages = (capabilities: Capabilities | undefined): boolean =>
  Boolean(capabilities?.settings.message.allowPinning);

/** Mentions are a channel concept; a direct message is entirely "mentions". */
export const canViewMentions = (room: RoomSummary | undefined): boolean => hasManagedMembership(room);

/** Message length limit, for the composer's counter and its send guard. */
export const maxMessageLength = (capabilities: Capabilities | undefined): number =>
  capabilities?.settings.message.maxAllowedSize ?? 5000;

/**
 * Whether a draft over that limit may be offered as a `.txt` upload instead of
 * simply being refused.
 *
 * Both halves are Rocket.Chat's: the conversion is a setting an administrator
 * can switch off, and it produces a file, so it is worth nothing on a server
 * where uploads are disabled.
 */
export const canConvertLongMessage = (capabilities: Capabilities | undefined, room?: RoomSummary): boolean =>
  canUpload(capabilities, room) && Boolean(capabilities?.settings.message.allowConvertLongMessagesToAttachment);

/** Seconds within which consecutive messages from one author are grouped. */
export const groupingPeriodMs = (capabilities: Capabilities | undefined): number =>
  (capabilities?.settings.message.groupingPeriodSeconds ?? 300) * 1000;

/**
 * Whether a file may be attached, per the server's media-type lists.
 *
 * Rocket.Chat treats an empty allow list as "anything", and the block list
 * always wins. Both accept `image/*` style wildcards.
 */
export const fileUploadRejection = (
  capabilities: Capabilities | undefined,
  file: { type: string; size: number },
  room?: RoomSummary,
): 'disabled' | 'type' | 'size' | null => {
  const settings = capabilities?.settings.fileUpload;
  if (!settings) return null;
  if (!canUpload(capabilities, room)) return 'disabled';
  if (settings.maxFileSizeBytes > 0 && file.size > settings.maxFileSizeBytes) return 'size';

  const matches = (pattern: string): boolean => {
    if (pattern === file.type) return true;
    const [group] = pattern.split('/');
    return pattern.endsWith('/*') && file.type.startsWith(`${group}/`);
  };

  if (settings.blockedMediaTypes.some(matches)) return 'type';
  if (settings.acceptedMediaTypes.length > 0 && !settings.acceptedMediaTypes.some(matches)) return 'type';

  return null;
};

/**
 * The name to show for a user.
 *
 * `UI_Use_Real_Name` is a server-wide choice between real names and usernames;
 * ignoring it makes this client disagree with every other Rocket.Chat client
 * connected to the same server.
 */
export const displayNameOf = (capabilities: Capabilities | undefined, user: UserSummary): string =>
  capabilities?.settings.ui.useRealName ? user.displayName : user.username || user.displayName;
