import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Icons } from '@/ui/icon';
import { MessageRow } from '../message-row';
import { PanelBody, PanelSearch, PanelState, PanelToolbar } from '../panel';
import { useContextualBarStore } from '../store';
import { useDebounced, useMessageSearch } from '../use-panels';

/**
 * Message search within the room.
 *
 * Rocket.Chat's default search provider understands operators in the same box —
 * `from:alice`, `has:star`, `is:pinned`, `before:2024-01-01` — and the term is
 * passed through untouched so they keep working here.
 */
export const SearchPanel = ({ roomId }: { roomId: string }) => {
  const { t } = useTranslation('rooms');

  // Pushed, so a thread opened from a result can come back to the results —
  // re-running a search you had already typed is the alternative.
  const push = useContextualBarStore((state) => state.push);
  const [term, setTerm] = useState('');
  const debouncedTerm = useDebounced(term);

  const search = useMessageSearch(roomId, debouncedTerm);
  const results = search.data ?? [];

  return (
    <>
      <PanelToolbar>
        <PanelSearch value={term} onChange={setTerm} label={t('search.label')} placeholder={t('search.placeholder')} />
        <p className="text-content-muted text-[11px]">{t('search.operatorsHint')}</p>
      </PanelToolbar>

      <PanelBody>
        {debouncedTerm.trim().length === 0 ? (
          <p className="text-content-muted px-4 py-10 text-center text-sm">{t('search.hint')}</p>
        ) : (
          <PanelState
            loading={search.isPending}
            error={search.error}
            empty={results.length === 0}
            emptyIcon={<Icons.search size={32} />}
            emptyLabel={t('search.noMatches', { query: debouncedTerm })}
          >
            <ul className="divide-line divide-y">
              {results.map((message) => (
                <li key={message.id}>
                  <MessageRow
                    message={message}
                    onClick={
                      message.threadId || message.threadCount > 0
                        ? () => push({ id: 'thread', messageId: message.threadId ?? message.id })
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          </PanelState>
        )}
      </PanelBody>
    </>
  );
};
