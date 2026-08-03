import type { Message } from '@open-rocket-chat/client-sdk';
import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fileIconOf } from '@/features/media/file-icon';
import { isPreviewable, mediaKindOf, useMediaStore, type MediaItem } from '@/features/media/media';
import { UserCard } from '@/features/rooms/user-card';
import { useClient } from '@/features/servers/server-scope';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { useUiStore } from '@/stores/ui-store';
import { Avatar } from '@/ui/avatar';
import { Icons } from '@/ui/icon';
import { isBareBlock } from './body-shape';
import { EmojiPicker } from './emoji-picker';
import { EmojiText } from './emoji-text';
import { ForwardDialog } from './forward-dialog';
import { MessageBody } from './message-body';
import { mergeReactions } from './message-rows';
import { PinnedQuote } from './pinned-quote';
import { isPinnedQuoteEncrypted, pinnedQuoteOf, systemMessageLabel } from './system-message';

/**
 * What the server lets this user do to this message, resolved once by the list
 * rather than per item — the checks need the room, the caller's roles and the
 * server settings, none of which belong in a presentational component.
 */
export interface MessageAbilities {
  edit: boolean;
  delete: boolean;
  pin: boolean;
  star: boolean;
  react: boolean;
  thread: boolean;
  /** `Message_ShowEditedStatus`; some servers hide the marker entirely. */
  showEditedStatus: boolean;
}

export interface MessageItemProps {
  /**
   * The message, or — when one upload posted several — the run of them shown as
   * a single album. The first is the anchor: its author, time and text are the
   * row's, and it is what every action the album offers is aimed at.
   */
  messages: [Message, ...Message[]];
  /** False when this message continues a run from the same author. */
  showHeader: boolean;
  isOwn: boolean;
  abilities: MessageAbilities;
  onReact: (emoji: string, reacted: boolean) => void;
  onDelete: () => void;
  onPin: (pinned: boolean) => void;
  onStar: (starred: boolean) => void;
  onOpenThread: () => void;
  /** Lets the sender's card start a direct conversation with them. */
  onOpenRoom: (roomId: string) => void;
}

/**
 * How many columns an album of previews is laid out in.
 *
 * Two and four go in pairs, everything else in threes — the shapes that leave
 * the fewest half-empty rows at the bottom of the grid.
 */
const gridColumns = (count: number): string => {
  if (count === 2 || count === 4) return 'grid-cols-2';
  return 'grid-cols-3';
};

const ActionButton = ({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    // Square, unrounded and the toolbar's full height, so the hover fill reads
    // as one segment of the toolbar rather than a chip floating inside it. The
    // toolbar clips the row, which rounds the two end buttons for free.
    className={cn(
      'flex h-8 w-8 items-center justify-center transition-colors',
      danger ? 'text-danger hover:bg-danger/10' : 'text-content-muted hover:bg-sunken hover:text-content',
    )}
  >
    {children}
  </button>
);

export const MessageItem = ({
  messages,
  showHeader,
  isOwn,
  abilities,
  onReact,
  onDelete,
  onPin,
  onStar,
  onOpenThread,
  onOpenRoom,
}: MessageItemProps) => {
  const { t } = useTranslation('messages');
  const client = useClient();
  const message = messages[0];
  const startEditing = useUiStore((state) => state.startEditingMessage);
  const isEditing = useUiStore((state) => state.editingMessage?.messageId === message.id);
  const openViewer = useMediaStore((state) => state.open);
  // The toolbar is hover-only, but the emoji picker anchors to a button inside
  // it. Hiding it while the picker is open would strip the popover of its
  // anchor, so pin it open for as long as the picker is.
  const [pickerOpen, setPickerOpen] = useState(false);
  // Mounted only while it is open: the dialog asks for the room list, and a
  // timeline of a hundred rows should not ask a hundred times over.
  const [forwarding, setForwarding] = useState(false);
  // A copy leaves no trace on the page, so the button reports its own success
  // for a moment. There is no toast surface in the client to defer this to.
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  /** Every attachment on this row, so the lightbox can page through them. */
  const mediaItems: MediaItem[] = useMemo(
    () =>
      messages.flatMap((entry) =>
        entry.files.map((file) => ({
          id: file.id,
          url: client.mediaUrl(file.url),
          thumbnailUrl: file.thumbnailUrl ? client.mediaUrl(file.thumbnailUrl) : null,
          name: file.name,
          mimeType: file.mimeType,
          kind: mediaKindOf(file.mimeType, file.name),
          sizeBytes: file.size,
        })),
      ),
    [client, messages],
  );

  // Images and video are laid out as a grid of square crops; documents get a
  // grid of their own, of cards rather than crops — a file with no picture of
  // itself has only its mark, its name and its size to show.
  const previews = useMemo(() => mediaItems.filter(isPreviewable), [mediaItems]);
  const documents = useMemo(() => mediaItems.filter((item) => !isPreviewable(item)), [mediaItems]);
  const asGrid = previews.length > 1;
  const asFileGrid = documents.length > 1;

  const reactions = useMemo(() => mergeReactions(messages), [messages]);
  // One album, one marker: the flag may sit on any of the files it holds.
  const pinned = messages.some((entry) => entry.pinned);
  const starred = messages.some((entry) => entry.starred);

  if (message.kind === 'system') {
    const label = systemMessageLabel(message, t);
    // A pin is the one event whose subject the reader cannot infer from the
    // sentence, so it brings the message it was raised for with it.
    const quote = pinnedQuoteOf(message);

    return (
      <div className="px-4 py-1">
        <div className="text-content-muted flex items-center gap-2 text-xs">
          <span className="bg-line h-px flex-1" />
          <span>{label}</span>
          <time dateTime={message.createdAt}>{format(new Date(message.createdAt), 'HH:mm')}</time>
          <span className="bg-line h-px flex-1" />
        </div>

        {quote ? <PinnedQuote quote={quote} encrypted={isPinnedQuoteEncrypted(message)} /> : null}
      </div>
    );
  }

  // A bubble with nothing in it would be an empty box floating next to the
  // attachment it was meant to caption.
  const hasBody = message.encrypted || message.text.trim().length > 0;

  // A message that is only a quote or only a code block is drawn by that block
  // alone — the bubble around it would be a frame around a frame.
  const bareBlock = !message.encrypted && isBareBlock(message.text);

  // Nothing to put on the clipboard for an attachment-only message, and an
  // encrypted one holds ciphertext the client has not opened — copying that
  // would hand the user a blob of base64 where they expected their sentence.
  const canCopy = !message.encrypted && message.text.trim().length > 0;

  // An end-to-end encrypted message is ciphertext this client never opened, and
  // the room it would be forwarded to holds a different key — the quote would
  // arrive as a blob of base64 nobody there can read.
  const canForward = !message.encrypted;

  return (
    <article
      className={cn(
        'group/message relative px-4 transition-colors',
        // The gap that holds the hover toolbar is padding on the *bottom* of
        // the message it belongs to, never padding on the top of the next one.
        // The list positions every row with a transform, which makes each row
        // its own stacking context: a toolbar overflowing into the row below is
        // painted under it and, worse, the next row's padding swallows the
        // pointer — so the toolbar would vanish the moment you reached for it.
        // Kept inside its own row, it stays hoverable.
        'pb-10',
        showHeader ? 'pt-3' : 'pt-0.5',
        // The text is being edited down in the message box; mark which message
        // that box is pointed at.
        isEditing && 'bg-accent-subtle ring-accent ring-inset',
      )}
    >
      {/* Own messages run down the right-hand side, everyone else's down the
          left — which side a message sits on is the fastest way to read who
          said it, so your own need no avatar to repeat it. */}
      <div className={cn('flex gap-3', isOwn && 'flex-row-reverse')}>
        {/* Fixed-width gutter on both sides: it holds the avatar, and it keeps
            every message in a run aligned whether or not one is drawn. */}
        <div className="w-9 shrink-0">
          {!isOwn && showHeader ? (
            <UserCard userId={message.sender.id} name={message.sender.displayName} onOpenRoom={onOpenRoom}>
              <Avatar name={message.sender.displayName} src={message.sender.avatarUrl} />
            </UserCard>
          ) : !showHeader ? (
            // Grouped messages drop the header, so the timestamp moves here and
            // appears on hover instead of repeating above every line.
            <time
              dateTime={message.createdAt}
              className={cn(
                'text-content-muted block pt-1.5 text-[10px] opacity-0 group-hover/message:opacity-100',
                isOwn ? 'text-left' : 'text-right',
              )}
            >
              {format(new Date(message.createdAt), 'HH:mm')}
            </time>
          ) : null}
        </div>

        {/* `relative` so the hover toolbar anchors to the bubble column rather
            than to the full width of the row. */}
        <div className={cn('relative flex min-w-0 max-w-[78%] flex-col pb-1', isOwn ? 'items-end' : 'items-start')}>
          {showHeader ? (
            <div className={cn('mb-1 flex items-baseline gap-2 px-1', isOwn && 'flex-row-reverse')}>
              {/* Naming yourself on your own messages is noise — the side they
                  sit on already says it. */}
              {isOwn ? null : (
                <span className="text-sm font-semibold">{message.senderAlias ?? message.sender.displayName}</span>
              )}
              <time dateTime={message.createdAt} className="text-content-muted text-[11px]">
                {format(new Date(message.createdAt), 'HH:mm')}
              </time>
              {pinned ? <Icons.pin size={12} className="text-content-muted" /> : null}
              {starred ? <Icons.star size={12} weight="fill" className="text-warning" /> : null}
            </div>
          ) : null}

          {hasBody ? (
            <div
              className={cn(
                'min-w-0 text-sm leading-relaxed break-words',
                // A quote or a code block brings its own frame, so the bubble
                // steps out of the way rather than drawing a second one around
                // it. Its padding goes too: kept, it would only inset the block
                // from a border that is no longer there.
                bareBlock
                  ? '[&_blockquote]:my-0 [&_pre]:my-0'
                  : cn(
                      'rounded-2xl border px-3 py-2',
                      isOwn ? 'bg-highlight border-accent/40 rounded-br-md' : 'bg-raised border-line rounded-bl-md',
                    ),
              )}
            >
              {message.encrypted ? (
                <p className="text-content-muted italic">{t('encrypted')}</p>
              ) : (
                <MessageBody
                  text={message.text}
                  mentions={message.mentions}
                  channels={message.channels}
                  onOpenRoom={onOpenRoom}
                />
              )}
              {message.editedAt && abilities.showEditedStatus ? (
                <span className="text-content-muted ml-1 text-[10px]">({t('edited')})</span>
              ) : null}
            </div>
          ) : null}

          {previews.length > 0 ? (
            // One picture keeps its own shape — cropping a lone photo to a
            // square loses the thing that was worth sending. Several become a
            // grid instead, because a run of full-height previews pushes the
            // rest of the conversation off the screen.
            //
            // `min-w-0` so a wide image is capped by the column rather than
            // widening it past the side it is aligned to.
            <ul
              aria-label={asGrid ? t('attachments', { count: mediaItems.length }) : undefined}
              className={cn(
                'mt-2 min-w-0',
                asGrid
                  ? // A fixed track width rather than the column's own: the tiles
                    // are square, so letting a wide grid stretch would blow the
                    // row up to the full height of the timeline.
                    cn('grid w-80 max-w-full gap-0.5 overflow-hidden rounded-xl', gridColumns(previews.length))
                  : cn('flex flex-wrap gap-2', isOwn && 'justify-end'),
              )}
            >
              {previews.map((item) => (
                <li key={item.id} className="min-w-0">
                  <button
                    type="button"
                    aria-label={item.name}
                    // The whole row is handed to the viewer, not just the
                    // previews, so its arrow keys walk the album in the order
                    // it was uploaded.
                    onClick={() => openViewer(mediaItems, mediaItems.indexOf(item))}
                    className={cn(
                      'block cursor-zoom-in overflow-hidden',
                      asGrid
                        ? 'bg-sunken relative aspect-square w-full'
                        : 'border-line max-h-72 max-w-full rounded-lg border',
                    )}
                  >
                    {item.kind === 'image' ? (
                      // The timeline only ever shows the preview; the
                      // original is fetched when the lightbox opens it.
                      <img
                        src={item.thumbnailUrl ?? item.url}
                        alt={item.name}
                        loading="lazy"
                        className={cn(asGrid ? 'h-full w-full object-cover' : 'max-h-72 max-w-full object-contain')}
                      />
                    ) : (
                      <span className="relative block h-full">
                        <video
                          src={item.url}
                          muted
                          preload="metadata"
                          className={cn(asGrid ? 'h-full w-full object-cover' : 'max-h-72 max-w-full')}
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                          <Icons.expand size={asGrid ? 22 : 28} />
                        </span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {documents.length > 0 ? (
            // One upload of several documents is one action by the user, so the
            // files it produced are drawn as one album — the same treatment
            // photos already get, on the same fixed track so a message carrying
            // both lines its two grids up.
            //
            // A lone file keeps the full-width row: it has the space for its
            // name, and a half-width card would only strand it beside a gap.
            <ul
              aria-label={asFileGrid ? t('attachments', { count: documents.length }) : undefined}
              className={cn(
                'mt-2 min-w-0',
                asFileGrid
                  ? 'grid w-80 max-w-full grid-cols-2 gap-1.5'
                  : cn('flex flex-col gap-2', isOwn && 'items-end'),
              )}
            >
              {documents.map((item) => {
                // The mark for the file's own type: a row of identical sheets
                // says nothing about which attachment is the spreadsheet.
                const Icon = Icons[fileIconOf(item.mimeType, item.name)];

                return (
                  <li key={item.id} className="min-w-0">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      // `title` because a name clipped by the tile is the one
                      // thing a card of a nameless file cannot afford to lose.
                      title={item.name}
                      className={cn(
                        'border-line bg-app hover:bg-sunken rounded-lg border transition-colors',
                        asFileGrid
                          ? // `h-full` so a one-line name and a two-line one
                            // still square off against each other in the row.
                            'flex h-full flex-col gap-1.5 p-2.5'
                          : 'flex items-center gap-2.5 px-3 py-2',
                      )}
                    >
                      <span className={cn('text-content-muted', asFileGrid && 'flex items-center justify-between')}>
                        <Icon size={20} />
                        {asFileGrid ? <Icons.download size={14} /> : null}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={cn(
                            'block text-xs font-medium',
                            // Names run long and rarely break at a space, so in
                            // a card they wrap mid-word over two lines rather
                            // than being cut off after the first few letters.
                            asFileGrid ? 'line-clamp-2 break-all' : 'truncate',
                          )}
                        >
                          {item.name}
                        </span>
                        {item.sizeBytes ? (
                          <span className="text-content-muted block text-[11px]">{formatBytes(item.sizeBytes)}</span>
                        ) : null}
                      </span>
                      {asFileGrid ? null : (
                        <span className="text-content-muted ml-2">
                          <Icons.download size={16} />
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {reactions.length > 0 ? (
            <div className={cn('mt-1.5 flex flex-wrap items-center gap-1', isOwn && 'justify-end')}>
              {reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  type="button"
                  disabled={!abilities.react}
                  onClick={() => onReact(reaction.emoji, !reaction.reactedByMe)}
                  title={t('reaction.reactedBy', { names: reaction.usernames.join(', ') })}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                    reaction.reactedByMe
                      ? 'border-accent bg-accent-subtle text-accent'
                      : 'border-line text-content-muted hover:bg-sunken',
                  )}
                >
                  <EmojiText shortcode={reaction.emoji} />
                  <span className="tabular-nums">{reaction.count}</span>
                </button>
              ))}

              {abilities.react ? (
                <EmojiPicker
                  onSelect={(shortcode) => onReact(`:${shortcode}:`, true)}
                  trigger={
                    <button
                      type="button"
                      aria-label={t('action.addReaction')}
                      className="border-line text-content-muted hover:bg-sunken flex items-center rounded-full border px-2 py-1 transition-colors"
                    >
                      <Icons.emoji size={14} />
                    </button>
                  }
                />
              ) : null}
            </div>
          ) : null}

          {message.threadCount > 0 ? (
            <button
              type="button"
              onClick={onOpenThread}
              className="text-accent mt-1.5 flex items-center gap-1.5 text-xs font-medium hover:underline"
            >
              <Icons.threads size={14} />
              {t('thread.replies', { count: message.threadCount })}
            </button>
          ) : null}

          {/* Tucked into the gap directly below the bubble and flush with the
              bubble's outer edge, so it reads as belonging to this message and
              never reaches across the timeline to hang over somebody else's.

              It anchors on the side the message sits on and grows toward the
              middle of the timeline: the column is only as wide as its bubble,
              so anchoring the far edge would send the toolbar off the side of
              the room whenever the message is shorter than the toolbar.

              `top-full` starts the hover target at the bubble's own bottom
              edge and the padding supplies the visual offset from the inside,
              so the pointer crosses no gap belonging to neither on its way
              down — the whole path stays within the message. */}
          <div
            className={cn(
              'absolute top-full z-10 pt-1',
              isOwn ? 'right-0' : 'left-0',
              pickerOpen ? 'block' : 'hidden group-hover/message:block',
            )}
          >
            <div className="bg-panel border-line flex items-center overflow-hidden rounded-lg border shadow-md">
              {abilities.react ? (
                <EmojiPicker
                  align={isOwn ? 'end' : 'start'}
                  onOpenChange={setPickerOpen}
                  onSelect={(shortcode) => onReact(`:${shortcode}:`, true)}
                  trigger={
                    <button
                      type="button"
                      aria-label={t('action.addReaction')}
                      title={t('action.addReaction')}
                      className="text-content-muted hover:bg-sunken hover:text-content flex h-8 w-8 items-center justify-center transition-colors"
                    >
                      <Icons.emoji size={16} />
                    </button>
                  }
                />
              ) : null}

              {abilities.thread ? (
                <ActionButton label={t('action.replyInThread')} onClick={onOpenThread}>
                  <Icons.threads size={16} />
                </ActionButton>
              ) : null}

              {canForward ? (
                <ActionButton label={t('action.forward')} onClick={() => setForwarding(true)}>
                  <Icons.forward size={16} />
                </ActionButton>
              ) : null}

              {abilities.star ? (
                <ActionButton label={starred ? t('action.unstar') : t('action.star')} onClick={() => onStar(!starred)}>
                  <Icons.star size={16} weight={starred ? 'fill' : 'light'} />
                </ActionButton>
              ) : null}

              {abilities.pin ? (
                <ActionButton label={pinned ? t('action.unpin') : t('action.pin')} onClick={() => onPin(!pinned)}>
                  <Icons.pin size={16} weight={pinned ? 'fill' : 'light'} />
                </ActionButton>
              ) : null}

              {canCopy ? (
                <ActionButton
                  label={copied ? t('action.copied') : t('action.copy')}
                  onClick={() => {
                    void copyText(message.text).then((ok) => ok && setCopied(true));
                  }}
                >
                  {copied ? <Icons.success size={16} className="text-accent" /> : <Icons.copy size={16} />}
                </ActionButton>
              ) : null}

              {abilities.edit ? (
                <ActionButton
                  label={t('action.edit')}
                  onClick={() =>
                    startEditing({ roomId: message.roomId, messageId: message.id, originalText: message.text })
                  }
                >
                  <Icons.edit size={16} />
                </ActionButton>
              ) : null}

              {abilities.delete ? (
                <ActionButton label={t('action.delete')} danger onClick={onDelete}>
                  <Icons.delete size={16} />
                </ActionButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {forwarding ? <ForwardDialog messages={messages} onClose={() => setForwarding(false)} /> : null}
    </article>
  );
};
