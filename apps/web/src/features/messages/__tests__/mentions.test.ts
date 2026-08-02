import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import { makeRemarkMentions, messageMentionResolver, splitMentions, type ResolveMention } from '../mentions';

const MENTIONS = [
  { id: 'u1', username: 'quy', kind: 'user' },
  { id: 'u2', username: 'Bob', kind: 'user' },
  { id: 'all', username: 'all', kind: 'all' },
];
const CHANNELS = [{ id: 'r1', name: 'general' }];

const resolver = messageMentionResolver(MENTIONS, CHANNELS);

/** The names and kinds a body would be marked up with, in order. */
const marked = (text: string, resolve: ResolveMention = resolver) =>
  splitMentions(text, resolve).flatMap((segment) =>
    segment.kind === 'mention' ? [`${segment.trigger}${segment.name}:${segment.mention.kind}`] : [],
  );

/** Renders through the same pipeline `MessageBody` uses. */
const render = (text: string, resolve: ResolveMention = resolver): string =>
  renderToStaticMarkup(
    createElement(Markdown, { remarkPlugins: [remarkGfm, makeRemarkMentions(resolve)], children: text }),
  );

describe('splitMentions', () => {
  it('marks the names the server resolved', () => {
    expect(marked('hi @quy and @Bob, see #general')).toEqual(['@quy:user', '@Bob:user', '#general:channel']);
  });

  it('leaves names the server did not resolve as text', () => {
    // Rocket.Chat resolves mentions when the message is posted, so a name
    // missing from that list names nobody.
    expect(marked('@nobody was here about #nowhere')).toEqual([]);
  });

  it('matches without regard to case, as Rocket.Chat does', () => {
    expect(marked('@QUY')).toEqual(['@QUY:user']);
  });

  it('reports @all as the broadcast it is', () => {
    expect(marked('@all standup in 5')).toEqual(['@all:all']);
  });

  it('keeps the punctuation around a mention', () => {
    const segments = splitMentions('(cc @quy) done', resolver);
    expect(segments.map((segment) => (segment.kind === 'text' ? segment.value : 'MENTION'))).toEqual([
      '(cc ',
      'MENTION',
      ') done',
    ]);
  });

  it('is not fooled by an email address', () => {
    expect(marked('write to bob@quy for details')).toEqual([]);
  });

  it('assumes every well-formed name when there is nothing to check against', () => {
    // What the composer's preview does: the message has not been posted, so no
    // list of resolved mentions exists yet.
    const assume = messageMentionResolver(undefined, undefined, true);
    expect(marked('@anyone in #anywhere', assume)).toEqual(['@anyone:user', '#anywhere:channel']);
    expect(marked('@here now', assume)).toEqual(['@here:here']);
  });

  it('resolves nothing at all without a list and without assuming', () => {
    expect(marked('@quy #general', messageMentionResolver(undefined, undefined))).toEqual([]);
  });
});

describe('makeRemarkMentions', () => {
  it('renders a mention as a tagged span carrying what it resolved to', () => {
    const html = render('hi @quy');
    expect(html).toContain('orc-mention');
    expect(html).toContain('data-mention-kind="user"');
    expect(html).toContain('data-mention-name="quy"');
    expect(html).toContain('data-mention-id="u1"');
    expect(html).toContain('@quy');
  });

  it('carries the room id so the card need not search by name', () => {
    expect(render('see #general')).toContain('data-mention-id="r1"');
  });

  it('leaves mentions inside code untouched', () => {
    // Someone explaining the syntax has to be able to write it down.
    expect(render('`@quy`')).toContain('<code>@quy</code>');
    expect(render('    @quy')).not.toContain('orc-mention');
  });

  it('still applies markdown around the mention', () => {
    const html = render('**ping @quy** in [docs](https://example.com)');
    expect(html).toContain('<strong>');
    expect(html).toContain('orc-mention');
    expect(html).toContain('href="https://example.com"');
  });

  it('does not rewrite a link that happens to contain a hash', () => {
    expect(render('[docs](https://example.com/#general)')).toContain('href="https://example.com/#general"');
  });
});
