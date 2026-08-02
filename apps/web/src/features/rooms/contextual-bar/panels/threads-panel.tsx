import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';

import { Icons } from '@/ui/icon';
import { MessageRow } from '../message-row';
import { LoadMore, PanelBody, PanelState } from '../panel';
import { useContextualBarStore } from '../store';
import { useRoomThreads } from '../use-panels';

/** Thread parents in the room, newest reply first. */
export const ThreadsPanel = ({ roomId }: { roomId: string }) => {
  const { t } = useTranslation('rooms');
  const { t: tMessages } = useTranslation('messages');

  // Pushed rather than opened: a thread reached from this list keeps the list
  // as its back target, so closing the thread returns to where it was picked.
  const push = useContextualBarStore((state) => state.push);
  const threads = useRoomThreads(roomId);
  const items = threads.data?.threads ?? [];

  return (
    <PanelBody>
      <PanelState
        loading={threads.isPending}
        error={threads.error}
        empty={items.length === 0}
        emptyIcon={<Icons.threads size={32} />}
        emptyLabel={t('threads.empty')}
      >
        <ul className="divide-line divide-y">
          {items.map((message) => (
            <li key={message.id}>
              <MessageRow
                message={message}
                onClick={() => push({ id: 'thread', messageId: message.id })}
                footer={
                  <p className="text-accent mt-1.5 flex items-center gap-1.5 text-xs font-medium">
                    <Icons.threads size={13} />
                    {tMessages('thread.replies', { count: message.threadCount })}
                    {message.threadLastReplyAt ? (
                      <span className="text-content-muted font-normal">
                        · {formatDistanceToNow(new Date(message.threadLastReplyAt), { addSuffix: true })}
                      </span>
                    ) : null}
                  </p>
                }
              />
            </li>
          ))}
        </ul>

        {threads.hasNextPage ? (
          <LoadMore onClick={() => void threads.fetchNextPage()} loading={threads.isFetchingNextPage} />
        ) : null}
      </PanelState>
    </PanelBody>
  );
};
