/**
 * Finding the token the caret is sitting in, so the composer can offer
 * completions for it.
 *
 * Pure on purpose: the rules for what counts as a mention are fiddly enough
 * (an email address is not one, a slash halfway through a sentence is not a
 * command) that they deserve tests of their own, without a textarea in the way.
 */

export type AutocompleteKind = 'user' | 'channel' | 'command';

export interface AutocompleteToken {
  kind: AutocompleteKind;
  /** Index of the trigger character itself. */
  start: number;
  /** End of the token, which is always the caret. */
  end: number;
  /** What was typed after the trigger; empty right after typing it. */
  term: string;
}

const TRIGGERS: Record<string, AutocompleteKind> = {
  '@': 'user',
  '#': 'channel',
  '/': 'command',
};

/**
 * Past this the user is writing prose, not picking from a list — and a runaway
 * term would otherwise keep the panel open across a whole paragraph.
 */
const MAX_TERM_LENGTH = 40;

/**
 * The token the caret is in, or `null` when there is nothing to complete.
 *
 * A trigger only counts at the start of the text or after whitespace, which is
 * what keeps `user@example.com` and `path/to/file` from opening a panel. The
 * term itself stops at the first space: once there is one, the user has moved
 * on to the next word (or, for a command, to its arguments).
 */
export const findAutocompleteToken = (text: string, caret: number): AutocompleteToken | null => {
  const before = text.slice(0, caret);

  for (let index = before.length - 1; index >= 0; index -= 1) {
    const character = before[index] as string;

    // Whitespace ends the search: any trigger further back belongs to an
    // earlier word, which the caret has already left.
    if (/\s/.test(character)) return null;

    const kind = TRIGGERS[character];
    if (!kind) continue;

    const preceding = index === 0 ? '' : (before[index - 1] as string);
    if (preceding !== '' && !/\s/.test(preceding)) return null;

    // A slash is only a command when it opens the message. Anywhere else it is
    // a date, a path, or a fraction.
    if (kind === 'command' && index !== 0) return null;

    const term = before.slice(index + 1);
    if (term.length > MAX_TERM_LENGTH) return null;

    return { kind, start: index, end: caret, term };
  }

  return null;
};

/**
 * The command a draft invokes, or `null` when it is an ordinary message.
 *
 * Only the leading word is read; everything after the first space is handed to
 * the command untouched, because Rocket.Chat parses arguments per command and
 * splitting them here would be guessing.
 *
 * Whether the command *exists* is not decided here — the caller checks it
 * against the server's list, and sends the text as a message when it finds
 * nothing, rather than failing on a stray slash.
 */
export const parseSlashCommand = (text: string): { command: string; params: string } | null => {
  const match = /^\/([\w.-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return null;

  return { command: match[1] as string, params: (match[2] ?? '').trim() };
};

/**
 * Replaces the token with the chosen value, leaving the caret after the trailing
 * space so typing can continue straight away.
 *
 * The space is only added when the text does not already have one there —
 * completing a mention the user went back to fix should not push a second space
 * into the middle of the sentence.
 */
export const replaceAutocompleteToken = (
  text: string,
  token: AutocompleteToken,
  value: string,
): { text: string; caret: number } => {
  const trailing = text.slice(token.end);
  const spaced = trailing.startsWith(' ') ? value : `${value} `;

  return {
    text: `${text.slice(0, token.start)}${spaced}${trailing}`,
    caret: token.start + spaced.length,
  };
};
