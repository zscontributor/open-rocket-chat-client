import type { Message } from '@open-rocket-chat/client-sdk';
import { describe, expect, it } from 'vitest';

import { forwardedFiles, forwardedText } from '../forward';

const ATTRIBUTION = { author: 'Ada', postedAt: '3 Aug 2026, 14:22' };

const messageWith = (files: Message['files']): Message => ({ files }) as Message;

describe('forwardedText', () => {
  it('heads the quote with who wrote it and when', () => {
    expect(forwardedText(ATTRIBUTION, 'hello')).toBe('> **Ada** · 3 Aug 2026, 14:22\n> hello');
  });

  it('quotes every line of a multi-line message', () => {
    expect(forwardedText(ATTRIBUTION, 'one\ntwo')).toBe('> **Ada** · 3 Aug 2026, 14:22\n> one\n> two');
  });

  it('keeps a blank line inside the quote, so the blockquote does not end there', () => {
    const text = forwardedText(ATTRIBUTION, 'first\n\nsecond');

    expect(text.split('\n').every((line) => line.startsWith('>'))).toBe(true);
    expect(text).toContain('\n>\n');
  });

  it('quotes an already-quoted message one level deeper', () => {
    expect(forwardedText(ATTRIBUTION, '> quoted')).toContain('> > quoted');
  });

  it('drops the trailing blank lines a draft leaves behind', () => {
    expect(forwardedText(ATTRIBUTION, 'hello\n\n\n')).toBe('> **Ada** · 3 Aug 2026, 14:22\n> hello');
  });

  it('quotes nothing but the attribution when the message is an upload with no caption', () => {
    expect(forwardedText(ATTRIBUTION, '')).toBe('> **Ada** · 3 Aug 2026, 14:22');
    expect(forwardedText(ATTRIBUTION, '   ')).toBe('> **Ada** · 3 Aug 2026, 14:22');
  });

  it('puts the comment below the quote, separated so it is not swallowed by it', () => {
    expect(forwardedText(ATTRIBUTION, 'hello', 'worth a look')).toBe(
      '> **Ada** · 3 Aug 2026, 14:22\n> hello\n\nworth a look',
    );
  });

  it('ignores a comment that is only whitespace', () => {
    expect(forwardedText(ATTRIBUTION, 'hello', '  \n ')).toBe('> **Ada** · 3 Aug 2026, 14:22\n> hello');
  });
});

describe('forwardedFiles', () => {
  it('collects the uploads of every message on the row, so an album travels whole', () => {
    const files = forwardedFiles([
      messageWith([{ id: 'a' }, { id: 'b' }] as Message['files']),
      messageWith([{ id: 'c' }] as Message['files']),
    ]);

    expect(files.map((file) => file.id)).toEqual(['a', 'b', 'c']);
  });

  it('is empty for a row that carries none', () => {
    expect(forwardedFiles([messageWith([])])).toEqual([]);
  });
});
