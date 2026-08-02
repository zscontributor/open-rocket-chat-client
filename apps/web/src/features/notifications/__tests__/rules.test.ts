import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DURATION_SECONDS,
  dismissAfterMs,
  shouldAnnounce,
  shouldNotify,
  shouldShowOnScreen,
  stripTags,
  type AnnounceState,
  type ScreenState,
} from '../rules';

type State = AnnounceState & ScreenState;

const state = (overrides: Partial<State> = {}): State => ({
  hasFocus: true,
  isOpenRoom: false,
  muteFocusedConversations: true,
  ...overrides,
});

describe('shouldAnnounce', () => {
  it('stays quiet about the room being read in the focused window', () => {
    expect(shouldAnnounce(state({ hasFocus: true, isOpenRoom: true }))).toBe(false);
  });

  it('announces the room on screen once the window loses focus', () => {
    expect(shouldAnnounce(state({ hasFocus: false, isOpenRoom: true }))).toBe(true);
  });

  it('announces another room even while the window has focus', () => {
    expect(shouldAnnounce(state({ hasFocus: true, isOpenRoom: false }))).toBe(true);
  });

  it('announces the room on screen when the mute preference is off', () => {
    expect(shouldAnnounce(state({ hasFocus: true, isOpenRoom: true, muteFocusedConversations: false }))).toBe(true);
  });
});

describe('shouldShowOnScreen', () => {
  it('never interrupts the conversation being read, whatever the preference says', () => {
    // The second gate is what makes turning the mute preference off mean "tell
    // me about background rooms" rather than "tell me about this one twice".
    const reading = state({ hasFocus: true, isOpenRoom: true, muteFocusedConversations: false });

    expect(shouldAnnounce(reading)).toBe(true);
    expect(shouldShowOnScreen(reading)).toBe(false);
    expect(shouldNotify(reading)).toBe(false);
  });

  it('says nothing while the account is set to busy', () => {
    expect(shouldShowOnScreen(state({ hasFocus: false, status: 'busy' }))).toBe(false);
  });

  it('notifies for every other presence', () => {
    for (const status of ['online', 'away', 'offline', null, undefined] as const) {
      expect(shouldShowOnScreen(state({ hasFocus: false, status })), String(status)).toBe(true);
    }
  });
});

describe('dismissAfterMs', () => {
  it('honours the duration the server asked for', () => {
    expect(dismissAfterMs(3, false)).toBe(3000);
  });

  it('falls back to the default when the server has no opinion', () => {
    expect(dismissAfterMs(null, false)).toBe(DEFAULT_DURATION_SECONDS * 1000);
  });

  it('never closes on a timer when notifications are meant to be dismissed by hand', () => {
    expect(dismissAfterMs(3, true)).toBeNull();
    expect(dismissAfterMs(null, true)).toBeNull();
  });
});

describe('stripTags', () => {
  it('leaves plain text alone', () => {
    expect(stripTags('deploy is green')).toBe('deploy is green');
  });

  it('removes markup the OS would otherwise print verbatim', () => {
    expect(stripTags('<b>ping</b> me')).toBe('ping me');
  });
});
