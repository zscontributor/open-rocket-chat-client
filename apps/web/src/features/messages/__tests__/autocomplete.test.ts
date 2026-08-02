import { describe, expect, it } from 'vitest';

import { findAutocompleteToken, parseSlashCommand, replaceAutocompleteToken } from '../autocomplete';

/** `|` stands in for the caret, so the cases read as what a user had typed. */
const at = (marked: string) => {
  const caret = marked.indexOf('|');
  return findAutocompleteToken(marked.replace('|', ''), caret);
};

describe('findAutocompleteToken', () => {
  it('finds a mention the caret is in', () => {
    expect(at('@jo|')).toEqual({ kind: 'user', start: 0, end: 3, term: 'jo' });
    expect(at('hi @jo|')).toEqual({ kind: 'user', start: 3, end: 6, term: 'jo' });
  });

  it('offers everything the moment the trigger is typed', () => {
    expect(at('@|')?.term).toBe('');
    expect(at('#|')?.term).toBe('');
  });

  it('completes a token the caret was moved back into', () => {
    expect(at('@bob|by')).toEqual({ kind: 'user', start: 0, end: 4, term: 'bob' });
  });

  it('finds channels and commands by their own triggers', () => {
    expect(at('#gen|')?.kind).toBe('channel');
    expect(at('/arc|')?.kind).toBe('command');
  });

  it('leaves an email address alone', () => {
    // The `@` follows a letter, so it opens nothing — which is the whole point.
    expect(at('write to bob@exa|')).toBeNull();
  });

  it('only reads a slash as a command at the start of the message', () => {
    expect(at('see /usr|')).toBeNull();
    expect(at('cd|')).toBeNull();
  });

  it('closes once the token is finished', () => {
    expect(at('@john here|')).toBeNull();
    // The caret is before the trigger, so the mention behind it is not being
    // typed — it is being read past.
    expect(at('hi| @john')).toBeNull();
  });

  it('starts a new token on each line', () => {
    expect(at('first line\n@jo|')).toEqual({ kind: 'user', start: 11, end: 14, term: 'jo' });
  });

  it('gives up on a term nobody is picking from a list', () => {
    expect(at(`@${'x'.repeat(41)}|`)).toBeNull();
  });
});

describe('replaceAutocompleteToken', () => {
  it('replaces the token and leaves the caret past the trailing space', () => {
    const token = findAutocompleteToken('hi @jo', 6);
    const result = replaceAutocompleteToken('hi @jo', token!, '@john');

    expect(result.text).toBe('hi @john ');
    expect(result.caret).toBe(9);
  });

  it('does not add a second space when the text already has one', () => {
    const token = findAutocompleteToken('hi @jo there', 6);
    const result = replaceAutocompleteToken('hi @jo there', token!, '@john');

    expect(result.text).toBe('hi @john there');
    expect(result.caret).toBe(8);
  });

  it('keeps what follows the token when it is completed mid-word', () => {
    const token = findAutocompleteToken('@bobby', 4);
    expect(replaceAutocompleteToken('@bobby', token!, '@bob').text).toBe('@bob by');
  });
});

describe('parseSlashCommand', () => {
  it('reads the command and hands the rest over untouched', () => {
    expect(parseSlashCommand('/archive')).toEqual({ command: 'archive', params: '' });
    expect(parseSlashCommand('/msg @bob hello there')).toEqual({ command: 'msg', params: '@bob hello there' });
  });

  it('ignores the whitespace around it', () => {
    expect(parseSlashCommand('  /archive   #general  ')).toEqual({ command: 'archive', params: '#general' });
  });

  it('is null for anything that is not a command', () => {
    expect(parseSlashCommand('hello')).toBeNull();
    expect(parseSlashCommand('/')).toBeNull();
    expect(parseSlashCommand('/ archive')).toBeNull();
    // A path is not a command, and posting it as a message is what was meant.
    expect(parseSlashCommand('/etc/hosts is where it lives')).toBeNull();
  });
});
