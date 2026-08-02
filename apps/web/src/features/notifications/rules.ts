import type { PresenceStatus } from '@open-rocket-chat/client-sdk';

/**
 * When a notification the server sent should actually reach the screen.
 *
 * Kept apart from the hooks that apply it because this is the whole of the
 * client's contribution to notifications, and it is worth being able to state —
 * and test — without a browser. Rocket.Chat spreads the same three rules across
 * `useNotifyUser` and `useDesktopNotification`; they are collected here.
 */

/** Seconds a notification stays up when the server expresses no preference. */
export const DEFAULT_DURATION_SECONDS = 10;

/** Where the message landed relative to what the user is doing. */
export interface Attention {
  /** Whether this window is the one the user is looking at. */
  hasFocus: boolean;
  /** Whether the notification is about the conversation currently open. */
  isOpenRoom: boolean;
}

export interface AnnounceState extends Attention {
  /** The preference: stay quiet about the conversation already on screen. */
  muteFocusedConversations: boolean;
}

export interface ScreenState extends Attention {
  /** The notified account's presence, which is not always the active server's. */
  status?: PresenceStatus | null;
}

/**
 * Rocket.Chat's `useNotifyUser` rule.
 *
 * A message is announced unless all three of "the window has focus", "it is the
 * room on screen" and "focused conversations are muted" hold at once — that
 * combination is the only one where the user is provably already reading it.
 */
export const shouldAnnounce = ({ hasFocus, isOpenRoom, muteFocusedConversations }: AnnounceState): boolean =>
  !hasFocus || !isOpenRoom || !muteFocusedConversations;

/**
 * Rocket.Chat's `useDesktopNotification` rule, applied after {@link shouldAnnounce}.
 *
 * Two further suppressions that hold regardless of the mute preference: a
 * conversation being read as the message lands does not need announcing, and
 * someone who has set themselves busy has said as much already.
 */
export const shouldShowOnScreen = ({ hasFocus, isOpenRoom, status }: ScreenState): boolean => {
  if (isOpenRoom && hasFocus) return false;
  if (status === 'busy') return false;
  return true;
};

/** Both gates, in the order Rocket.Chat applies them. */
export const shouldNotify = (state: AnnounceState & ScreenState): boolean =>
  shouldAnnounce(state) && shouldShowOnScreen(state);

/**
 * How long to leave the notification up, in milliseconds, or `null` to leave it
 * to the user.
 *
 * Asking to keep notifications on screen and then closing them on a timer would
 * defeat the setting, so the two are mutually exclusive.
 */
export const dismissAfterMs = (durationSeconds: number | null, requireInteraction: boolean): number | null => {
  if (requireInteraction) return null;

  const seconds = durationSeconds ?? DEFAULT_DURATION_SECONDS;
  return seconds > 0 ? seconds * 1000 : null;
};

/**
 * The notification body is rendered by the operating system rather than the
 * page, so any markup in it would show up as literal angle brackets.
 * Rocket.Chat strips tags here for the same reason.
 */
export const stripTags = (text: string): string => text.replace(/<\/?[^>]+>/g, '');
