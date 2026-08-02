import { useVirtualizer } from '@tanstack/react-virtual';
import { format } from 'date-fns';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useContextualBarStore } from '@/features/rooms/contextual-bar/store';
import { useRoom } from '@/features/rooms/use-rooms';
import {
  canDeleteMessage,
  canEditMessage,
  canPinMessage,
  canReact,
  canStarMessage,
  canUseThreads,
  groupingPeriodMs,
  useCapabilities,
} from '@/features/server/use-capabilities';
import { describeError } from '@/lib/errors';
import { Button } from '@/ui/button';
import { Icons, Spinner } from '@/ui/icon';
import { MessageItem, type MessageAbilities } from './message-item';
import { buildMessageRows, flaggedMessages, reactedMessages, type MessageRow } from './message-rows';
import { useDeleteMessage, useMessages, useSetMessageFlag, useToggleReaction } from './use-messages';

/**
 * Starting height for a row that has not been measured. It only affects the
 * scrollbar until the row reaches the viewport and is measured for real.
 */
const ESTIMATED_ROW_HEIGHT = 64;

/** Rows kept mounted beyond the viewport, so fast scrolling does not flash blank. */
const OVERSCAN = 8;

/** Distance from the top, in pixels, at which the next page is requested. */
const LOAD_MORE_THRESHOLD = 400;

/** Treated as "at the bottom", so an arriving message keeps the view pinned. */
const STICK_TO_BOTTOM_THRESHOLD = 80;

/**
 * The message timeline.
 *
 * Virtualised: a busy room holds tens of thousands of messages, and mounting
 * them all costs the first render and every render after it. Only rows near
 * the viewport exist in the DOM, and each is measured after mount because
 * message heights vary wildly — one line, a code block, a photo.
 */
export const MessageList = ({
  roomId,
  currentUserId,
  onOpenRoom,
}: {
  roomId: string;
  currentUserId: string;
  /** Handed to each sender's user card, which can start a direct room. */
  onOpenRoom: (roomId: string) => void;
}) => {
  const { t } = useTranslation('messages');
  const { t: tCommon } = useTranslation('common');

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(roomId);
  const react = useToggleReaction(roomId);
  const remove = useDeleteMessage(roomId);
  const setFlag = useSetMessageFlag(roomId);
  const openTab = useContextualBarStore((state) => state.open);

  const { data: capabilities } = useCapabilities();
  const { data: room } = useRoom(roomId);

  const viewport = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  /** Total content height at the previous render, for prepend compensation. */
  const previousTotal = useRef(0);

  const messages = useMemo(() => data?.messages ?? [], [data]);
  const grouping = groupingPeriodMs(capabilities);

  /**
   * Date separators are rows of their own, so they take part in measurement,
   * and the files of one upload share a row so they are drawn as one album.
   */
  const rows = useMemo(() => buildMessageRows(messages, grouping), [messages, grouping]);

  // Room-wide gates are the same for every message, so they are resolved once.
  const roomAbilities = useMemo(
    () => ({
      pin: canPinMessage(capabilities, room),
      star: canStarMessage(capabilities),
      react: canReact(capabilities, room),
      thread: canUseThreads(capabilities),
      showEditedStatus: capabilities?.settings.message.showEditedStatus ?? true,
    }),
    [capabilities, room],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewport.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
    // Keyed by row identity rather than index: prepending a page shifts every
    // index, and measurements cached against the old ones would be wrong.
    getItemKey: (index) => rows[index]?.key ?? index,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Runs before paint, so an arriving message (stay pinned to the bottom) can
  // be told apart from a page of older ones being prepended (hold position).
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;

    if (stickToBottom.current) {
      element.scrollTop = element.scrollHeight;
    } else if (previousTotal.current && totalSize > previousTotal.current) {
      // Content grew above the viewport, so the scroll position moves by the
      // same amount and the message under the cursor stays under the cursor.
      element.scrollTop += totalSize - previousTotal.current;
    }

    previousTotal.current = totalSize;
  }, [totalSize]);

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

  /**
   * A row of the timeline, and the actions it offers.
   *
   * An album is one thing on the screen, so it is one thing to act on: what
   * only makes sense once — a reaction, a pin, a thread — is aimed at the
   * message that opens the run, and undoing it clears it wherever it landed.
   * Deleting is the exception: taking back part of an upload and leaving the
   * rest behind is never what was meant.
   */
  const renderMessage = (row: Extract<MessageRow, { kind: 'message' }>) => {
    const anchor = row.messages[0];

    return (
      <MessageItem
        messages={row.messages}
        showHeader={row.showHeader}
        isOwn={anchor.sender.id === currentUserId}
        abilities={
          {
            ...roomAbilities,
            // These two depend on the message: who wrote it, and how long ago
            // it was posted.
            edit: canEditMessage(capabilities, anchor, room, currentUserId),
            delete: row.messages.every((message) => canDeleteMessage(capabilities, message, room, currentUserId)),
          } satisfies MessageAbilities
        }
        onReact={(emoji, reacted) => {
          const targets = reacted ? [anchor] : reactedMessages(row.messages, emoji);
          targets.forEach((message) => react.mutate({ messageId: message.id, emoji, reacted }));
        }}
        onDelete={() => row.messages.forEach((message) => remove.mutate(message.id))}
        onPin={(pinned) => {
          const targets = pinned ? [anchor] : flaggedMessages(row.messages, 'pinned');
          targets.forEach((message) => setFlag.mutate({ messageId: message.id, flag: 'pinned', value: pinned }));
        }}
        onStar={(starred) => {
          const targets = starred ? [anchor] : flaggedMessages(row.messages, 'starred');
          targets.forEach((message) => setFlag.mutate({ messageId: message.id, flag: 'starred', value: starred }));
        }}
        onOpenThread={() => openTab({ id: 'thread', messageId: anchor.threadId ?? anchor.id })}
        onOpenRoom={onOpenRoom}
      />
    );
  };

  if (isLoading) {
    return (
      <div className="text-content-muted flex flex-1 items-center justify-center gap-2 text-sm">
        <Spinner className="size-4" /> {t('loading')}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Icons.error size={28} className="text-danger" />
        <p className="text-sm">{describeError(error)}</p>
      </div>
    );
  }

  return (
    <div ref={viewport} className="scrollbar-slim bg-app flex-1 overflow-y-auto">
      {isFetchingNextPage ? (
        <div className="text-content-muted flex items-center justify-center gap-2 py-3 text-xs">
          <Spinner className="size-3" /> {t('loadingOlder')}
        </div>
      ) : null}

      {data?.gapBefore ? (
        <div className="border-line bg-raised m-4 rounded-lg border p-3 text-xs">
          <p className="font-medium">{t('gap.title')}</p>
          <p className="text-content-muted mt-1">{t('gap.detail')}</p>
          <Button size="sm" className="mt-2" onClick={() => window.location.reload()}>
            {tCommon('action.reload')}
          </Button>
        </div>
      ) : null}

      {!hasNextPage && rows.length > 0 ? (
        <p className="text-content-muted px-4 py-6 text-center text-xs">{t('beginning')}</p>
      ) : null}

      {rows.length === 0 ? <p className="text-content-muted p-8 text-center text-sm">{t('empty')}</p> : null}

      {/* Full-height spacer with rows positioned inside it — what lets the
          browser scroll a list it has not actually rendered. */}
      <div className="relative w-full" style={{ height: totalSize }}>
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              // Measured after mount: a photo or a code block is many times the
              // height of a one-line message, and estimating would misplace
              // everything below it.
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {row.kind === 'date' ? (
                <div className="flex items-center gap-2 px-4 py-2">
                  <span className="bg-line h-px flex-1" />
                  <span className="bg-raised text-content-muted rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                    {format(new Date(row.at), 'EEEE, d MMMM yyyy')}
                  </span>
                  <span className="bg-line h-px flex-1" />
                </div>
              ) : (
                renderMessage(row)
              )}
            </div>
          );
        })}
      </div>

      <div className="h-4" />
    </div>
  );
};
