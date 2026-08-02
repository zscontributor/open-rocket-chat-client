import { describe, expect, it } from 'vitest';

import { longMessageFile, longMessageFileName } from '../long-message';

const AT = new Date('2026-08-02T09:05:07');

describe('longMessageFileName', () => {
  it('names the file after its author and the moment it was written', () => {
    expect(longMessageFileName('quy', AT)).toBe('quy - 2026-08-02 09-05-07.txt');
  });

  it('falls back to a placeholder when the username is missing', () => {
    expect(longMessageFileName('', AT)).toBe('anonymous - 2026-08-02 09-05-07.txt');
  });

  it('keeps the name free of characters a download would choke on', () => {
    expect(longMessageFileName('quy', AT)).not.toMatch(/[:/\\]/);
  });
});

describe('longMessageFile', () => {
  it('carries the whole message as plain text', async () => {
    const text = 'a'.repeat(6000);
    const file = longMessageFile(text, 'quy', AT);

    expect(file.type).toBe('text/plain');
    expect(file.lastModified).toBe(AT.getTime());
    await expect(file.text()).resolves.toBe(text);
  });
});
