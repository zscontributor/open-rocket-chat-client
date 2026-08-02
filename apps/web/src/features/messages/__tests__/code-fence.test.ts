import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import { isBareBlock } from '../body-shape';
import { remarkCodeFence } from '../code-fence';

/** Renders through the same pipeline `MessageBody` uses. */
const render = (text: string): string =>
  renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm, remarkCodeFence], children: text }));

describe('remarkCodeFence', () => {
  it('keeps the text of a fence with nothing under it', () => {
    // Typed into the composer and sent as it stands. CommonMark reads `ABC` as
    // the language of a block with nothing in it, so the message renders as an
    // empty box and the only thing it said is gone.
    expect(render('```ABC')).toBe('<pre><code>ABC\n</code></pre>');
    // The same line closed off by hand, which is how most people write it.
    expect(render('```ABC\n```')).toBe('<pre><code>ABC\n</code></pre>');
  });

  it('promotes a message that is one single-line fence', () => {
    // Three backticks on one line is a code *span* to CommonMark, because an
    // info string may not contain backticks. In a chat box it is a block.
    expect(render('```ABC```')).toBe('<pre><code>ABC\n</code></pre>');
  });

  it('leaves a single-line fence inside a sentence inline', () => {
    expect(render('run ```npm i``` first')).toBe('<p>run <code>npm i</code> first</p>');
  });

  it('still reads an info string as a language when there is code under it', () => {
    expect(render('```js\nconst a = 1;\n```')).toContain('class="language-js"');
    // Unclosed, but with a body: the language was still meant as one.
    expect(render('```js\nconst a = 1;')).toContain('class="language-js"');
  });

  it('never renders an empty box', () => {
    // Whatever was on the fence line is shown as code rather than swallowed as
    // the language of a block that turned out to hold nothing.
    expect(render('```js\n```')).toBe('<pre><code>js\n</code></pre>');

    // With nothing on it either, the fence is shown as the text it is — an
    // empty panel would say nothing about why the block came out empty.
    expect(render('```')).toBe('<p>```</p>');
    expect(render('```\n```')).toBe('<p>```\n```</p>');
    // What the composer leaves behind when a fence is opened and sent unused.
    expect(render('```\n\n```')).toBe('<p>```\n\n```</p>');
  });

  it('leaves ordinary code spans and blocks alone', () => {
    expect(render('`x`')).toBe('<p><code>x</code></p>');
    expect(render('```\nABC\n```')).toBe('<pre><code>ABC\n</code></pre>');
  });
});

describe('isBareBlock', () => {
  it('is true for a message that is only a code block, however the fence was typed', () => {
    expect(isBareBlock('```ABC')).toBe(true);
    expect(isBareBlock('```ABC```')).toBe(true);
    expect(isBareBlock('```js\nconst a = 1;\n```')).toBe(true);
    expect(isBareBlock('```\nconst a = 1;')).toBe(true);
  });

  it('is true for a message that is only a quote', () => {
    expect(isBareBlock('> hello')).toBe(true);
    expect(isBareBlock('> hello\n> there')).toBe(true);
  });

  it('is false for a fence with nothing in it, which renders as text', () => {
    expect(isBareBlock('```')).toBe(false);
    expect(isBareBlock('```\n```')).toBe(false);
    expect(isBareBlock('```\n\n```')).toBe(false);
  });

  it('is false once anything else shares the message', () => {
    expect(isBareBlock('look:\n```\ncode\n```')).toBe(false);
    expect(isBareBlock('```\ncode\n```\nany questions?')).toBe(false);
    expect(isBareBlock('> hello\n\nand hi')).toBe(false);
    expect(isBareBlock('> hello\nand hi')).toBe(false);
    expect(isBareBlock('just words')).toBe(false);
    expect(isBareBlock('   ')).toBe(false);
  });
});
