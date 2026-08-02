import { describe, expect, it } from 'vitest';

import { bareShortcode, splitEmoji } from '../emoji';
import type { ResolveEmoji } from '../use-emoji';

const resolve: ResolveEmoji = (name) => {
  if (name === 'tada') return { kind: 'unicode', character: '🎉' };
  if (name === 'shipit') return { kind: 'custom', name, url: '/api/v1/files/emoji-custom/shipit.png' };
  return null;
};

describe('bareShortcode', () => {
  it('strips the colons Rocket.Chat stores around reactions', () => {
    expect(bareShortcode(':+1:')).toBe('+1');
    expect(bareShortcode('tada')).toBe('tada');
  });
});

describe('splitEmoji', () => {
  it('replaces standard shortcodes with their character', () => {
    expect(splitEmoji('ship it :tada:', resolve)).toEqual([
      { kind: 'text', value: 'ship it ' },
      { kind: 'unicode', character: '🎉' },
    ]);
  });

  it('keeps custom emoji as an image reference', () => {
    expect(splitEmoji(':shipit: now', resolve)).toEqual([
      { kind: 'custom', name: 'shipit', url: '/api/v1/files/emoji-custom/shipit.png' },
      { kind: 'text', value: ' now' },
    ]);
  });

  it('leaves shortcodes nothing can resolve as text', () => {
    expect(splitEmoji('a :nope: b', resolve)).toEqual([{ kind: 'text', value: 'a :nope: b' }]);
  });

  it('does not mistake times or ratios for shortcodes', () => {
    // `10:30:00` would otherwise parse `30` as a shortcode name.
    expect(splitEmoji('standup at 10:30:00', resolve)).toEqual([{ kind: 'text', value: 'standup at 10:30:00' }]);
  });

  it('handles several emoji in one run of text', () => {
    expect(splitEmoji(':tada::tada:', resolve)).toEqual([
      { kind: 'unicode', character: '🎉' },
      { kind: 'unicode', character: '🎉' },
    ]);
  });

  it('returns nothing for empty text', () => {
    expect(splitEmoji('', resolve)).toEqual([]);
  });
});
