import type { CustomEmoji } from '@open-rocket-chat/client-sdk';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { useClient, useServerId, useServerKeys } from '@/features/servers/server-scope';

/**
 * Group ids as emojibase numbers them. `2` is "component" — skin-tone and hair
 * modifiers that are not emoji on their own — so it is left out.
 */
export const EMOJI_GROUPS = [
  { id: 0, key: 'smileys-emotion' },
  { id: 1, key: 'people-body' },
  { id: 3, key: 'animals-nature' },
  { id: 4, key: 'food-drink' },
  { id: 5, key: 'travel-places' },
  { id: 6, key: 'activities' },
  { id: 7, key: 'objects' },
  { id: 8, key: 'symbols' },
  { id: 9, key: 'flags' },
] as const;

export type EmojiGroupKey = (typeof EMOJI_GROUPS)[number]['key'];

export interface StandardEmoji {
  /** Shortcode without colons, matching what Rocket.Chat stores for reactions. */
  shortcode: string;
  /** Every shortcode this emoji answers to; Rocket.Chat accepts all of them. */
  shortcodes: string[];
  character: string;
  label: string;
  /** Lowercased label plus tags, pre-joined for substring search. */
  search: string;
  group: EmojiGroupKey;
}

interface EmojibaseEmoji {
  hexcode: string;
  emoji: string;
  label: string;
  group?: number;
  order?: number;
  tags?: string[];
}

/**
 * The standard set, loaded on demand.
 *
 * `emojibase-data` is ~1.5 MB, so it is imported dynamically: the picker is
 * opened by a minority of sessions, and paying for it in the initial bundle
 * would slow the first paint for everyone. Rocket.Chat builds its own emoji
 * list from exactly this package and shortcode preset, so the shortcodes here
 * are the ones its reaction API accepts.
 */
let standardPromise: Promise<StandardEmoji[]> | undefined;

/** Emojibase stores one shortcode as a bare string and several as an array. */
const toList = (codes: string | string[] | undefined): string[] =>
  codes === undefined ? [] : Array.isArray(codes) ? codes : [codes];

const loadStandardEmoji = async (): Promise<StandardEmoji[]> => {
  const [data, shortcodes] = await Promise.all([
    import('emojibase-data/en/data.json').then((module) => module.default as unknown as EmojibaseEmoji[]),
    import('emojibase-data/en/shortcodes/emojibase.json').then(
      (module) => module.default as unknown as Record<string, string | string[]>,
    ),
  ]);

  // Widened to `number`: the literal union from `as const` would reject the
  // arbitrary group ids that arrive in the dataset.
  const groupByNumber = new Map<number, EmojiGroupKey>(EMOJI_GROUPS.map((group) => [group.id, group.key]));

  return data
    .flatMap((emoji) => {
      const group = emoji.group === undefined ? undefined : groupByNumber.get(emoji.group);
      if (!group) return [];

      const codes = toList(shortcodes[emoji.hexcode]);
      const shortcode = codes[0];
      // Without a shortcode there is nothing to send to Rocket.Chat.
      if (!shortcode) return [];

      return [
        {
          shortcode,
          shortcodes: codes,
          character: emoji.emoji,
          label: emoji.label,
          search: [emoji.label, ...codes, ...(emoji.tags ?? [])].join(' ').toLowerCase(),
          group,
        } satisfies StandardEmoji,
      ];
    })
    .sort((left, right) => left.shortcode.localeCompare(right.shortcode));
};

export const useStandardEmoji = (enabled: boolean) =>
  useQuery({
    queryKey: ['emoji', 'standard'],
    enabled,
    // The dataset never changes within a release.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    queryFn: () => {
      standardPromise ??= loadStandardEmoji();
      return standardPromise;
    },
  });

export const useCustomEmoji = (enabled: boolean) => {
  const client = useClient();
  const keys = useServerKeys();

  return useQuery({
    // Custom emoji are uploaded per server, so `:tada:` can be a different
    // image on each one the session is connected to.
    queryKey: keys.customEmoji,
    enabled,
    staleTime: 10 * 60_000,
    queryFn: () => client.emoji.listCustom(),
    select: (response): CustomEmoji[] => response.items,
  });
};

/**
 * `shortcode → character` for the standard set.
 *
 * Rendering a shortcode needs nothing but this mapping, and deriving the
 * character from the hexcode keeps it to a 170 KB import — the 775 KB dataset
 * above is only worth loading for the picker, which also needs labels, groups
 * and search terms.
 */
let unicodePromise: Promise<Map<string, string>> | undefined;

const characterOf = (hexcode: string): string | null => {
  // Sequences such as `1F468-200D-1F469` are one emoji spelled with joiners.
  const points = hexcode.split('-').map((part) => Number.parseInt(part, 16));
  return points.every((point) => Number.isFinite(point)) ? String.fromCodePoint(...points) : null;
};

const loadUnicodeShortcodes = async (): Promise<Map<string, string>> => {
  const shortcodes = await import('emojibase-data/en/shortcodes/emojibase.json').then(
    (module) => module.default as unknown as Record<string, string | string[]>,
  );

  const characters = new Map<string, string>();

  for (const [hexcode, codes] of Object.entries(shortcodes)) {
    const character = characterOf(hexcode);
    if (!character) continue;
    for (const code of toList(codes)) characters.set(code, character);
  }

  return characters;
};

const useUnicodeShortcodes = () =>
  useQuery({
    queryKey: ['emoji', 'unicode-shortcodes'],
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    queryFn: () => {
      unicodePromise ??= loadUnicodeShortcodes();
      return unicodePromise;
    },
  });

export type ResolvedEmoji = { kind: 'unicode'; character: string } | { kind: 'custom'; name: string; url: string };

/** Resolves a shortcode written without colons; null when nothing matches. */
export type ResolveEmoji = (name: string) => ResolvedEmoji | null;

// Rebuilt only when one of the two datasets actually changes identity. Both
// come from the react-query cache, so without this every reaction pill and
// every message body would build its own copy of a ~4 000 entry map.
//
// Keyed by server: the custom set and the media URLs both differ per server,
// and one shared slot would thrash on every switch.
const indexCache = new Map<
  string,
  { characters?: Map<string, string>; custom?: CustomEmoji[]; resolve: ResolveEmoji }
>();

const buildResolver = (
  mediaUrl: (path: string) => string,
  characters: Map<string, string> | undefined,
  custom: CustomEmoji[] | undefined,
): ResolveEmoji => {
  const customByName = new Map<string, CustomEmoji>();

  for (const emoji of custom ?? []) {
    // Aliases are registered too, and the primary name wins: Rocket.Chat lets
    // one emoji's alias collide with another's name.
    for (const alias of emoji.aliases) if (!customByName.has(alias)) customByName.set(alias, emoji);
    customByName.set(emoji.name, emoji);
  }

  return (name) => {
    // Custom first: a server that uploads `:tada:` means its own image.
    const match = customByName.get(name);
    if (match) return { kind: 'custom', name, url: mediaUrl(match.url) };

    const character = characters?.get(name);
    return character ? { kind: 'unicode', character } : null;
  };
};

/**
 * The shared shortcode resolver, used everywhere a message is displayed.
 *
 * Both datasets are fetched as soon as anything renders a message — unlike the
 * picker's, which waits for a click. Reactions and message text arrive without
 * any interaction, so a lazy lookup would leave most of them as raw text.
 */
export const useEmojiIndex = (): ResolveEmoji => {
  const client = useClient();
  const serverId = useServerId();
  const { data: characters } = useUnicodeShortcodes();
  const { data: custom } = useCustomEmoji(true);

  const cached = indexCache.get(serverId);
  if (cached && cached.characters === characters && cached.custom === custom) return cached.resolve;

  const resolve = buildResolver((path) => client.mediaUrl(path), characters, custom);
  indexCache.set(serverId, { characters, custom, resolve });
  return resolve;
};

const RECENT_KEY = 'orc:recent-emoji';
const RECENT_LIMIT = 24;

const readRecent = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    // Storage is unavailable in some privacy modes; an empty history is a far
    // better outcome than a picker that will not open.
    return [];
  }
};

/** Most-recently-used shortcodes, so the common few are always one click away. */
export const useRecentEmoji = () => {
  const [recent, setRecent] = useState<string[]>(readRecent);

  const remember = useCallback((shortcode: string) => {
    setRecent((current) => {
      const next = [shortcode, ...current.filter((entry) => entry !== shortcode)].slice(0, RECENT_LIMIT);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // See readRecent.
      }
      return next;
    });
  }, []);

  return { recent, remember };
};
