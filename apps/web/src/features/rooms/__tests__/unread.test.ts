import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import enRooms from '@/i18n/locales/en/rooms.json';
import { aggregateUnread, formatUnreadCount, unreadLabel, unreadSummary, type UnreadCounts } from '../unread';

/** Resolves a dotted key against the English bundle, plural suffix and all. */
const lookup = (key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], enRooms);

/** Renders like i18next: pick the plural form, then substitute `{{count}}`. */
const t = ((key: string, options?: { count?: number }) => {
  const count = options?.count;
  const template =
    count === undefined ? lookup(key) : (lookup(`${key}_${count === 1 ? 'one' : 'other'}`) ?? lookup(key));

  return typeof template === 'string' ? template.replace(/\{\{count\}\}/g, String(count)) : key;
}) as unknown as TFunction<'rooms'>;

const counts = (overrides: Partial<UnreadCounts> = {}): UnreadCounts => ({
  unreadCount: 0,
  userMentionsCount: 0,
  groupMentionsCount: 0,
  hasUnreadActivity: false,
  ...overrides,
});

describe('formatUnreadCount', () => {
  it('shows the exact number up to the cap', () => {
    expect(formatUnreadCount(1)).toBe('1');
    expect(formatUnreadCount(99)).toBe('99');
  });

  it('caps anything larger at "+99"', () => {
    expect(formatUnreadCount(100)).toBe('+99');
    expect(formatUnreadCount(4213)).toBe('+99');
  });
});

describe('unreadSummary', () => {
  it('counts every unread message, not only the mentions', () => {
    // The Rocket.Chat rule: twelve unread of which one names you is "12", in
    // red — telling someone they have one message would simply be wrong.
    const summary = unreadSummary(counts({ unreadCount: 12, userMentionsCount: 1 }));

    expect(summary.total).toBe(12);
    expect(summary.mentions).toBe(1);
    expect(summary.showBadge).toBe(true);
  });

  it('treats group mentions as mentions', () => {
    expect(unreadSummary(counts({ unreadCount: 3, groupMentionsCount: 2 })).mentions).toBe(2);
  });

  it('still badges a mention the server did not count as unread', () => {
    expect(unreadSummary(counts({ unreadCount: 0, userMentionsCount: 1 })).total).toBe(1);
  });

  it('shows no badge for a room that is fully read', () => {
    expect(unreadSummary(counts()).showBadge).toBe(false);
  });

  it('highlights a room marked unread by hand, which carries no count', () => {
    const summary = unreadSummary(counts({ hasUnreadActivity: true }));

    expect(summary.showBadge).toBe(false);
    expect(summary.highlight).toBe(true);
  });
});

describe('aggregateUnread', () => {
  it('adds up every room on the server', () => {
    const summary = aggregateUnread([
      counts({ unreadCount: 3 }),
      counts({ unreadCount: 7, userMentionsCount: 2 }),
      counts(),
    ]);

    expect(summary.total).toBe(10);
    expect(summary.mentions).toBe(2);
    expect(summary.showBadge).toBe(true);
  });

  it('does not let one room’s mentions cancel out another room’s messages', () => {
    // Summing the raw fields and taking the maximum once would give 5 here —
    // the mention in the second room would swallow four unread messages.
    const summary = aggregateUnread([counts({ unreadCount: 5 }), counts({ unreadCount: 0, userMentionsCount: 1 })]);

    expect(summary.total).toBe(6);
  });

  it('reports no badge for a server with nothing unread', () => {
    const summary = aggregateUnread([counts(), counts()]);

    expect(summary.showBadge).toBe(false);
    expect(summary.highlight).toBe(false);
  });

  it('still flags a server whose only unread room carries no count', () => {
    const summary = aggregateUnread([counts(), counts({ hasUnreadActivity: true })]);

    expect(summary.showBadge).toBe(false);
    expect(summary.highlight).toBe(true);
  });

  it('has nothing to say about a server whose rooms have not loaded', () => {
    expect(aggregateUnread([])).toEqual({ total: 0, mentions: 0, showBadge: false, highlight: false });
  });
});

describe('unreadLabel', () => {
  it('describes plain unread messages', () => {
    expect(unreadLabel(unreadSummary(counts({ unreadCount: 3 })), t)).toBe('3 unread messages');
  });

  it('uses the singular where the language has one', () => {
    expect(unreadLabel(unreadSummary(counts({ unreadCount: 1 })), t)).toBe('1 unread message');
  });

  it('names mentions first, then the rest of the messages', () => {
    const summary = unreadSummary(counts({ unreadCount: 4, userMentionsCount: 1 }));

    expect(unreadLabel(summary, t)).toBe('1 mention, 3 unread messages');
  });

  it('says only "mentions" when every unread message is one', () => {
    expect(unreadLabel(unreadSummary(counts({ unreadCount: 2, userMentionsCount: 2 })), t)).toBe('2 mentions');
  });
});
