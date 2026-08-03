import type { Message } from '@open-rocket-chat/client-sdk';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { searchTerms } from '@/features/messages/highlight';
import { useJumpStore } from '@/features/messages/jump-store';
import { Icons } from '@/ui/icon';
import { MessageRow } from '../message-row';
import { PanelBody, PanelSearch, PanelState, PanelToolbar } from '../panel';
import { useContextualBarOverlay, useContextualBarStore } from '../store';
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
  const closeBar = useContextualBarStore((state) => state.close);
  const barOverlays = useContextualBarOverlay();
  const jumpTo = useJumpStore((state) => state.jumpTo);
  const [term, setTerm] = useState('');
  const debouncedTerm = useDebounced(term);

  const search = useMessageSearch(roomId, debouncedTerm);
  const results = search.data ?? [];

  // Taken from the debounced term rather than the typed one, so the marks match
  // the results on screen instead of a search still being typed. Held steady
  // between those, so a keystroke does not re-parse every body in the list.
  const terms = useMemo(() => searchTerms(debouncedTerm), [debouncedTerm]);

  /**
   * Opening a result, which means going to where the message actually is.
   *
   * A reply is not in the timeline at all — it lives in its thread, and that is
   * the only place it can be read in context. Everything else, thread parents
   * included, is a row of the room, so the room is where the result leads.
   */
  const openResult = (message: Message) => {
    if (message.threadId) {
      push({ id: 'thread', messageId: message.threadId });
      return;
    }

    jumpTo(roomId, message.id);

    // On a narrow viewport this panel is drawn over the conversation rather
    // than beside it, so leaving it open would jump to a message it is
    // standing on. Where both fit, the results are worth keeping.
    if (barOverlays) closeBar();
  };

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
                  <MessageRow message={message} highlight={terms} onClick={() => openResult(message)} />
                </li>
              ))}
            </ul>
          </PanelState>
        )}
      </PanelBody>
    </>
  );
};
