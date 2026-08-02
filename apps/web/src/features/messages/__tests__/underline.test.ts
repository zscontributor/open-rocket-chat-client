import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import { makeRemarkEmoji } from '../emoji';
import { makeRemarkUnderline } from '../underline';
import type { ResolveEmoji } from '../use-emoji';

const resolve: ResolveEmoji = (name) => (name === 'tada' ? { kind: 'unicode', character: '🎉' } : null);

/** Renders through the same pipeline, in the same order, that `MessageBody` uses. */
const render = (text: string): string =>
  renderToStaticMarkup(
    createElement(Markdown, {
      remarkPlugins: [remarkGfm, makeRemarkUnderline, makeRemarkEmoji(resolve)],
      children: text,
    }),
  );

describe('makeRemarkUnderline', () => {
  it('renders ++text++ as an underline', () => {
    expect(render('say ++hello++ there')).toContain('say <u>hello</u> there');
  });

  it('renders more than one on a line', () => {
    const html = render('++one++ and ++two++');

    expect(html).toContain('<u>one</u>');
    expect(html).toContain('<u>two</u>');
  });

  it('leaves lone and unbalanced pluses alone', () => {
    expect(render('a ++ b')).not.toContain('<u>');
    expect(render('1 ++ 2 = 3')).not.toContain('<u>');
    expect(render('C++ is a language')).not.toContain('<u>');
  });

  it('does not underline across whitespace at the delimiters', () => {
    // Matching `++ text ++` would turn arithmetic and stray punctuation into
    // formatting nobody typed.
    expect(render('a ++ spaced ++ b')).not.toContain('<u>');
  });

  it('leaves the delimiters untouched inside code', () => {
    // Someone documenting the syntax has to be able to write it down.
    expect(render('`++hello++`')).toContain('<code>++hello++</code>');
    expect(render('    ++hello++')).not.toContain('<u>');
  });

  it('still resolves emoji inside an underline', () => {
    expect(render('++done :tada:++')).toContain('<u>done 🎉</u>');
  });

  it('underlines inside other block content', () => {
    expect(render('- ++item++')).toContain('<u>item</u>');
    expect(render('> ++quoted++')).toContain('<u>quoted</u>');
  });

  it('leaves surrounding GFM marks working', () => {
    const html = render('**bold** and ++under++ and ~~gone~~');

    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<u>under</u>');
    expect(html).toContain('<del>gone</del>');
  });
});
