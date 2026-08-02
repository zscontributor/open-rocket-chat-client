import type { Attachment } from '@open-rocket-chat/client-sdk';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/ui/avatar';
import { Icons } from '@/ui/icon';
import { MessageBody } from './message-body';

/**
 * The message quoted on a "pinned a message" event.
 *
 * Rocket.Chat prints the pinned message under the event rather than leaving the
 * reader to open the pinned list to find out what was pinned, and this is that
 * block. It is a copy taken at the moment of the pin, so nothing here is live:
 * no reactions, no thread, no hover actions, and no route back to the original
 * — the event does not carry its id.
 */
export const PinnedQuote = ({ quote, encrypted }: { quote: Attachment; encrypted: boolean }) => {
  const { t } = useTranslation('messages');

  const author = quote.author?.name ?? '';

  return (
    <blockquote className="bg-raised border-line border-l-accent mx-auto mt-1.5 w-full max-w-md rounded-lg border border-l-2 px-3 py-2">
      <div className="flex items-center gap-2">
        <Avatar name={author} src={quote.author?.iconUrl} size="xs" />
        <span className="min-w-0 truncate text-xs font-semibold">{author}</span>
        {quote.createdAt ? (
          <time dateTime={quote.createdAt} className="text-content-muted shrink-0 text-[10px] tabular-nums">
            {format(new Date(quote.createdAt), 'HH:mm')}
          </time>
        ) : null}
      </div>

      {encrypted ? (
        <p className="text-content-muted mt-1 flex items-center gap-1.5 text-sm italic">
          <Icons.private size={13} /> {t('encrypted')}
        </p>
      ) : quote.text ? (
        <MessageBody text={quote.text} className="mt-1 text-sm break-words" />
      ) : (
        // A pinned upload copies no files onto the event, so its own text is
        // all there is to quote — say that it had none rather than draw an
        // empty box.
        <p className="text-content-muted mt-1 flex items-center gap-1.5 text-xs">
          <Icons.attach size={13} /> {t('attachments', { count: 1 })}
        </p>
      )}
    </blockquote>
  );
};
