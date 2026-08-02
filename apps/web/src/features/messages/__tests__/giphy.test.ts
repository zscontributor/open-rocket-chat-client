import { describe, expect, it } from 'vitest';

import { normaliseGif } from '../giphy';

const rendition = (url: string, extra: Record<string, string> = {}) => ({
  url,
  width: '200',
  height: '150',
  ...extra,
});

describe('normaliseGif', () => {
  it('prefers a downsized rendition over the original', () => {
    const gif = normaliseGif({
      id: 'abc',
      title: 'Party Parrot',
      url: 'https://giphy.com/gifs/abc',
      images: {
        fixed_width: rendition('https://media.giphy.com/abc/200w.gif'),
        downsized: rendition('https://media.giphy.com/abc/downsized.gif', { size: '1048576' }),
        original: rendition('https://media.giphy.com/abc/giphy.gif', { size: '52428800' }),
      },
    });

    expect(gif?.url).toBe('https://media.giphy.com/abc/downsized.gif');
    expect(gif?.sizeBytes).toBe(1048576);
    expect(gif?.previewUrl).toBe('https://media.giphy.com/abc/200w.gif');
  });

  it('falls back through the rendition list when GIPHY omits one', () => {
    const gif = normaliseGif({
      id: 'abc',
      images: { original: rendition('https://media.giphy.com/abc/giphy.gif') },
    });

    expect(gif?.url).toBe('https://media.giphy.com/abc/giphy.gif');
    expect(gif?.previewUrl).toBe('https://media.giphy.com/abc/giphy.gif');
    // Untitled results still need an accessible name and a file name.
    expect(gif?.title).toBe('GIF');
  });

  it('drops a result with no usable image', () => {
    expect(normaliseGif({ id: 'abc', images: {} })).toBeNull();
    expect(normaliseGif({ images: { original: rendition('https://media.giphy.com/abc/giphy.gif') } })).toBeNull();
  });

  it('keeps the preview dimensions, so the grid does not reflow as GIFs load', () => {
    const gif = normaliseGif({
      id: 'abc',
      images: { fixed_width: { url: 'https://media.giphy.com/abc/200w.gif', width: '200', height: '356' } },
    });

    expect(gif?.previewWidth).toBe(200);
    expect(gif?.previewHeight).toBe(356);
  });
});
