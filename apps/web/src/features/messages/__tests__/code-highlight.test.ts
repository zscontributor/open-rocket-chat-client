import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import { remarkCodeFence } from '../code-fence';
import { rehypeCodeHighlight } from '../code-highlight';
import { hasCodeBlock } from '../use-code-highlight';

/** Renders through the same pipeline `MessageBody` uses. */
const render = (text: string): string =>
  renderToStaticMarkup(
    createElement(Markdown, {
      remarkPlugins: [remarkGfm, remarkCodeFence],
      rehypePlugins: [rehypeCodeHighlight],
      children: text,
    }),
  );

describe('rehypeCodeHighlight', () => {
  it('colours a block whose language was named', () => {
    const html = render('```js\nconst a = 1;\n```');

    expect(html).toContain('hljs-keyword');
    expect(html).toContain('class="hljs language-js"');
  });

  it('resolves the aliases each grammar brings with it', () => {
    // None of these are the name the grammar is registered under.
    expect(render('```ts\ntype A = string;\n```')).toContain('hljs-keyword');
    expect(render('```sh\necho "hi"\n```')).toContain('hljs-string');
    expect(render('```yml\nkey: value\n```')).toContain('hljs-attr');
    expect(render('```html\n<p>hi</p>\n```')).toContain('hljs-tag');
  });

  it('colours a block that named no language, which is how they are typed', () => {
    // Nobody reaches for the language when ``` is already three keystrokes.
    expect(render('```\ndef main():\n    print("hi")\n```')).toContain('language-python');
    expect(render('```\n{"a": 1}\n```')).toContain('language-json');
    expect(render('```\n<div class="x">hi</div>\n```')).toContain('language-xml');
  });

  it('does not guess with the grammars that match anything', () => {
    // Each of these was mis-guessed into the wrong colours before the guess was
    // narrowed: a shell command is a passable SQL comment and a passable CSS
    // rule, and unhighlighted beats wrongly highlighted.
    expect(render('```\nnpm install --save-dev vitest\n```')).not.toContain('hljs-comment');
    // Still available to anyone who says which language they mean.
    expect(render('```sql\nSELECT * FROM users;\n```')).toContain('hljs-keyword');
  });

  it('leaves prose alone', () => {
    // Inline code is a word in a sentence, not a program.
    expect(render('run `npm i` first')).toBe('<p>run <code>npm i</code> first</p>');
    expect(render('just words')).toBe('<p>just words</p>');
  });

  it('leaves a block of plain text as plain text', () => {
    // Detection is on, so this is the case that has to stay quiet: a block of
    // prose must not come out speckled with the colours of some grammar.
    expect(render('```\nhello there\n```')).toBe('<pre><code class="hljs">hello there\n</code></pre>');
  });

  it('does not lose the code of an unregistered language', () => {
    const html = render('```brainfuck\n++++.\n```');

    expect(html).toContain('++++.');
    expect(html).not.toContain('hljs-');
  });
});

describe('hasCodeBlock', () => {
  it('is what decides whether the grammars are worth fetching', () => {
    expect(hasCodeBlock('```\ncode\n```')).toBe(true);
    expect(hasCodeBlock('~~~\ncode\n~~~')).toBe(true);
    // Inline code is never highlighted, so it must not pull down 55 kB either.
    expect(hasCodeBlock('run `npm i`')).toBe(false);
    expect(hasCodeBlock('just words')).toBe(false);
  });
});
