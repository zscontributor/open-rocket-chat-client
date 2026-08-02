import { useTranslation } from 'react-i18next';

import { type Capabilities } from '@/features/server/use-capabilities';

/** The gateway's own cap on the field, independent of the character rule. */
export const ROOM_NAME_MAX = 80;

/** Rocket.Chat's own default for `UTF8_Channel_Names_Validation`. */
const DEFAULT_NAME_PATTERN = '[0-9a-zA-Z-_.]+';

/**
 * The server's `UTF8_Channel_Names_Validation`.
 *
 * Read defensively: a gateway older than the capability reports no pattern, and
 * assuming Rocket.Chat's default is exactly what that gateway would have sent.
 */
const nameValidationPattern = (ui: Capabilities['settings']['ui'] | undefined): string => {
  const reported = (ui as { roomNameValidationPattern?: unknown } | undefined)?.roomNameValidationPattern;
  return typeof reported === 'string' && reported.length > 0 ? reported : DEFAULT_NAME_PATTERN;
};

export type RoomNameProblem = 'nameTooLong' | 'nameInvalid';

/**
 * Whether a room name is acceptable to the connected server.
 *
 * Which characters are allowed is entirely the server's decision, so this
 * mirrors what Rocket.Chat's own create-channel modal does rather than
 * inventing a rule:
 *
 * - `UI_Allow_room_names_with_special_chars` on → no client-side check at all.
 *   The server slugifies the name first (`Team Rocket` → `Team-Rocket`), so a
 *   name that looks invalid here is accepted there.
 * - Otherwise the name must match `UTF8_Channel_Names_Validation`, which
 *   defaults to `[0-9a-zA-Z-_.]+` — ASCII only, which is why an accented or
 *   spaced name is rejected until an administrator changes one of the two.
 */
export const roomNameProblem = (name: string, capabilities: Capabilities | undefined): RoomNameProblem | null => {
  if (name.length > ROOM_NAME_MAX) return 'nameTooLong';

  const ui = capabilities?.settings.ui;
  // Until capabilities land there is no rule to apply; the server still checks.
  if (!ui || ui.allowSpecialCharsInRoomNames) return null;

  let pattern: RegExp;
  try {
    pattern = new RegExp(`^${nameValidationPattern(ui)}$`);
  } catch {
    // An administrator can save a pattern that is not valid JavaScript; Rocket.Chat
    // falls back to its default in that case, and so does this.
    pattern = new RegExp(`^${DEFAULT_NAME_PATTERN}$`);
  }

  return pattern.test(name) ? null : 'nameInvalid';
};

/**
 * Hint and error text for the name field, driven by the same two settings that
 * decide whether the name is valid at all — so the two never disagree.
 */
export const useRoomNameCopy = (capabilities: Capabilities | undefined, problem: RoomNameProblem | null) => {
  const { t } = useTranslation('rooms');
  const ui = capabilities?.settings.ui;

  return {
    hint: ui?.allowSpecialCharsInRoomNames ? t('create.nameHintSpecialChars') : t('create.nameHint'),
    error: problem ? t(`create.${problem}`, { max: ROOM_NAME_MAX, pattern: nameValidationPattern(ui) }) : undefined,
  };
};

/**
 * How to lift the restriction, shown only once the user has actually hit it.
 *
 * The two settings do different things and the difference matters: the first
 * accepts spaces and punctuation by slugifying the name, while a genuinely
 * non-ASCII name needs the validation pattern widened.
 */
export const RoomNameSettingsHelp = () => {
  const { t } = useTranslation('rooms');

  return (
    <div className="border-line bg-sunken text-content-muted space-y-1.5 rounded-lg border p-3 text-xs">
      <p className="text-content font-medium">{t('create.nameSettingsTitle')}</p>
      <p>{t('create.nameSettingsIntro')}</p>
      <ul className="list-disc space-y-1 pl-4">
        <li>{t('create.nameSettingsSpecialChars')}</li>
        <li>{t('create.nameSettingsUtf8')}</li>
      </ul>
      <p>{t('create.nameSettingsAdminOnly')}</p>
    </div>
  );
};
