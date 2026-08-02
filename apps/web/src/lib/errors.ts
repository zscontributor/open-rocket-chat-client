import { GatewayError, NetworkError, type ErrorCode } from '@open-rocket-chat/client-sdk';
import i18next from 'i18next';

/**
 * Rocket.Chat error identifiers that say more than the HTTP-shaped `code` the
 * gateway derives from them.
 *
 * `error-not-allowed` is the clearest case: a server returns it both for a
 * permission the account lacks and for a feature an administrator switched off
 * — creating a direct message, say. "Forbidden" alone reads as an account
 * problem and sends people to ask for a role they already have.
 */
const UPSTREAM_KEYS = {
  'error-not-allowed': 'error.upstream.notAllowed',
  'error-duplicate-channel-name': 'error.upstream.duplicateName',
  'error-file-too-large': 'error.upstream.fileTooLarge',
  'error-message-size-exceeded': 'error.upstream.messageTooLong',
  'error-room-not-found': 'error.upstream.roomGone',
  'error-invalid-room': 'error.upstream.roomGone',
  'error-invalid-message': 'error.upstream.messageGone',
  /**
   * Answered for anything that acts on the caller's own subscription —
   * favouriting, hiding, marking read — when the server has no subscription for
   * them any more, usually because they were removed or left from another
   * client. The gateway can only derive `bad_request` from it, and "the server
   * rejected that request" gives no hint that the room list is simply stale.
   */
  'error-invalid-subscription': 'error.upstream.notSubscribed',
  'error-room-does-not-exist': 'error.upstream.roomGone',
  'error-message-not-found': 'error.upstream.messageGone',

  /**
   * The two ways out of a room that Rocket.Chat blocks on the last owner:
   * leaving it, and having the owner role taken away. Both name a fix — hand
   * ownership over first — that the derived `bad_request` hides completely.
   */
  'error-you-are-last-owner': 'error.upstream.lastOwner',
  'error-remove-last-owner': 'error.upstream.lastOwnerRole',

  /** Acting on a member the server no longer has in the room, or already has. */
  'error-user-not-in-room': 'error.upstream.notInRoom',
  'error-user-already-in-room': 'error.upstream.alreadyInRoom',

  /**
   * An archived room refuses writes of every kind — sending, inviting, editing
   * its settings — and says so with the room's name interpolated into English
   * prose. The state, not the name, is what the user has to act on.
   */
  'error-room-archived': 'error.upstream.roomArchived',

  /**
   * Naming a room: Rocket.Chat validates against its own slug rules and against
   * archived rooms, which are invisible here, so a name can be refused as taken
   * with nothing on screen holding it.
   */
  'error-invalid-room-name': 'error.upstream.invalidRoomName',
  'error-archived-duplicate-name': 'error.upstream.archivedDuplicateName',

  /** Editing after `Message_AllowEditing_BlockEditInMinutes` has run out. */
  'error-message-editing-blocked': 'error.upstream.editingBlocked',

  /**
   * A Rocket.Chat App rejected the action in a server-side hook. Nothing the
   * user did is wrong, and no permission of theirs would change it — worth
   * saying plainly so they stop retrying.
   */
  'error-app-prevented': 'error.upstream.appPrevented',
  'error-app-prevented-updating': 'error.upstream.appPrevented',
  'error-app-prevented-deleting': 'error.upstream.appPrevented',

  /** Upload blocked by the server's media type allow/deny list. */
  'error-invalid-file-type': 'error.upstream.invalidFileType',
} as const;

/**
 * The same table, for failures Rocket.Chat raises as a bare `Error` rather than
 * a `Meteor.Error`.
 *
 * Those carry no identifier at all: the server's REST layer reads one off
 * `error.error`, which a plain `Error` does not have, so the response arrives
 * with `errorType` missing and the whole meaning sitting in the message. The
 * message is then either a Rocket.Chat translation key (`You_have_been_muted`)
 * or an English sentence — neither is fit to show, and both are stable enough to
 * match on.
 *
 * `canSendMessage` is where this matters: muted, read-only, archived and blocked
 * are the everyday reasons a message will not send, and every one of them
 * reaches this client as a bare `bad_request`.
 */
const MESSAGE_KEYS = {
  You_have_been_muted: 'error.upstream.muted',
  room_is_archived: 'error.upstream.roomArchived',
  room_is_blocked: 'error.upstream.roomBlocked',
  "You can't send messages because the room is readonly.": 'error.upstream.readOnly',
  "You can't delete messages because the room is readonly.": 'error.upstream.readOnly',
} as const;

type UpstreamKey =
  (typeof UPSTREAM_KEYS)[keyof typeof UPSTREAM_KEYS] | (typeof MESSAGE_KEYS)[keyof typeof MESSAGE_KEYS];

/** Every key `describeError` can resolve, so callers stay type-checked. */
export type ErrorMessageKey = 'error.network' | 'error.unknown' | `error.code.${ErrorCode}` | UpstreamKey;

/** Injected in tests; in the app it is i18next's own `t`, on the common bundle. */
export type ErrorTranslate = (key: ErrorMessageKey) => string;

const translateWithI18next: ErrorTranslate = (key) => i18next.t(key, { ns: 'common' });

/**
 * A payload the gateway rejects arrives as a flat `Invalid body`, with the part
 * the user can actually act on buried in `details.issues`. That text names the
 * offending field, so it beats anything this module could say instead.
 */
const validationMessage = (error: GatewayError): string | null => {
  const issues = error.details?.issues;
  if (!Array.isArray(issues)) return null;

  const messages = issues
    .map((issue) => (issue as { message?: unknown }).message)
    .filter((message): message is string => typeof message === 'string' && message.length > 0);

  return messages.length > 0 ? messages.join(' ') : null;
};

const lookup = (candidate: string | undefined): UpstreamKey | undefined => {
  if (!candidate) return undefined;
  if (candidate in UPSTREAM_KEYS) return UPSTREAM_KEYS[candidate as keyof typeof UPSTREAM_KEYS];
  if (candidate in MESSAGE_KEYS) return MESSAGE_KEYS[candidate as keyof typeof MESSAGE_KEYS];

  return undefined;
};

/**
 * The translation for whichever of the two carries the meaning: the identifier
 * when Rocket.Chat sent one, the message when it did not.
 *
 * Matching the message against `UPSTREAM_KEYS` too is deliberate — the bare
 * `Error('error-invalid-room')` throws put an identifier there, in the field
 * that would otherwise hold prose.
 */
const upstreamKeyFor = (error: GatewayError): UpstreamKey | undefined =>
  lookup(error.upstream) ?? lookup(error.message);

/**
 * What Rocket.Chat itself said, for the identifiers this module has no
 * translation for.
 *
 * Rocket.Chat answers a refusal like "You are the last owner. Please set new
 * owner before leaving the room." — a sentence that names the actual blocker and
 * the way out of it. The generic text for the `code` the gateway derives from it
 * ("the server rejected that request") throws all of that away, and there will
 * always be more of these identifiers than this file knows about. Untranslated
 * but true beats translated and useless.
 *
 * Only `bad_request` is read this way: it is the one code for which the gateway
 * forwards the upstream text at all, and the wording it substitutes for the rest
 * is English prose no better than the translated `code` line beside it.
 *
 * The trailing `[error-you-are-last-owner]` the server appends is stripped. What
 * is left has to look like a sentence: some routes answer with nothing but the
 * identifier, or with a Rocket.Chat translation key, and neither belongs in a
 * toast.
 */
const upstreamMessage = (error: GatewayError): string | null => {
  if (error.code !== 'bad_request') return null;
  // A rejected payload never reached Rocket.Chat: the message is the gateway's
  // own `Invalid body`, and whatever `details.issues` held was tried already.
  if (error.details?.issues) return null;

  const message = error.message.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  if (message.length === 0 || !message.includes(' ')) return null;

  return message;
};

/**
 * The sentence to show a user for a failed call, in their language.
 *
 * Preference order, most specific first: a translation for what Rocket.Chat
 * refused, then Rocket.Chat's own sentence where there is no translation for it,
 * then the stable `code`. Anything the gateway wrote itself is skipped — that
 * text is the same string for every `forbidden` regardless of what was refused.
 *
 * Identifiers stay out of `UPSTREAM_KEYS` when Rocket.Chat's own sentence is
 * already specific: `error-action-not-allowed` covers a dozen different
 * refusals — "Changing a private group to a public channel is not allowed",
 * "Editing room retention policy is not allowed" — and one translated line for
 * all of them would say less than the English it replaced.
 */
export const describeError = (error: unknown, translate: ErrorTranslate = translateWithI18next): string => {
  if (error instanceof NetworkError) return translate('error.network');
  if (!(error instanceof GatewayError)) return translate('error.unknown');

  const validation = validationMessage(error);
  if (validation) return validation;

  const upstreamKey = upstreamKeyFor(error);
  if (upstreamKey) return translate(upstreamKey);

  return upstreamMessage(error) ?? translate(`error.code.${error.code}`);
};
