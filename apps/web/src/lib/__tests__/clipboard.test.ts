import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyText } from '../clipboard';

/**
 * `vi.stubGlobal` rather than assignment: Node defines `navigator` as a
 * getter-only accessor, so `globalThis.navigator = …` throws.
 */
const stubNavigator = (navigator: unknown) => vi.stubGlobal('navigator', navigator);

/** Only the members `copyText` touches; the tests run without a DOM. */
const stubDocument = (execCommand: () => boolean) => {
  const area = { value: '', style: {}, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn() };
  vi.stubGlobal('document', {
    createElement: vi.fn(() => area),
    body: { append: vi.fn() },
    execCommand: vi.fn(execCommand),
  });
  return area;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyText', () => {
  it('prefers the desktop bridge a Tauri shell registers', async () => {
    const copy = vi.fn(async () => {});
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('__ORC_DESKTOP__', { copyText: copy });
    stubNavigator({ clipboard: { writeText } });

    await expect(copyText('hello')).resolves.toBe(true);
    expect(copy).toHaveBeenCalledWith('hello');
    // The native path owns the clipboard when it is there; asking the webview
    // as well would race two writes for the same slot.
    expect(writeText).not.toHaveBeenCalled();
  });

  it('uses the clipboard API in a plain browser tab', async () => {
    const writeText = vi.fn(async () => {});
    stubNavigator({ clipboard: { writeText } });

    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand where the clipboard API is missing', async () => {
    // An http:// origin or Tauri's WebKitGTK webview: no `clipboard` at all.
    stubNavigator({});
    const area = stubDocument(() => true);

    await expect(copyText('hello')).resolves.toBe(true);
    expect(area.value).toBe('hello');
    expect(area.remove).toHaveBeenCalled();
  });

  it('falls back when a bridge or the clipboard API rejects', async () => {
    vi.stubGlobal('__ORC_DESKTOP__', {
      copyText: vi.fn(async () => {
        throw new Error('no permission');
      }),
    });
    stubNavigator({
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error('document is not focused');
        }),
      },
    });
    stubDocument(() => true);

    await expect(copyText('hello')).resolves.toBe(true);
  });

  it('reports a failure rather than throwing when every path is exhausted', async () => {
    stubNavigator({});
    stubDocument(() => false);

    await expect(copyText('hello')).resolves.toBe(false);
  });
});
