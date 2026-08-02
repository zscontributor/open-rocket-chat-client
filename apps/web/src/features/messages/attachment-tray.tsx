import { useTranslation } from 'react-i18next';

import { fileIconOf } from '@/features/media/file-icon';
import { useMediaStore, type MediaItem } from '@/features/media/media';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { Icons, Spinner } from '@/ui/icon';
import type { PendingAttachment } from './use-attachments';
import { MAX_ATTACHMENT_BYTES } from './use-attachments';

const Thumbnail = ({ attachment }: { attachment: PendingAttachment }) => {
  if (attachment.previewUrl && attachment.kind === 'image') {
    return <img src={attachment.previewUrl} alt="" className="size-full object-cover" />;
  }

  if (attachment.previewUrl && attachment.kind === 'video') {
    return (
      <div className="relative size-full">
        {/* Muted and preload-metadata: enough to paint a poster frame without
            fetching the whole file before the user has even sent it. */}
        <video src={attachment.previewUrl} muted preload="metadata" className="size-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
          <Icons.expand size={18} />
        </span>
      </div>
    );
  }

  // No picture to show, so the file's type is what the tile has to say —
  // the mark, not a generic sheet, is what makes a mis-picked file obvious.
  // (For audio the player sits under the tile, where it has room for a
  // timeline; this is only the mark that says what the file is.)
  const Icon = Icons[fileIconOf(attachment.mimeType, attachment.name)];

  return (
    <span className="text-content-muted flex size-full items-center justify-center">
      <Icon size={attachment.kind === 'audio' ? 26 : 22} />
    </span>
  );
};

/**
 * Files staged in the composer, before anything is sent.
 *
 * Previewing here — rather than after the upload — is what lets someone notice
 * they picked the wrong screenshot while it is still cheap to fix.
 */
export const AttachmentTray = ({
  attachments,
  mediaItems,
  onRemove,
  onClear,
  onCaptionChange,
}: {
  attachments: PendingAttachment[];
  mediaItems: MediaItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onCaptionChange: (id: string, caption: string) => void;
}) => {
  const { t } = useTranslation('composer');
  const openViewer = useMediaStore((state) => state.open);

  if (attachments.length === 0) return null;

  return (
    <div className="border-line bg-raised mb-2 rounded-lg border p-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-content-muted text-xs font-medium">
          {t('attachments.heading', { count: attachments.length })}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="text-content-muted hover:text-content rounded px-1.5 py-0.5 text-xs transition-colors"
        >
          {t('attachments.removeAll')}
        </button>
      </div>

      <ul className="scrollbar-slim flex gap-2 overflow-x-auto pb-1">
        {attachments.map((attachment) => {
          // Audio has a preview URL too, but it plays in place rather than in
          // the lightbox — which only ever shows images and video.
          const previewable =
            Boolean(attachment.previewUrl) && (attachment.kind === 'image' || attachment.kind === 'video');
          const rejected = attachment.status === 'rejected';

          return (
            <li key={attachment.id} className="w-40 shrink-0">
              <div
                className={cn(
                  'border-line bg-app relative aspect-square overflow-hidden rounded-md border',
                  rejected && 'border-danger',
                )}
              >
                {previewable ? (
                  <button
                    type="button"
                    aria-label={t('attachments.preview', { name: attachment.name })}
                    onClick={() =>
                      openViewer(
                        mediaItems,
                        mediaItems.findIndex((item) => item.id === attachment.id),
                      )
                    }
                    className="size-full cursor-zoom-in"
                  >
                    <Thumbnail attachment={attachment} />
                  </button>
                ) : (
                  <Thumbnail attachment={attachment} />
                )}

                {attachment.status === 'uploading' ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                    <Spinner className="size-5" />
                  </span>
                ) : null}

                <button
                  type="button"
                  aria-label={t('attachments.remove', { name: attachment.name })}
                  onClick={() => onRemove(attachment.id)}
                  className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
                >
                  <Icons.close size={14} />
                </button>
              </div>

              {attachment.kind === 'audio' && attachment.previewUrl ? (
                // Listening back before sending is the whole point of staging a
                // voice message rather than posting it the moment it stops.
                //
                // No caption track: this is the user's own recording, seconds
                // old, and there is nothing to caption it from.
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <audio
                  src={attachment.previewUrl}
                  controls
                  preload="metadata"
                  aria-label={t('attachments.play', { name: attachment.name })}
                  className="mt-1 h-8 w-full"
                />
              ) : null}

              <p className="text-content mt-1 truncate text-xs" title={attachment.path ?? attachment.name}>
                {attachment.name}
              </p>

              {rejected ? (
                <p className="text-danger text-[11px]">
                  {t('attachments.tooLarge', { name: '', limit: formatBytes(MAX_ATTACHMENT_BYTES) }).trim()}
                </p>
              ) : (
                <p className="text-content-muted text-[11px]">{formatBytes(attachment.size)}</p>
              )}

              {attachment.status === 'failed' ? (
                <p className="text-danger text-[11px]">{t('attachments.failed', { name: attachment.name })}</p>
              ) : null}

              <input
                value={attachment.caption}
                onChange={(event) => onCaptionChange(attachment.id, event.target.value)}
                placeholder={t('attachments.captionPlaceholder')}
                aria-label={t('attachments.captionPlaceholder')}
                className="border-line bg-app text-content placeholder:text-content-muted focus:border-focus mt-1 w-full rounded border px-1.5 py-1 text-xs focus:outline-none"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
};
