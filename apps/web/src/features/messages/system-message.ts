import type { Attachment, Message } from '@open-rocket-chat/client-sdk';
import type { TFunction } from 'i18next';

/**
 * Rocket.Chat system message types mapped to translation keys, covering the
 * full registry the server can emit (`MessageTypes` in core-typings) rather
 * than the handful a channel produces on its first day. Anything still not
 * listed falls back to the raw payload, then to the type name, which is at
 * least a clue instead of a blank line.
 *
 * Two placeholders are available to every string: `name` is the user the event
 * is attributed to, `value` is the message payload — the added username, the
 * new topic, the room being converted. Which of the two a sentence needs is
 * decided by the translation, not by this table.
 */
// `as const` keeps the literal key types, so the typed `t()` can still verify
// that each one exists in the English bundle.
export const SYSTEM_KEYS = {
  // Membership.
  uj: 'system.userJoined',
  ul: 'system.userLeft',
  ujt: 'system.userJoinedTeam',
  ult: 'system.userLeftTeam',
  ut: 'system.userJoinedConversation',
  au: 'system.userAdded',
  ru: 'system.userRemoved',
  ui: 'system.userInvited',
  uir: 'system.invitationRejected',
  wm: 'system.welcome',
  'added-user-to-team': 'system.userAddedToTeam',
  'removed-user-from-team': 'system.userRemovedFromTeam',
  'abac-removed-user-from-room': 'system.accessPolicyRemovedUser',

  // Moderation.
  'user-muted': 'system.userMuted',
  'user-unmuted': 'system.userUnmuted',
  'user-banned': 'system.userBanned',
  'user-unbanned': 'system.userUnbanned',

  // Roles. The role itself is not carried on the message, so the generic
  // wording is deliberate — naming a role we do not have would be a guess.
  'subscription-role-added': 'system.roleAdded',
  'subscription-role-removed': 'system.roleRemoved',
  // Superseded by the two above, but older servers still emit them.
  'new-owner': 'system.ownerAdded',
  'owner-removed': 'system.ownerRemoved',
  'new-moderator': 'system.moderatorAdded',
  'moderator-removed': 'system.moderatorRemoved',
  'new-leader': 'system.leaderAdded',
  'leader-removed': 'system.leaderRemoved',

  // Room settings.
  r: 'system.roomNameChanged',
  room_changed_topic: 'system.topicChanged',
  room_changed_description: 'system.descriptionChanged',
  room_changed_announcement: 'system.announcementChanged',
  room_changed_avatar: 'system.avatarChanged',
  room_changed_privacy: 'system.privacyChanged',
  'room-archived': 'system.roomArchived',
  'room-unarchived': 'system.roomUnarchived',
  'room-set-read-only': 'system.readOnlySet',
  'room-removed-read-only': 'system.readOnlyRemoved',
  'room-allowed-reacting': 'system.reactingAllowed',
  'room-disallowed-reacting': 'system.reactingDisallowed',

  // Teams and discussions.
  'user-converted-to-team': 'system.convertedToTeam',
  'user-converted-to-channel': 'system.convertedToChannel',
  'user-added-room-to-team': 'system.roomAddedToTeam',
  'user-removed-room-from-team': 'system.roomRemovedFromTeam',
  'user-deleted-room-from-team': 'system.roomDeletedFromTeam',
  'discussion-created': 'system.discussionCreated',

  // Messages.
  rm: 'system.messageRemoved',
  message_pinned: 'system.messagePinned',
  message_pinned_e2e: 'system.messagePinned',

  // Encryption. A `t: 'e2e'` message carries ciphertext, so it reuses the same
  // placeholder an encrypted chat message gets rather than announcing an event.
  room_e2e_enabled: 'system.encryptionEnabled',
  room_e2e_disabled: 'system.encryptionDisabled',
  e2e: 'encrypted',

  // Calls. `videoconf` is the current conference type; `jitsi_call_started` is
  // what servers running the old Jitsi bridge send for the same thing.
  videoconf: 'system.callStarted',
  jitsi_call_started: 'system.callStarted',

  // Omnichannel. The transfer, transcript and navigation events carry their
  // detail in fields the gateway does not expose, so those read as summaries.
  'livechat-started': 'system.chatStarted',
  'livechat-close': 'system.chatClosed',
  livechat_video_call: 'system.videoCallRequested',
  livechat_transfer_history: 'system.chatTransferred',
  livechat_transfer_history_fallback: 'system.chatTransferFailed',
  livechat_transcript_history: 'system.transcriptSent',
  livechat_navigation_history: 'system.visitorNavigated',
  omnichannel_placed_chat_on_hold: 'system.chatOnHold',
  omnichannel_on_hold_chat_resumed: 'system.chatResumed',
  omnichannel_priority_change_history: 'system.priorityChanged',
  omnichannel_sla_change_history: 'system.slaChanged',
} as const;

/**
 * The one-line label a system message renders as in the timeline.
 */
export const systemMessageLabel = (message: Message, t: TFunction<'messages'>): string => {
  const key = message.systemType ? SYSTEM_KEYS[message.systemType as keyof typeof SYSTEM_KEYS] : undefined;

  if (!key) {
    // An unmapped type still has its payload — a `/me`-style custom event says
    // more in its own words than the bare type name does.
    return message.text || t('system.unknown', { type: message.systemType ?? '' });
  }

  return t(key, {
    name: message.sender.displayName,
    // A topic or description can be cleared, and "changed the topic to" with
    // nothing after it reads like the sentence was cut off.
    value: message.text.trim() || t('system.none'),
  });
};

/** The system types that carry a copy of the message that was pinned. */
const PINNED_TYPES = new Set(['message_pinned', 'message_pinned_e2e']);

/**
 * The pinned message, as quoted on the event that announced the pin.
 *
 * Rocket.Chat keeps no reference from the event back to the message it was
 * raised for: the server copies the message's author, time and text onto the
 * event as its single attachment, and that copy is what every Rocket.Chat
 * client renders under the label. So the timeline can show what was pinned
 * without going looking for a message it has no id for — but equally, what it
 * shows is the message as it stood when it was pinned, not as it stands now.
 */
export const pinnedQuoteOf = (message: Message): Attachment | null => {
  if (!message.systemType || !PINNED_TYPES.has(message.systemType)) return null;

  return message.attachments[0] ?? null;
};

/** Whether a pinned quote holds ciphertext rather than text the client can show. */
export const isPinnedQuoteEncrypted = (message: Message): boolean => message.systemType === 'message_pinned_e2e';
