import { useEffect, useRef, type FocusEvent, type KeyboardEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { displayNameOf, useCapabilities } from '@/features/server/use-capabilities';
import { cn } from '@/lib/cn';
import { Avatar } from '@/ui/avatar';
import { Icons, Spinner } from '@/ui/icon';
import { Input } from '@/ui/input';
import type { AutocompleteItem } from './use-composer-autocomplete';
import { readableCommandText } from './use-slash-commands';

/**
 * The row's leading mark. Users get their avatar; everything else gets the icon
 * its kind is known by elsewhere in the app, so a `#` in this list looks like
 * the same thing it does in the sidebar.
 */
const ItemIcon = ({ item }: { item: AutocompleteItem }) => {
  if (item.kind === 'user') {
    return <Avatar name={item.user.displayName} src={item.user.avatarUrl} size="sm" status={item.user.status} />;
  }

  // A room with a picture wears it here too, for the same reason the sidebar
  // does: the picture identifies it faster than a repeated type mark.
  if (item.kind === 'channel' && item.room.avatarUrl) {
    return <Avatar name={item.room.displayName} src={item.room.avatarUrl} size="sm" />;
  }

  const icon =
    item.kind === 'special' ? (
      <Icons.mention size={16} />
    ) : item.kind === 'command' ? (
      <Icons.integrations size={16} />
    ) : item.room.type === 'channel' ? (
      <Icons.channel size={16} />
    ) : (
      <Icons.private size={16} />
    );

  return (
    <span className="bg-sunken text-content-muted flex size-7 shrink-0 items-center justify-center rounded-lg">
      {icon}
    </span>
  );
};

const ItemRow = ({ item }: { item: AutocompleteItem }) => {
  const { t } = useTranslation('composer');
  const { data: capabilities } = useCapabilities();

  if (item.kind === 'user') {
    return (
      <>
        <span className="truncate font-medium">{displayNameOf(capabilities, item.user)}</span>
        <span className="text-content-muted truncate text-xs">@{item.user.username}</span>
        {/* Worth saying out loud: mentioning somebody who is not here does not
            add them to the room, and Rocket.Chat will say so after the fact. */}
        {item.inRoom ? null : (
          <span className="text-content-muted ml-auto shrink-0 text-[11px]">{t('autocomplete.notInRoom')}</span>
        )}
      </>
    );
  }

  if (item.kind === 'special') {
    return (
      <>
        <span className="truncate font-medium">@{item.name}</span>
        <span className="text-content-muted truncate text-xs">{t(`autocomplete.special.${item.name}`)}</span>
      </>
    );
  }

  if (item.kind === 'channel') {
    return (
      <>
        <span className="truncate font-medium">{item.room.name}</span>
        {item.room.displayName === item.room.name ? null : (
          <span className="text-content-muted truncate text-xs">{item.room.displayName}</span>
        )}
      </>
    );
  }

  return (
    <>
      <span className="truncate font-medium">/{item.command}</span>
      {item.params ? (
        <span className="text-content-muted shrink-0 font-mono text-xs">{readableCommandText(item.params)}</span>
      ) : null}
      {item.description ? (
        <span className="text-content-muted ml-auto truncate pl-2 text-xs">
          {readableCommandText(item.description)}
        </span>
      ) : null}
    </>
  );
};

/**
 * The completion list, floating above the message box.
 *
 * Anchored to the composer rather than to the caret: a textarea gives no
 * position for its caret, and every chat client that tries lands the panel in
 * the wrong place on wrapped lines anyway.
 *
 * Focus stays in the textarea throughout — this is a `listbox` the textarea
 * points at with `aria-activedescendant`, which is why the rows take themselves
 * out of the tab order and answer `mousedown` rather than `click`: pressing a
 * row must not pull focus, and by the time a click lands the box has blurred
 * and closed the panel underneath the pointer.
 */
export const ComposerAutocomplete = ({
  id,
  ref,
  items,
  activeIndex,
  isLoading,
  search,
  optionId,
  onSelect,
  onHighlight,
}: {
  id: string;
  /** Lets the composer tell a blur into this panel from a blur out of it. */
  ref: RefObject<HTMLDivElement | null>;
  items: AutocompleteItem[];
  activeIndex: number;
  isLoading: boolean;
  /**
   * The search box, for the kinds that have one. Omitted for commands: the
   * whole list fits on screen, and the slash is already the search.
   */
  search?: {
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
    /** The panel's keys are the box's keys, so navigation works from either. */
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
    onBlur: (event: FocusEvent<HTMLInputElement>) => void;
  };
  /** Builds the id of one row, so the textarea can name the active one. */
  optionId: (index: number) => string;
  onSelect: (item: AutocompleteItem) => void;
  onHighlight: (index: number) => void;
}) => {
  const { t } = useTranslation('composer');
  const list = useRef<HTMLDivElement>(null);

  // Keyboard navigation has to bring its row with it; the list is taller than
  // the panel as soon as there are more than a handful of matches.
  useEffect(() => {
    const active = list.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, items]);

  return (
    <div
      ref={ref}
      className="border-line bg-panel absolute right-3 bottom-full left-3 z-30 mb-2 overflow-hidden rounded-xl border shadow-lg"
    >
      {search ? (
        <div className="border-line border-b p-2">
          <div className="relative">
            <Icons.search
              size={16}
              className="text-content-muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
            />
            {/*
             * Deliberately not focused when the panel opens: the user is in the
             * middle of typing a message, and stealing the caret out of the box
             * mid-sentence would be worse than the search being one click away.
             * It is there for when the word already typed did not find them.
             */}
            <Input
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              onKeyDown={search.onKeyDown}
              onBlur={search.onBlur}
              placeholder={search.placeholder}
              aria-label={search.placeholder}
              aria-controls={id}
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>
      ) : null}

      {isLoading && items.length === 0 ? (
        <p className="text-content-muted flex items-center gap-2 px-3 py-2 text-sm">
          <Spinner className="size-4" /> {t('autocomplete.loading')}
        </p>
      ) : items.length === 0 ? (
        <p className="text-content-muted px-3 py-2 text-sm">
          {search?.value.trim() ? t('autocomplete.noResults', { query: search.value.trim() }) : t('autocomplete.empty')}
        </p>
      ) : (
        <div
          ref={list}
          id={id}
          role="listbox"
          aria-label={t('autocomplete.label')}
          className="max-h-64 overflow-y-auto"
        >
          {items.map((item, index) => (
            <button
              type="button"
              key={item.key}
              id={optionId(index)}
              role="option"
              // Out of the tab order: the textarea keeps focus, and Tab from
              // there accepts the highlighted row rather than walking the list.
              tabIndex={-1}
              aria-selected={index === activeIndex}
              data-active={index === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item);
              }}
              onMouseMove={() => onHighlight(index)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                index === activeIndex && 'bg-sunken',
              )}
            >
              <ItemIcon item={item} />
              <ItemRow item={item} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
