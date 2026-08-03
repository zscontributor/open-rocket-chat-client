import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import { makeRemarkEmoji } from '../emoji';
import { makeRemarkHighlight, searchTerms, splitHighlights } from '../highlight';
import { remarkLineBreaks } from '../line-breaks';
import { makeRemarkUnderline } from '../underline';
import type { ResolveEmoji } from '../use-emoji';

const resolve: ResolveEmoji = (name) => (name === 'tada' ? { kind: 'unicode', character: '🎉' } : null);

/** Renders through the same pipeline, in the same order, that `MessageBody` uses. */
const render = (text: string, terms: string[]): string =>
  renderToStaticMarkup(
    createElement(Markdown, {
      remarkPlugins: [
        remarkGfm,
        makeRemarkUnderline,
        makeRemarkEmoji(resolve),
        makeRemarkHighlight(terms),
        remarkLineBreaks,
      ],
      children: text,
    }),
  );

describe('searchTerms', () => {
  it('takes the words of a query', () => {
    expect(searchTerms('deploy failed')).toEqual(['deploy', 'failed']);
  });

  it('drops the operators, which never appear in a body', () => {
    expect(searchTerms('from:alice deploy')).toEqual(['deploy']);
    expect(searchTerms('has:star is:pinned before:2024-01-01 rollback')).toEqual(['rollback']);
    expect(searchTerms('-from:bob outage')).toEqual(['outage']);
  });

  it('keeps a quoted run as one phrase, spaces and all', () => {
    expect(searchTerms('"build failed" again')).toEqual(['build failed', 'again']);
  });

  it('keeps a quoted operator, which is somebody looking for that text', () => {
    expect(searchTerms('"from:alice"')).toEqual(['from:alice']);
  });

  it('puts the longest first, so the fuller match wins where two overlap', () => {
    expect(searchTerms('read unread')).toEqual(['unread', 'read']);
  });

  it('has nothing to mark for a query that is only operators', () => {
    expect(searchTerms('is:pinned has:star')).toEqual([]);
    expect(searchTerms('   ')).toEqual([]);
  });

  it('says each term once', () => {
    expect(searchTerms('deploy deploy')).toEqual(['deploy']);
  });
});

describe('splitHighlights', () => {
  it('splits a run into what matched and what lies between', () => {
    expect(splitHighlights('a deploy b', ['deploy'])).toEqual([
      { kind: 'text', value: 'a ' },
      { kind: 'match', value: 'deploy' },
      { kind: 'text', value: ' b' },
    ]);
  });

  it("matches whatever the case, and gives back the message's own", () => {
    expect(splitHighlights('Deploy', ['deploy'])).toEqual([{ kind: 'match', value: 'Deploy' }]);
  });

  it('returns nothing when nothing matched, so the text can be left alone', () => {
    expect(splitHighlights('nothing here', ['deploy'])).toEqual([]);
    expect(splitHighlights('nothing here', [])).toEqual([]);
  });

  it('reads a term with regex punctuation as the text it is', () => {
    expect(splitHighlights('cost is 1+1', ['1+1'])).toEqual([
      { kind: 'text', value: 'cost is ' },
      { kind: 'match', value: '1+1' },
    ]);
    expect(splitHighlights('a.b', ['a.b'])).toHaveLength(1);
    expect(splitHighlights('axb', ['a.b'])).toEqual([]);
  });

  it('takes the longer of two terms that start in the same place', () => {
    expect(splitHighlights('unread', searchTerms('read unread'))).toEqual([{ kind: 'match', value: 'unread' }]);
  });
});

describe('makeRemarkHighlight', () => {
  it('wraps the term in a mark', () => {
    expect(render('the deploy failed', ['deploy'])).toContain('the <mark>deploy</mark> failed');
  });

  it('marks every occurrence', () => {
    expect(render('deploy, then deploy again', ['deploy']).match(/<mark>/g)).toHaveLength(2);
  });

  it('leaves the body alone when no term was given', () => {
    expect(render('the deploy failed', [])).not.toContain('<mark>');
  });

  it('leaves code untouched, where the text is the subject rather than prose', () => {
    expect(render('`deploy`', ['deploy'])).toContain('<code>deploy</code>');
    expect(render('```\ndeploy\n```', ['deploy'])).not.toContain('<mark>');
  });

  it('marks inside the formatting rather than breaking it', () => {
    expect(render('**deploy** failed', ['deploy'])).toContain('<strong><mark>deploy</mark></strong>');
    expect(render('++deploy++ failed', ['deploy'])).toContain('<u><mark>deploy</mark></u>');
    expect(render('- deploy', ['deploy'])).toContain('<mark>deploy</mark>');
  });

  it('runs late enough to leave the marks that came before it working', () => {
    // The emoji is resolved first, so searching for the shortcode finds nothing
    // to mark — which is right: the message says 🎉, and that is what is read.
    expect(render('done :tada:', ['tada'])).toContain('🎉');
    expect(render('done :tada:', ['tada'])).not.toContain('<mark>');
    expect(render('done :tada:', ['done'])).toContain('<mark>done</mark>');
  });

  it('runs early enough to leave the line breaks working', () => {
    const html = render('deploy\nfailed', ['deploy']);

    expect(html).toContain('<mark>deploy</mark>');
    expect(html).toContain('<br');
  });
});
