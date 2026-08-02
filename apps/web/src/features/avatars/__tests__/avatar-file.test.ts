import type { ServerCapabilities } from '@open-rocket-chat/client-sdk';
import { describe, expect, it } from 'vitest';

import { avatarFileProblem } from '../avatar-file';

/** Only the parts `avatarFileProblem` reads; the rest of the shape is irrelevant. */
const capabilities = (fileUpload: Partial<ServerCapabilities['settings']['fileUpload']>): ServerCapabilities =>
  ({
    settings: {
      fileUpload: {
        enabled: true,
        maxFileSizeBytes: 1024,
        acceptedMediaTypes: [],
        blockedMediaTypes: [],
        ...fileUpload,
      },
    },
  }) as ServerCapabilities;

describe('avatarFileProblem', () => {
  it('accepts an image within the server-s limit', () => {
    expect(avatarFileProblem(capabilities({}), { type: 'image/png', size: 512 })).toBeNull();
  });

  it('rejects anything that is not an image', () => {
    expect(avatarFileProblem(capabilities({}), { type: 'application/pdf', size: 10 })).toBe('type');
  });

  it('rejects an image Rocket.Chat could not render back', () => {
    expect(avatarFileProblem(capabilities({}), { type: 'image/tiff', size: 10 })).toBe('type');
  });

  it('rejects a file past the server-s upload ceiling', () => {
    expect(avatarFileProblem(capabilities({}), { type: 'image/png', size: 1025 })).toBe('size');
  });

  it('treats a ceiling of zero as no ceiling, the way Rocket.Chat does', () => {
    expect(
      avatarFileProblem(capabilities({ maxFileSizeBytes: 0 }), { type: 'image/png', size: 10_000_000 }),
    ).toBeNull();
  });

  it('ignores the upload allow and block lists', () => {
    // Those govern attachments. An avatar only has to be an image the server
    // can render, so a deployment that blocks GIF attachments still takes a
    // GIF avatar — as Rocket.Chat's own account screen does.
    const strict = capabilities({ acceptedMediaTypes: ['application/pdf'], blockedMediaTypes: ['image/gif'] });
    expect(avatarFileProblem(strict, { type: 'image/gif', size: 10 })).toBeNull();
  });

  it('lets an image through before the capabilities have loaded', () => {
    // The gateway checks the same things; blocking here would make the field
    // useless for the first seconds after a cold start.
    expect(avatarFileProblem(undefined, { type: 'image/png', size: 10_000_000 })).toBeNull();
  });
});
