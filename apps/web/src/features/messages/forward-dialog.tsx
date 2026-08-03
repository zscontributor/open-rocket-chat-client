import type { Message, RoomSummary } from '@open-rocket-chat/client-sdk';
import * as Dialog from '@radix-ui/react-dialog';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRooms } from '@/features/rooms/use-rooms';
import { canPostToRoom, canUpload, useCapabilities } from '@/features/server/use-capabilities';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';
import { showToast } from '@/stores/toast-store';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { Icons, Spinner } from '@/ui/icon';
import { Input } from '@/ui/input';
import { forwardedFiles, forwardedText } from './forward';
import { MessageBody } from './message-body';
import { useForwardMessage } from './use-forward-message';

/**
 * The stamp above the quote.
 *
 * Longer than the `HH:mm` the timeline prints beside a message: a forward
 * usually crosses a day, and the room it lands in has no date separator
 * overhead to read the rest of the date from.
 */
const ATTRIBUTION_FORMAT = 'd MMM yyyy, HH:mm';

const RoomRow = ({ room, selected, onToggle }: { room: RoomSummary; selected: boolean; onToggle: () => void }) => {
  const peer = room.directMembers[0];

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className="hover:bg-sunken flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
    >
      {room.type === 'direct' ? (
        <Avatar name={room.displayName} src={peer?.avatarUrl} size="xs" status={peer?.status ?? null} />
      ) : room.avatarUrl ? (
        <Avatar name={room.displayName} src={room.avatarUrl} size="xs" />
      ) : (
        <span className="text-content-muted">
          {room.type === 'channel' ? <Icons.channel size={16} /> : <Icons.private size={16} />}
        </span>
      )}

      <span className="min-w-0 flex-1 truncate text-sm">{room.displayName}</span>

      {selected ? (
        <Icons.success size={16} className="text-accent shrink-0" />
      ) : (
        <Icons.add size={16} className="text-content-muted shrink-0" />
      )}
    </button>
  );
};

/**
 * Sends somebody else's message on to other rooms.
 *
 * Several rooms at once, because that is what forwarding is usually for, and
 * because doing it one room at a time would mean reopening this dialog from a
 * timeline the user has since scrolled away from.
 *
 * Targets are limited to rooms the user may actually post to — an archived or
 * read-only room in the list is a rejection waiting to happen — and, when the
 * message carries uploads, to rooms that accept those too.
 */
export const ForwardDialog = ({ messages, onClose }: { messages: [Message, ...Message[]]; onClose: () => void }) => {
  const { t } = useTranslation('messages');
  const { t: tCommon } = useTranslation('common');

  const { data: capabilities } = useCapabilities();
  const { data: rooms, isPending, isError } = useRooms(true);
  const forward = useForwardMessage();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState('');

  const message = messages[0];
  const files = useMemo(() => forwardedFiles(messages), [messages]);

  // The alias, when a bot posted under one, exactly as the timeline shows it —
  // the quote should name whoever the reader saw.
  const author = message.senderAlias ?? message.sender.displayName;

  const targets = useMemo(
    () =>
      (rooms ?? []).filter(
        (room) => canPostToRoom(capabilities, room) && (files.length === 0 || canUpload(capabilities, room)),
      ),
    [capabilities, files.length, rooms],
  );

  const term = query.trim().toLowerCase();
  const matches = term ? targets.filter((room) => room.displayName.toLowerCase().includes(term)) : targets;

  const toggle = (roomId: string) =>
    setSelected((current) =>
      current.includes(roomId) ? current.filter((entry) => entry !== roomId) : [...current, roomId],
    );

  const submit = () => {
    const text = forwardedText(
      { author, postedAt: format(new Date(message.createdAt), ATTRIBUTION_FORMAT) },
      message.text,
      comment,
    );

    forward.mutate(
      { roomIds: selected, text, files },
      {
        onSuccess: (result) => {
          if (result.failures.length === 0) {
            showToast({ tone: 'success', message: t('forward.sent', { count: result.deliveredRoomIds.length }) });
            onClose();
            return;
          }

          // Narrow the selection to what did not land, so the button retries
          // exactly the rooms the message is still missing from.
          setSelected(result.failures.map((failure) => failure.roomId));
        },
      },
    );
  };

  const failedNames = (forward.data?.failures ?? [])
    .map((failure) => rooms?.find((room) => room.id === failure.roomId)?.displayName)
    .filter((name): name is string => Boolean(name));

  return (
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-overlay fixed inset-0 z-40" />
        <Dialog.Content className="bg-panel border-line fixed top-1/2 left-1/2 z-50 flex max-h-[min(40rem,calc(100vh-2rem))] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border p-5 shadow-lg">
          <Dialog.Title className="text-base font-semibold">{t('forward.title')}</Dialog.Title>
          <Dialog.Description className="text-content-muted mt-1.5 text-sm">{t('forward.detail')}</Dialog.Description>

          {/* What is being forwarded, drawn the way the room it lands in will
              draw it — the quote is the message, not a summary of it. */}
          <blockquote className="bg-raised border-line border-l-accent mt-4 max-h-32 shrink-0 overflow-y-auto rounded-lg border border-l-2 px-3 py-2">
            <div className="flex items-center gap-2">
              <Avatar name={author} src={message.sender.avatarUrl} size="xs" />
              <span className="min-w-0 truncate text-xs font-semibold">{author}</span>
              <time dateTime={message.createdAt} className="text-content-muted shrink-0 text-[10px] tabular-nums">
                {format(new Date(message.createdAt), ATTRIBUTION_FORMAT)}
              </time>
            </div>

            {message.text.trim() ? <MessageBody text={message.text} className="mt-1 text-sm break-words" /> : null}

            {files.length > 0 ? (
              <p className="text-content-muted mt-1 flex items-center gap-1.5 text-xs">
                <Icons.attach size={13} /> {t('attachments', { count: files.length })}
              </p>
            ) : null}
          </blockquote>

          <div className="mt-3 shrink-0">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('forward.searchPlaceholder')}
              aria-label={t('forward.search')}
            />
          </div>

          <div className="border-line mt-2 min-h-32 flex-1 overflow-y-auto rounded-lg border">
            {isPending ? (
              <p className="text-content-muted flex items-center justify-center gap-2 py-8 text-sm">
                <Spinner className="size-4" />
              </p>
            ) : isError ? (
              <p className="text-content-muted px-3 py-8 text-center text-sm">{t('forward.roomsFailed')}</p>
            ) : matches.length === 0 ? (
              <p className="text-content-muted px-3 py-8 text-center text-sm">
                {term ? t('forward.noMatches', { query: query.trim() }) : t('forward.noRooms')}
              </p>
            ) : (
              <ul aria-label={t('forward.rooms')}>
                {matches.map((room) => (
                  <li key={room.id}>
                    <RoomRow room={room} selected={selected.includes(room.id)} onToggle={() => toggle(room.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 shrink-0">
            <Input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t('forward.commentPlaceholder')}
              aria-label={t('forward.comment')}
            />
          </div>

          {/* A failure the whole forward died on — the file could not be read
              back, say — as opposed to the per-room list below it. */}
          {forward.error ? <p className="text-danger mt-3 text-sm">{describeError(forward.error)}</p> : null}

          {failedNames.length > 0 ? (
            <p className="text-danger mt-3 text-sm">{t('forward.failed', { rooms: failedNames.join(', ') })}</p>
          ) : null}

          <div className="mt-5 flex shrink-0 items-center justify-end gap-2">
            <span className={cn('text-content-muted mr-auto text-xs', selected.length === 0 && 'invisible')}>
              {t('forward.selected', { count: selected.length })}
            </span>

            <Dialog.Close asChild>
              <Button size="sm">{tCommon('action.cancel')}</Button>
            </Dialog.Close>
            <Button size="sm" variant="primary" disabled={selected.length === 0 || forward.isPending} onClick={submit}>
              {forward.isPending ? <Spinner className="size-4" /> : t('forward.submit')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
