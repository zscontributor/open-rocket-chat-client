import { useVirtualizer } from '@tanstack/react-virtual';
import { format } from 'date-fns';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Treated as "at the bottom", so an arriving message keeps the view pinned.
 *
 * The same figure decides whether "jump to recent" is offered, and deliberately
 * so: the button is there to say the timeline has stopped following the room,
 * and it would be a lie shown at any other distance than the one that stops it.
 */
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
  /**
   * The same fact as `stickToBottom`, in a form that can be rendered.
   *
   * It is held twice because the two readers need it at different moments: the
   * layout effect below has to know before paint, which a ref can answer and a
   * state update cannot, and the button has to be drawn, which is the opposite.
   */
  const [atBottom, setAtBottom] = useState(true);
  /** Row that opened the list at the previous commit, which is how a prepended page is spotted. */
  const previousFirstKey = useRef<string | null>(null);
  /** Scrollable height at the previous commit, which is how much that page added. */
  const previousHeight = useRef(0);

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

  // Another room opens at its newest message, and the anchors taken in the last
  // one describe content that is no longer on the screen. Declared first so a
  // room change is reset before the effect below reads any of it.
  useLayoutEffect(() => {
    stickToBottom.current = true;
    previousFirstKey.current = null;
    previousHeight.current = 0;
    setAtBottom(true);
  }, [roomId]);

  // Runs before paint, so an arriving message (stay pinned to the bottom) can
  // be told apart from a page of older ones being prepended (hold position).
  //
  // Rows growing from their estimate as they are measured is deliberately not
  // compensated for here. The virtualiser already moves the scroll position
  // when a row above the fold turns out taller than the guess, and correcting
  // it a second time dragged the viewport down by one row's error for every row
  // that came into view — scrolling up a little walked straight back to the
  // bottom, which is where the drift ends.
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;

    const firstKey = rows[0]?.key ?? null;

    if (stickToBottom.current) {
      element.scrollTop = element.scrollHeight;
    } else if (previousFirstKey.current !== null && firstKey !== previousFirstKey.current) {
      // The row that used to open the list has been pushed down, so a page
      // landed above the viewport: move by exactly what it added, and the
      // message under the cursor stays under the cursor.
      element.scrollTop += element.scrollHeight - previousHeight.current;
    }

    previousFirstKey.current = firstKey;
    previousHeight.current = element.scrollHeight;
  }, [rows, totalSize]);

  const onScroll = useCallback(() => {
    const element = viewport.current;
    if (!element) return;

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottom.current = distanceFromBottom < STICK_TO_BOTTOM_THRESHOLD;
    // Called for every frame of a scroll, so it is left to React to drop the
    // update when the answer has not actually changed — which is nearly always.
    setAtBottom(stickToBottom.current);

    if (element.scrollTop < LOAD_MORE_THRESHOLD && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  /**
   * Takes the timeline back to the newest message and leaves it following the
   * room again.
   *
   * The jump is instant rather than animated. A smooth scroll past thousands of
   * rows would have to measure every one of them on the way, and the virtualiser
   * suspends the corrections that keep the position honest while one is running
   * — so the pleasant version is also the one that lands somewhere else.
   *
   * `stickToBottom` is set here rather than left to the scroll event that this
   * causes, because a row can be measured in between, and the effect that reads
   * it would spend that frame holding the old position.
   */
  const jumpToRecent = useCallback(() => {
    const element = viewport.current;
    if (!element) return;

    stickToBottom.current = true;
    setAtBottom(true);
    element.scrollTop = element.scrollHeight;
  }, []);

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
    // The button floats over the timeline rather than sitting inside it: a
    // child of the scroller would add to its height, and every measurement
    // here is taken from that height.
    <div className="relative flex min-h-0 flex-1 flex-col">
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

      {!atBottom && rows.length > 0 ? (
        <Button
          size="sm"
          variant="primary"
          onClick={jumpToRecent}
          className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full pr-3.5 pl-3 shadow-lg"
        >
          <Icons.chevronDown size={16} />
          {t('jumpToRecent')}
        </Button>
      ) : null}
    </div>
  );
};
