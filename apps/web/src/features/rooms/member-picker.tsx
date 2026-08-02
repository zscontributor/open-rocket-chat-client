import type { UserSummary } from '@open-rocket-chat/client-sdk';
import { useTranslation } from 'react-i18next';

import { displayNameOf, useCapabilities } from '@/features/server/use-capabilities';
import { Avatar } from '@/ui/avatar';
import { Icons, Spinner } from '@/ui/icon';
import { Input } from '@/ui/input';
import { useDebounced, useUserSearch } from './contextual-bar/use-panels';

/**
 * Ceiling on the candidates the list shows.
 *
 * Usually not the binding constraint: the server decides how many suggestions
 * a search returns, and its own default is lower. This only stops an unusually
 * generous setting from turning the picker into a scroll.
 */
const SUGGESTION_LIMIT = 10;

const SelectedChip = ({ user, onRemove }: { user: UserSummary; onRemove: () => void }) => {
  const { t: tCommon } = useTranslation('common');
  const { data: capabilities } = useCapabilities();
  const name = displayNameOf(capabilities, user);

  return (
    <button
      type="button"
      onClick={onRemove}
      className="bg-sunken hover:bg-line flex items-center gap-1.5 rounded-full py-1 pr-2 pl-1 text-xs transition-colors"
    >
      <Avatar name={name} src={user.avatarUrl} size="xs" />
      <span className="max-w-32 truncate">{name}</span>
      <Icons.close size={12} className="text-content-muted" />
      <span className="sr-only">{tCommon('action.remove')}</span>
    </button>
  );
};

const CandidateRow = ({ user, selected, onToggle }: { user: UserSummary; selected: boolean; onToggle: () => void }) => {
  const { data: capabilities } = useCapabilities();
  const name = displayNameOf(capabilities, user);

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className="hover:bg-sunken flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
    >
      <Avatar name={name} src={user.avatarUrl} size="sm" status={user.status} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="text-content-muted block truncate text-[11px]">@{user.username}</span>
      </span>
      {selected ? (
        <Icons.success size={16} className="text-accent shrink-0" />
      ) : (
        <Icons.add size={16} className="text-content-muted shrink-0" />
      )}
    </button>
  );
};

/**
 * Search-and-collect picker for the people a new room starts with.
 *
 * The list is populated before the user types anything — an empty term makes
 * Rocket.Chat return the caller's direct-message contacts first, which is
 * almost always who they mean — so the common case needs no typing at all.
 * Toggling rather than removing-on-pick keeps a mis-click one click to undo.
 */
export const MemberPicker = ({
  value,
  onChange,
  query,
  onQueryChange,
}: {
  value: UserSummary[];
  onChange: (next: UserSummary[]) => void;
  query: string;
  onQueryChange: (next: string) => void;
}) => {
  const { t } = useTranslation('rooms');

  const debouncedQuery = useDebounced(query);
  const search = useUserSearch(debouncedQuery, { limit: SUGGESTION_LIMIT, allowEmpty: true });

  const selectedIds = new Set(value.map((user) => user.id));
  const candidates = search.data ?? [];

  const toggle = (user: UserSummary) => {
    onChange(selectedIds.has(user.id) ? value.filter((entry) => entry.id !== user.id) : [...value, user]);
  };

  return (
    <div className="space-y-2">
      <Input
        id="room-members"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t('create.membersPlaceholder')}
        aria-label={t('create.members')}
      />

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((user) => (
            <li key={user.id}>
              <SelectedChip user={user} onRemove={() => toggle(user)} />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="border-line max-h-56 overflow-y-auto rounded-lg border">
        {search.isPending ? (
          <p className="text-content-muted flex items-center justify-center gap-2 py-8 text-sm">
            <Spinner className="size-4" />
          </p>
        ) : search.error ? (
          <p className="text-content-muted px-3 py-8 text-center text-sm">{t('create.membersFailed')}</p>
        ) : candidates.length === 0 ? (
          <p className="text-content-muted px-3 py-8 text-center text-sm">
            {debouncedQuery.trim() ? t('create.membersNoMatches', { query: debouncedQuery }) : t('create.membersEmpty')}
          </p>
        ) : (
          <ul aria-label={t('create.members')}>
            {candidates.map((user) => (
              <li key={user.id}>
                <CandidateRow user={user} selected={selectedIds.has(user.id)} onToggle={() => toggle(user)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
