import { describe, expect, it } from 'vitest';

import { quotedText } from '../quote';

const ATTRIBUTION = { author: 'Ada', postedAt: '3 Aug 2026, 14:22' };

describe('quotedText', () => {
  it('heads the quote with who wrote it and when', () => {
    expect(quotedText(ATTRIBUTION, 'hello')).toBe('> **Ada** · 3 Aug 2026, 14:22\n> hello');
  });

  it('quotes every line of a multi-line message', () => {
    expect(quotedText(ATTRIBUTION, 'one\ntwo')).toBe('> **Ada** · 3 Aug 2026, 14:22\n> one\n> two');
  });

  it('keeps a blank line inside the quote, so the blockquote does not end there', () => {
    const text = quotedText(ATTRIBUTION, 'first\n\nsecond');

    expect(text.split('\n').every((line) => line.startsWith('>'))).toBe(true);
    expect(text).toContain('\n>\n');
  });

  it('quotes an already-quoted message one level deeper', () => {
    expect(quotedText(ATTRIBUTION, '> quoted')).toContain('> > quoted');
  });

  it('drops the trailing blank lines a draft leaves behind', () => {
    expect(quotedText(ATTRIBUTION, 'hello\n\n\n')).toBe('> **Ada** · 3 Aug 2026, 14:22\n> hello');
  });

  it('quotes nothing but the attribution when the message is an upload with no caption', () => {
    expect(quotedText(ATTRIBUTION, '')).toBe('> **Ada** · 3 Aug 2026, 14:22');
    expect(quotedText(ATTRIBUTION, '   ')).toBe('> **Ada** · 3 Aug 2026, 14:22');
  });

  it('puts the comment below the quote, separated so it is not swallowed by it', () => {
    expect(quotedText(ATTRIBUTION, 'hello', 'worth a look')).toBe(
      '> **Ada** · 3 Aug 2026, 14:22\n> hello\n\nworth a look',
    );
  });

  it('keeps every line of a multi-line comment out of the quote', () => {
    const text = quotedText(ATTRIBUTION, 'hello', 'first\n\nsecond');

    expect(text).toBe('> **Ada** · 3 Aug 2026, 14:22\n> hello\n\nfirst\n\nsecond');
  });

  it('ignores a comment that is only whitespace', () => {
    expect(quotedText(ATTRIBUTION, 'hello', '  \n ')).toBe('> **Ada** · 3 Aug 2026, 14:22\n> hello');
  });
});
