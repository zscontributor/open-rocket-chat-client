import type { CustomEmoji } from '@open-rocket-chat/client-sdk';
import * as Popover from '@radix-ui/react-popover';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useClient } from '@/features/servers/server-scope';
import { cn } from '@/lib/cn';
import { Icons, Spinner } from '@/ui/icon';
import { Input } from '@/ui/input';
import { EMOJI_GROUPS, useCustomEmoji, useRecentEmoji, useStandardEmoji, type StandardEmoji } from './use-emoji';

/** Beyond this, rendering every match makes typing feel sluggish. */
const MAX_SEARCH_RESULTS = 120;

interface Section {
  key: string;
  title: string;
  standard: StandardEmoji[];
  custom: CustomEmoji[];
}

const EmojiButton = ({ label, onSelect, children }: { label: string; onSelect: () => void; children: ReactNode }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onSelect}
    className="hover:bg-sunken flex size-8 items-center justify-center rounded-md text-xl leading-none transition-colors"
  >
    {children}
  </button>
);

const CustomEmojiImage = ({ emoji }: { emoji: CustomEmoji }) => {
  const client = useClient();

  return <img src={client.mediaUrl(emoji.url)} alt="" loading="lazy" className="size-6 object-contain" />;
};

/**
 * Emoji picker over the same dataset Rocket.Chat uses, plus whatever custom
 * emoji the connected server has, so a chosen shortcode is always one the
 * server will accept as a reaction.
 */
export const EmojiPicker = ({
  trigger,
  onSelect,
  align = 'start',
  side = 'top',
  onOpenChange,
}: {
  trigger: ReactNode;
  /** Receives the shortcode *without* colons. */
  onSelect: (shortcode: string) => void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  /**
   * Lets the owner keep the trigger mounted and laid out while the picker is
   * open — a trigger that disappears leaves the popover with nothing to anchor
   * to, and it snaps to the top-left corner.
   */
  onOpenChange?: (open: boolean) => void;
}) => {
  const { t } = useTranslation('composer');
  const { t: tCommon } = useTranslation('common');

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Nothing is fetched until the picker is opened for the first time.
  const { data: standard, isLoading: loadingStandard } = useStandardEmoji(open);
  const { data: custom } = useCustomEmoji(open);
  const { recent, remember } = useRecentEmoji();

  const sections = useMemo<Section[]>(() => {
    const term = query.trim().toLowerCase();
    const allStandard = standard ?? [];
    const allCustom = custom ?? [];

    if (term) {
      return [
        {
          key: 'results',
          title: '',
          standard: allStandard.filter((emoji) => emoji.search.includes(term)).slice(0, MAX_SEARCH_RESULTS),
          custom: allCustom
            .filter(
              (emoji) =>
                emoji.name.toLowerCase().includes(term) ||
                emoji.aliases.some((alias) => alias.toLowerCase().includes(term)),
            )
            .slice(0, MAX_SEARCH_RESULTS),
        },
      ];
    }

    const byShortcode = new Map(allStandard.map((emoji) => [emoji.shortcode, emoji] as const));
    const customByName = new Map(allCustom.map((emoji) => [emoji.name, emoji] as const));

    const built: Section[] = [];

    const recentStandard = recent.flatMap((shortcode) => byShortcode.get(shortcode) ?? []);
    const recentCustom = recent.flatMap((shortcode) => customByName.get(shortcode) ?? []);
    if (recentStandard.length > 0 || recentCustom.length > 0) {
      built.push({
        key: 'frequent',
        title: t('emojiPicker.frequent'),
        standard: recentStandard,
        custom: recentCustom,
      });
    }

    // Server emoji first: they are the ones a team actually reaches for, and
    // there are few enough to scan at a glance.
    if (allCustom.length > 0) {
      built.push({ key: 'custom', title: t('emojiPicker.custom'), standard: [], custom: allCustom });
    }

    for (const group of EMOJI_GROUPS) {
      const members = allStandard.filter((emoji) => emoji.group === group.key);
      if (members.length === 0) continue;
      built.push({
        key: group.key,
        title: t(`emojiPicker.group.${group.key}`),
        standard: members,
        custom: [],
      });
    }

    return built;
  }, [standard, custom, query, recent, t]);

  const choose = (shortcode: string) => {
    remember(shortcode);
    onSelect(shortcode);
    setOpen(false);
    onOpenChange?.(false);
    setQuery('');
  };

  const isEmpty = sections.every((section) => section.standard.length === 0 && section.custom.length === 0);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
        if (!next) setQuery('');
      }}
    >
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={8}
          className="bg-panel border-line z-40 flex h-96 w-80 flex-col overflow-hidden rounded-xl border shadow-lg"
        >
          <div className="border-line border-b p-2">
            <div className="relative">
              <Icons.search
                size={16}
                className="text-content-muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('emojiPicker.search')}
                aria-label={t('emojiPicker.search')}
                autoFocus
                className="h-9 pl-8 text-sm"
              />
            </div>
          </div>

          {/*
           * No top padding: a sticky header offsets from the content box, so any
           * padding here would park the group title below the scrollport's top
           * edge and let emoji scroll through the gap above it.
           */}
          <div className="scrollbar-slim flex-1 overflow-y-auto px-2 pb-2">
            {loadingStandard ? (
              <div className="text-content-muted flex h-full items-center justify-center gap-2 text-sm">
                <Spinner className="size-4" /> {tCommon('state.loading')}
              </div>
            ) : isEmpty ? (
              <p className="text-content-muted p-4 text-center text-sm">
                {query.trim() ? t('emojiPicker.noResults', { query: query.trim() }) : tCommon('state.empty')}
              </p>
            ) : (
              sections.map((section) => {
                if (section.standard.length === 0 && section.custom.length === 0) return null;

                // Titleless (search) sections take back the top padding the scroller gave up.
                return (
                  <section key={section.key} className={cn('mb-3', section.title ? undefined : 'pt-2')}>
                    {section.title ? (
                      <h3 className="text-content-muted bg-panel sticky top-0 z-10 px-1 py-1.5 text-[11px] font-semibold">
                        {section.title}
                      </h3>
                    ) : null}

                    <div className={cn('grid grid-cols-8 gap-0.5')}>
                      {section.custom.map((emoji) => (
                        <EmojiButton
                          key={`c-${emoji.id}`}
                          label={`:${emoji.name}:`}
                          onSelect={() => choose(emoji.name)}
                        >
                          <CustomEmojiImage emoji={emoji} />
                        </EmojiButton>
                      ))}

                      {section.standard.map((emoji) => (
                        <EmojiButton
                          key={`s-${emoji.shortcode}`}
                          label={emoji.label}
                          onSelect={() => choose(emoji.shortcode)}
                        >
                          {emoji.character}
                        </EmojiButton>
                      ))}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
