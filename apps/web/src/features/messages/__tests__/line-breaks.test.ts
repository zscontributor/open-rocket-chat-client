import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import { remarkLineBreaks } from '../line-breaks';

/** Renders through the same pipeline `MessageBody` uses. */
const render = (text: string): string =>
  renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm, remarkLineBreaks], children: text }));

/**
 * The same markup with the newlines the serialiser pretty-prints with taken
 * out. They are whitespace between tags, which no browser draws — what the
 * assertions are about is the `<br>`s, which it does.
 */
const markup = (text: string): string => render(text).replace(/\n/g, '');

describe('remarkLineBreaks', () => {
  it('keeps a newline the author typed inside a paragraph', () => {
    // Markdown would reflow these onto one line; a chat message may not.
    expect(markup('line one\nline two')).toBe('<p>line one<br/>line two</p>');
  });

  it('keeps every line of a block someone typed out', () => {
    expect(markup('one\ntwo\nthree')).toBe('<p>one<br/>two<br/>three</p>');
  });

  it('keeps a blank line between two paragraphs', () => {
    expect(markup('a\n\nb')).toBe('<p>a</p><br/><p>b</p>');
  });

  it('keeps every blank line, not just the first', () => {
    // Three empty lines in, three breaks out — plus the one the block boundary
    // already draws.
    const html = markup('a\n\n\n\nb');

    expect(html.match(/<br\/>/g)).toHaveLength(3);
    expect(html).toBe('<p>a</p><br/><br/><br/><p>b</p>');
  });

  it('keeps blank lines around blocks of other kinds', () => {
    expect(markup('para\n\n\n> quote')).toContain('<br/><br/><blockquote>');
  });

  it('adds nothing where the author left no blank line', () => {
    expect(markup('para\n```\ncode\n```')).not.toContain('<br');
  });

  it('leaves the inside of a fenced block alone', () => {
    // Its whitespace is already the renderer's to keep, and a `<br>` in a `<pre>`
    // would double every line ending.
    const html = render('```\nfirst\n\nsecond\n```');

    expect(html).not.toContain('<br');
    expect(html).toContain('first\n\nsecond');
  });

  it('keeps the lines of a quote inside the quote', () => {
    expect(markup('> q1\n> q2')).toBe('<blockquote><p>q1<br/>q2</p></blockquote>');
  });

  it('leaves list markup intact', () => {
    // A `<br>` between two `<li>`s is not markup a browser keeps where it is put.
    const html = markup('- x\n\n- y');

    expect(html).toContain('<ul>');
    expect(html).not.toMatch(/<br\/><li>/);
  });

  it('leaves a hard break the author wrote as one break, not two', () => {
    expect(markup('a  \nb')).toBe('<p>a<br/>b</p>');
  });
});
