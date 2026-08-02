import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { AttachmentDropZone } from '@/features/messages/attachment-drop-zone';
import { Composer } from '@/features/messages/composer';
import { MessageBody } from '@/features/messages/message-body';
import { useThreadMessages } from '@/features/messages/use-messages';
import { canPostToRoom, useCapabilities } from '@/features/server/use-capabilities';
import { cn } from '@/lib/cn';
import { Avatar } from '@/ui/avatar';
import { Icons, Spinner } from '@/ui/icon';
import { UserCard } from '../../user-card';
import { useRoom } from '../../use-rooms';
import { PanelBody, PanelState } from '../panel';

/** Distance from the top, in pixels, at which the next page is requested. */
const LOAD_MORE_THRESHOLD = 200;

/** Treated as "at the bottom", so an arriving reply keeps the view pinned. */
const STICK_TO_BOTTOM_THRESHOLD = 80;

/**
 * One thread, with its own message box.
 *
 * The pane is its own drop target: a file dropped here belongs to the thread,
 * not to the timeline behind it. Replies are read from a query of their own
 * rather than filtered out of the room's cache — a thread's replies are not in
 * the main timeline at all, so anything that cache had not loaded was simply
 * missing from the pane.
 *
 * Not virtualised, unlike the timeline: a thread is bounded by what one
 * conversation produced, and paging back through it a screenful at a time keeps
 * the mounted count near what is on screen anyway.
 */
export const ThreadPanel = ({
  roomId,
  threadId,
  onOpenRoom,
}: {
  roomId: string;
  threadId: string;
  onOpenRoom: (roomId: string) => void;
}) => {
  const { t } = useTranslation('messages');
  const { data: capabilities } = useCapabilities();
  const { data: room } = useRoom(roomId);
  const canPost = canPostToRoom(capabilities, room);

  const { data, isPending, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useThreadMessages(
    roomId,
    threadId,
  );

  const viewport = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  /** Content height at the previous render, for prepend compensation. */
  const previousHeight = useRef(0);

  // Memoised so the layout effect below runs on an actual change: a fresh empty
  // array on every render would re-pin the scroll position continuously.
  const messages = useMemo(() => data?.messages ?? [], [data]);

  // Before paint, so an arriving reply (stay pinned to the bottom) can be told
  // apart from a page of older ones being prepended (hold position).
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;

    if (stickToBottom.current) {
      element.scrollTop = element.scrollHeight;
    } else if (previousHeight.current && element.scrollHeight > previousHeight.current) {
      // Content grew above the viewport, so the scroll position moves by the
      // same amount and the reply under the cursor stays under the cursor.
      element.scrollTop += element.scrollHeight - previousHeight.current;
    }

    previousHeight.current = element.scrollHeight;
  }, [messages]);

  const onScroll = useCallback(() => {
    const element = viewport.current;
    if (!element) return;

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottom.current = distanceFromBottom < STICK_TO_BOTTOM_THRESHOLD;

    if (element.scrollTop < LOAD_MORE_THRESHOLD && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;

    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  return (
    <AttachmentDropZone
      roomId={roomId}
      threadId={threadId}
      disabled={!canPost}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <PanelBody ref={viewport} className="py-2">
        <PanelState
          loading={isPending}
          error={error}
          empty={messages.length === 0}
          emptyIcon={<Icons.threads size={32} />}
          emptyLabel={t('thread.empty')}
        >
          {isFetchingNextPage ? (
            <p className="text-content-muted flex items-center justify-center gap-2 py-3 text-xs">
              <Spinner className="size-3" /> {t('loadingOlder')}
            </p>
          ) : null}

          {messages.map((message) => (
            <article
              key={message.id}
              className={cn(
                'flex items-start gap-2.5 px-4 py-1.5',
                // The parent is what the thread hangs off rather than a reply to
                // it, so it is set apart from the run that answers it.
                message.id === threadId && 'border-line mb-1 border-b pb-2.5',
              )}
            >
              {/* The pane hugs the right edge, so cards open to its left. */}
              <UserCard
                userId={message.sender.id}
                name={message.sender.displayName}
                onOpenRoom={onOpenRoom}
                side="left"
                className="mt-0.5 shrink-0"
              >
                <Avatar name={message.sender.displayName} src={message.sender.avatarUrl} size="sm" />
              </UserCard>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{message.senderAlias || message.sender.displayName}</p>
                <MessageBody
                  text={message.text}
                  mentions={message.mentions}
                  channels={message.channels}
                  onOpenRoom={onOpenRoom}
                  className="text-sm break-words"
                />
              </div>
            </article>
          ))}
        </PanelState>
      </PanelBody>

      <Composer roomId={roomId} threadId={threadId} placeholder={t('thread.title')} disabled={!canPost} />
    </AttachmentDropZone>
  );
};
