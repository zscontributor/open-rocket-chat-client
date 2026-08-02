import type { UserSummary } from '@open-rocket-chat/client-sdk';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { displayNameOf, useCapabilities } from '@/features/server/use-capabilities';
import { describeError } from '@/lib/errors';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { Icons, Spinner } from '@/ui/icon';
import { PanelBody, PanelSearch, PanelState, PanelToolbar } from '../panel';
import { useContextualBarStore } from '../store';
import { useAddRoomMembers } from '../use-member-actions';
import { useDebounced, useUserSearch } from '../use-panels';

/**
 * Search-and-collect, rather than a search that invites on click.
 *
 * Inviting several people is the normal case, and one request carrying all of
 * them is both fewer round-trips and one system message in the room instead of
 * five.
 */
export const AddMembersPanel = ({ roomId }: { roomId: string }) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');

  const back = useContextualBarStore((state) => state.back);
  const { data: capabilities } = useCapabilities();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<UserSummary[]>([]);
  const debouncedQuery = useDebounced(query);

  const search = useUserSearch(debouncedQuery);
  const addMembers = useAddRoomMembers(roomId);

  const selectedIds = new Set(selected.map((user) => user.id));
  const results = (search.data ?? []).filter((user) => !selectedIds.has(user.id));

  const submit = () => {
    if (selected.length === 0) return;
    addMembers.mutate(
      selected.map((user) => user.id),
      { onSuccess: back },
    );
  };

  return (
    <>
      <PanelToolbar>
        <PanelSearch
          value={query}
          onChange={setQuery}
          label={t('addMembers.search')}
          placeholder={t('addMembers.searchPlaceholder')}
        />

        {selected.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {selected.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => setSelected((current) => current.filter((entry) => entry.id !== user.id))}
                  className="bg-sunken hover:bg-line flex items-center gap-1.5 rounded-full py-1 pr-2 pl-1 text-xs transition-colors"
                >
                  <Avatar name={displayNameOf(capabilities, user)} src={user.avatarUrl} size="xs" />
                  <span className="max-w-32 truncate">{displayNameOf(capabilities, user)}</span>
                  <Icons.close size={12} className="text-content-muted" />
                  <span className="sr-only">{tCommon('action.remove')}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </PanelToolbar>

      <PanelBody>
        {debouncedQuery.trim().length === 0 ? (
          <p className="text-content-muted px-4 py-10 text-center text-sm">{t('addMembers.hint')}</p>
        ) : (
          <PanelState
            loading={search.isPending}
            error={search.error}
            empty={results.length === 0}
            emptyIcon={<Icons.members size={32} />}
            emptyLabel={t('addMembers.noMatches', { query: debouncedQuery })}
          >
            <ul>
              {results.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected((current) => [...current, user]);
                      setQuery('');
                    }}
                    className="hover:bg-sunken flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors"
                  >
                    <Avatar
                      name={displayNameOf(capabilities, user)}
                      src={user.avatarUrl}
                      size="sm"
                      status={user.status}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{displayNameOf(capabilities, user)}</span>
                      <span className="text-content-muted block truncate text-[11px]">@{user.username}</span>
                    </span>
                    <Icons.add size={16} className="text-content-muted shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </PanelState>
        )}
      </PanelBody>

      {addMembers.error ? (
        <p role="alert" className="text-danger border-line border-t px-4 py-2 text-sm">
          {describeError(addMembers.error)}
        </p>
      ) : null}

      <footer className="border-line flex shrink-0 justify-end gap-2 border-t px-4 py-3">
        <Button size="md" onClick={back}>
          {tCommon('action.cancel')}
        </Button>
        <Button variant="primary" size="md" disabled={selected.length === 0 || addMembers.isPending} onClick={submit}>
          {addMembers.isPending ? <Spinner className="size-4" /> : null}
          {t('addMembers.submit', { count: selected.length })}
        </Button>
      </footer>
    </>
  );
};
