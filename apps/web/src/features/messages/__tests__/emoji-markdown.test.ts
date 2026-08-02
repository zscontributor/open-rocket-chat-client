import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import { makeRemarkEmoji } from '../emoji';
import type { ResolveEmoji } from '../use-emoji';

const resolve: ResolveEmoji = (name) => {
  if (name === 'tada') return { kind: 'unicode', character: '🎉' };
  if (name === 'shipit') return { kind: 'custom', name, url: '/files/shipit.png' };
  return null;
};

/** Renders through the same pipeline `MessageBody` uses. */
const render = (text: string): string =>
  renderToStaticMarkup(
    createElement(Markdown, { remarkPlugins: [remarkGfm, makeRemarkEmoji(resolve)], children: text }),
  );

describe('makeRemarkEmoji', () => {
  it('renders custom emoji as a tagged image', () => {
    const html = render('ship it :shipit:');
    expect(html).toContain('<img');
    expect(html).toContain('src="/files/shipit.png"');
    expect(html).toContain('orc-custom-emoji');
    expect(html).toContain('alt=":shipit:"');
  });

  it('renders standard shortcodes as their character', () => {
    expect(render('done :tada:')).toContain('done 🎉');
  });

  it('leaves shortcodes inside code untouched', () => {
    // Someone documenting the syntax must be able to write it down.
    expect(render('`:tada:`')).toContain('<code>:tada:</code>');
    expect(render('    :shipit:')).not.toContain('<img');
  });

  it('still applies markdown around the emoji', () => {
    const html = render('**bold :tada:** and [a link](https://example.com)');
    expect(html).toContain('<strong>bold 🎉</strong>');
    expect(html).toContain('href="https://example.com"');
  });

  it('parses emoji inside lists and links', () => {
    expect(render('- item :tada:')).toContain('<li>item 🎉</li>');
    expect(render('[go :tada:](https://example.com)')).toContain('go 🎉');
  });
});
