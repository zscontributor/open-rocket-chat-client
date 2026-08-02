import type { RoomSummary } from '@open-rocket-chat/client-sdk';
import { useTranslation } from 'react-i18next';

import { useSetMessageFlag } from '@/features/messages/use-messages';
import { canPinMessage, canStarMessage, useCapabilities } from '@/features/server/use-capabilities';
import { Icons } from '@/ui/icon';
import { MessageRow, RowAction } from '../message-row';
import { LoadMore, PanelBody, PanelState } from '../panel';
import { useContextualBarStore } from '../store';
import { useMessageCollection, type MessageCollection } from '../use-panels';

const EMPTY_ICON: Record<MessageCollection, keyof typeof Icons> = {
  pinned: 'pin',
  starred: 'star',
  mentions: 'mention',
};

/**
 * Pinned, starred and mentioned messages.
 *
 * One component for three panels: they differ only in which endpoint fills them
 * and which flag the hover action clears, and Rocket.Chat renders all three
 * with the same list too.
 */
export const MessageCollectionPanel = ({
  kind,
  room,
  roomId,
}: {
  kind: MessageCollection;
  room: RoomSummary | undefined;
  roomId: string;
}) => {
  const { t } = useTranslation('rooms');

  // Pushed, so the thread a row opens keeps this list as its back target.
  const push = useContextualBarStore((state) => state.push);
  const { data: capabilities } = useCapabilities();

  const collection = useMessageCollection(roomId, kind);
  const setFlag = useSetMessageFlag(roomId);

  const messages = collection.data?.messages ?? [];

  // The row drops itself: clearing the flag invalidates this very list, since
  // the message is still in the room but no longer belongs here.
  const clearFlag = (messageId: string, flag: 'pinned' | 'starred') =>
    setFlag.mutate({ messageId, flag, value: false });

  const canUnpin = kind === 'pinned' && canPinMessage(capabilities, room);
  const canUnstar = kind === 'starred' && canStarMessage(capabilities);

  const EmptyIcon = Icons[EMPTY_ICON[kind]];

  return (
    <PanelBody>
      <PanelState
        loading={collection.isPending}
        error={collection.error}
        empty={messages.length === 0}
        emptyIcon={<EmptyIcon size={32} />}
        emptyLabel={t(`${kind}.empty`)}
      >
        <ul className="divide-line divide-y">
          {messages.map((message) => (
            <li key={message.id}>
              <MessageRow
                message={message}
                // A threaded message opens its thread; a main-timeline one has
                // nowhere more specific to go than where it already is.
                onClick={
                  message.threadId || message.threadCount > 0
                    ? () => push({ id: 'thread', messageId: message.threadId ?? message.id })
                    : undefined
                }
                actions={
                  canUnpin ? (
                    <RowAction label={t('pinned.unpin')} onClick={() => clearFlag(message.id, 'pinned')}>
                      <Icons.pin size={14} weight="fill" />
                    </RowAction>
                  ) : canUnstar ? (
                    <RowAction label={t('starred.unstar')} onClick={() => clearFlag(message.id, 'starred')}>
                      <Icons.star size={14} weight="fill" />
                    </RowAction>
                  ) : null
                }
              />
            </li>
          ))}
        </ul>

        {collection.hasNextPage ? (
          <LoadMore onClick={() => void collection.fetchNextPage()} loading={collection.isFetchingNextPage} />
        ) : null}
      </PanelState>
    </PanelBody>
  );
};
