/**
 * The chord modifier this platform labels shortcuts with: `⌘` on Apple
 * hardware, `Ctrl` everywhere else.
 *
 * Shared so the shortcuts panel and the formatting menu cannot disagree about
 * which key a user is being told to press.
 */
export const modifierKey = (): string =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/**
 * Whether an event carries the platform's chord modifier.
 *
 * `metaKey` on Apple hardware, `ctrlKey` elsewhere — but both are accepted
 * rather than branched on, because a Mac user on an external PC keyboard, and a
 * remote desktop that maps the keys the other way round, both otherwise end up
 * with shortcuts that quietly do nothing.
 */
export const hasModifier = (event: { metaKey: boolean; ctrlKey: boolean }): boolean => event.metaKey || event.ctrlKey;

/**
 * Whether an Enter keypress in the composer should send, given the user's
 * "Enter to send" setting.
 *
 * With the setting on, Enter sends and Shift holds it back for a new line —
 * what every chat client does. With it off the two swap round. `⌘ + Enter`
 * sends under both, so the chord a user has already learned survives them
 * flipping the switch.
 */
export const sendsOnEnter = (
  event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
  enterToSend: boolean,
): boolean => (enterToSend ? !event.shiftKey : hasModifier(event));
