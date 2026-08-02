import type { Attachment, Message } from '@open-rocket-chat/client-sdk';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import enMessages from '@/i18n/locales/en/messages.json';
import { isPinnedQuoteEncrypted, pinnedQuoteOf, SYSTEM_KEYS, systemMessageLabel } from '../system-message';

/** Resolves a dotted key against the English bundle, the way i18next would. */
const lookup = (key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], enMessages);

/** Renders like i18next: substitute `{{placeholder}}`, leave the rest alone. */
const t = ((key: string, options?: Record<string, string>) => {
  const template = lookup(key);
  if (typeof template !== 'string') return key;

  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => options?.[name] ?? match);
}) as unknown as TFunction<'messages'>;

const systemMessage = (systemType: string, text = '', attachments: Attachment[] = []): Message =>
  ({
    systemType,
    text,
    attachments,
    kind: 'system',
    sender: { displayName: 'Quy' },
  }) as Message;

const quote = (text: string): Attachment =>
  ({ kind: 'unknown', text, author: { name: 'linh', iconUrl: null, link: null } }) as Attachment;

describe('systemMessageLabel', () => {
  it('has an English string behind every mapped type', () => {
    const missing = Object.entries(SYSTEM_KEYS)
      .filter(([, key]) => typeof lookup(key) !== 'string')
      .map(([type]) => type);

    expect(missing, 'missing in en/messages.json').toEqual([]);
  });

  it('leaves no mapped string with an unfilled placeholder', () => {
    // `name` and `value` are the only two the renderer supplies; a string
    // asking for anything else would render the raw `{{…}}` at the user.
    const leftovers = Object.entries(SYSTEM_KEYS)
      .map(([type]) => [type, systemMessageLabel(systemMessage(type, 'General'), t)] as const)
      .filter(([, label]) => label.includes('{{'));

    expect(leftovers).toEqual([]);
  });

  it('names the actor and the payload', () => {
    expect(systemMessageLabel(systemMessage('room_changed_topic', 'Sprint 12'), t)).toBe(
      'Quy changed the topic to Sprint 12',
    );
    expect(systemMessageLabel(systemMessage('au', 'linh'), t)).toBe('Quy added linh');
  });

  it('translates both spellings of a started call', () => {
    expect(systemMessageLabel(systemMessage('videoconf'), t)).toBe('Quy started a call');
    expect(systemMessageLabel(systemMessage('jitsi_call_started'), t)).toBe('Quy started a call');
  });

  it('stands in for a payload that was cleared', () => {
    expect(systemMessageLabel(systemMessage('room_changed_topic', '   '), t)).toBe('Quy changed the topic to (none)');
  });

  it('falls back to the payload, then to the type, for an unmapped event', () => {
    expect(systemMessageLabel(systemMessage('some_app_event', 'Deploy finished'), t)).toBe('Deploy finished');
    expect(systemMessageLabel(systemMessage('some_app_event'), t)).toBe('some_app_event');
  });
});

describe('pinnedQuoteOf', () => {
  it('returns the copy of the message a pin event carries', () => {
    expect(pinnedQuoteOf(systemMessage('message_pinned', '', [quote('Ship it')]))?.text).toBe('Ship it');
    expect(pinnedQuoteOf(systemMessage('message_pinned_e2e', '', [quote('<ciphertext>')]))?.text).toBe('<ciphertext>');
  });

  it('is nothing for any other event, however it is attached', () => {
    expect(pinnedQuoteOf(systemMessage('uj', '', [quote('Ship it')]))).toBeNull();
    // Older servers pinned without copying the message onto the event.
    expect(pinnedQuoteOf(systemMessage('message_pinned'))).toBeNull();
  });

  it('marks only the encrypted spelling as ciphertext', () => {
    expect(isPinnedQuoteEncrypted(systemMessage('message_pinned_e2e'))).toBe(true);
    expect(isPinnedQuoteEncrypted(systemMessage('message_pinned'))).toBe(false);
  });
});
