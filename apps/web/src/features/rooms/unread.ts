import type { RoomSummary } from '@open-rocket-chat/client-sdk';
import type { TFunction } from 'i18next';

/**
 * What the sidebar says about a room nobody has read yet.
 *
 * Ported from Rocket.Chat's `getSubscriptionUnreadData`. The rule worth
 * spelling out: the badge counts *every* unread message, and mentions only
 * decide its colour. Showing the mention count instead would tell someone with
 * twelve unread messages, one of which names them, that they have one.
 */

/** Above this the exact number stops informing and starts being noise. */
export const UNREAD_DISPLAY_MAX = 99;

/** `120` -> `+99`, the cap Rocket.Chat shows on a badge this small. */
export const formatUnreadCount = (count: number): string =>
  count > UNREAD_DISPLAY_MAX ? `+${UNREAD_DISPLAY_MAX}` : String(count);

export type UnreadCounts = Pick<
  RoomSummary,
  'unreadCount' | 'userMentionsCount' | 'groupMentionsCount' | 'hasUnreadActivity'
>;

export interface UnreadSummary {
  /** The number on the badge: all unread messages, not only the mentions. */
  total: number;
  /** Direct and group mentions together — what turns the badge red. */
  mentions: number;
  showBadge: boolean;
  /**
   * Whether the room name should read as unread. Rocket.Chat highlights on its
   * `alert` flag as well as the count, because a room can be marked unread
   * without any message being new.
   */
  highlight: boolean;
}

export const unreadSummary = (room: UnreadCounts): UnreadSummary => {
  const mentions = room.userMentionsCount + room.groupMentionsCount;
  // `max` rather than the plain unread count: Rocket.Chat can report a mention
  // whose message has already been counted as read, and swallowing the badge in
  // that case would hide the one notification that most deserves showing.
  const total = Math.max(room.unreadCount, mentions);

  return {
    total,
    mentions,
    showBadge: total > 0,
    highlight: total > 0 || room.hasUnreadActivity,
  };
};

/**
 * Every room of one server rolled into a single count.
 *
 * Summed from the per-room summaries rather than from the raw fields, so the
 * `max` above is applied where it belongs — once per room — instead of once
 * across a whole server, where it would let one room's mentions cancel out
 * another room's unread messages.
 */
export const aggregateUnread = (rooms: readonly UnreadCounts[]): UnreadSummary => {
  let total = 0;
  let mentions = 0;
  let highlight = false;

  for (const room of rooms) {
    const summary = unreadSummary(room);

    total += summary.total;
    mentions += summary.mentions;
    highlight ||= summary.highlight;
  }

  return { total, mentions, showBadge: total > 0, highlight };
};

/**
 * What the badge means, spelled out for screen readers and for the tooltip.
 *
 * The badge itself is a bare number, which on its own tells a screen reader
 * nothing at all. Rocket.Chat builds the same sentence by joining the parts it
 * has with commas.
 */
export const unreadLabel = ({ total, mentions }: UnreadSummary, t: TFunction<'rooms'>): string => {
  const messages = total - mentions;

  const parts = [
    ...(mentions > 0 ? [t('unread.mentions', { count: mentions })] : []),
    ...(messages > 0 ? [t('unread.messages', { count: messages })] : []),
  ];

  // The fallback is only reached with nothing unread at all, where no badge is
  // rendered in the first place.
  return parts.join(t('unread.separator')) || t('unread.messages', { count: total });
};
