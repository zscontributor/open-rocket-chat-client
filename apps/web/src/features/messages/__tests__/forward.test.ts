import type { Message } from '@open-rocket-chat/client-sdk';
import { describe, expect, it } from 'vitest';

import { forwardedFiles } from '../forward';

const messageWith = (files: Message['files']): Message => ({ files }) as Message;

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
