import type { Message } from '@open-rocket-chat/client-sdk';
import { format, isToday } from 'date-fns';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { fileIconOf } from '@/features/media/file-icon';
import { MessageBody } from '@/features/messages/message-body';
import { cn } from '@/lib/cn';
import { Avatar } from '@/ui/avatar';
import { Icons } from '@/ui/icon';

/**
 * Dates in these lists are read as "when, roughly" rather than to the minute,
 * so today shows a clock and everything else a date — the opposite of the
 * timeline, where the day is already established by a separator.
 */
const timestampOf = (iso: string): string => {
  const date = new Date(iso);
  return isToday(date) ? format(date, 'HH:mm') : format(date, 'd MMM');
};

/**
 * One message in a side panel.
 *
 * Deliberately not the timeline's `MessageItem`: that component carries hover
 * actions, reactions, editing and grouping, none of which belong in a 320px
 * column, and reusing it would drag all of them in.
 */
export const MessageRow = ({
  message,
  onClick,
  actions,
  footer,
  highlight,
}: {
  message: Message;
  /** Set when the row leads somewhere — a thread, mostly. */
  onClick?: () => void;
  /** Buttons revealed on hover, at the row's top-right. */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Terms to mark in the body, for the panel that put them there. */
  highlight?: readonly string[];
}) => {
  const { t } = useTranslation('messages');

  const only = message.files.length === 1 ? message.files[0] : undefined;
  const attachment =
    message.files.length === 0
      ? null
      : {
          icon: only ? Icons[fileIconOf(only.mimeType, only.name)] : null,
          label: only ? only.name : t('attachments', { count: message.files.length }),
        };

  const body = (
    <>
      <Avatar name={message.sender.displayName} src={message.sender.avatarUrl} size="sm" className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-semibold">{message.senderAlias || message.sender.displayName}</span>
          <span className="text-content-muted shrink-0 text-[11px] tabular-nums">{timestampOf(message.createdAt)}</span>
        </div>

        {message.encrypted ? (
          <p className="text-content-muted mt-0.5 flex items-center gap-1.5 text-sm italic">
            <Icons.private size={13} /> {t('encrypted')}
          </p>
        ) : message.text ? (
          // Clamped rather than scrolled: a wall of text in a side list is
          // navigation, and the full message is one click away in the room.
          <MessageBody text={message.text} highlight={highlight} className="mt-0.5 line-clamp-4 text-sm break-words" />
        ) : null}

        {attachment ? (
          <p className="text-content-muted mt-1 flex items-center gap-1.5 text-xs">
            {/* A single file names itself, so it gets the mark for its type;
                several are a count, which only the paperclip fits. */}
            {attachment.icon ? <attachment.icon size={13} /> : <Icons.attach size={13} />}
            <span className="truncate">{attachment.label}</span>
          </p>
        ) : null}

        {footer}
      </div>
    </>
  );

  return (
    <div className="group/row hover:bg-sunken relative transition-colors">
      {onClick ? (
        <button type="button" onClick={onClick} className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left">
          {body}
        </button>
      ) : (
        <div className="flex items-start gap-2.5 px-4 py-2.5">{body}</div>
      )}

      {actions ? (
        <div
          className={cn(
            'absolute top-1.5 right-2 flex items-center gap-0.5 opacity-0 transition-opacity',
            'group-hover/row:opacity-100 focus-within:opacity-100',
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
};

/** A small icon button sized for a row's hover actions. */
export const RowAction = ({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className={cn(
      'bg-panel border-line rounded-md border p-1 shadow-sm transition-colors',
      danger ? 'text-danger hover:bg-danger/10' : 'text-content-muted hover:text-content hover:bg-sunken',
    )}
  >
    {children}
  </button>
);
