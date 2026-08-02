import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { Icons } from '@/ui/icon';
import { useMediaStore, type MediaItem } from './media';

const ZOOM_STEPS = [1, 1.5, 2, 3];

const ToolbarButton = ({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
    className="flex size-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
  >
    {children}
  </button>
);

/** Remounted per item via `key`, so a failed load never leaks to the next one. */
const ImageStage = ({ item, zoom }: { item: MediaItem; zoom: number }) => {
  const { t } = useTranslation('media');
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <p className="text-white/70">{t('lightbox.loadFailed')}</p>;
  }

  return (
    <img
      src={item.url}
      alt={item.name}
      onError={() => setFailed(true)}
      style={{ transform: `scale(${zoom})` }}
      className={cn(
        'max-h-full max-w-full object-contain transition-transform duration-150',
        zoom > 1 && 'cursor-grab',
      )}
    />
  );
};

const VideoStage = ({ item }: { item: MediaItem }) => {
  const { t } = useTranslation('media');
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <p className="text-white/70">{t('lightbox.loadFailed')}</p>;
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- user uploads carry no caption track
    <video
      key={item.id}
      src={item.url}
      controls
      autoPlay
      onError={() => setFailed(true)}
      className="max-h-full max-w-full rounded-md"
    />
  );
};

/**
 * Full-screen viewer for images and video.
 *
 * Built on Radix Dialog so focus trapping, scroll locking and restoring focus
 * to the thumbnail on close come for free — all things a hand-rolled overlay
 * gets wrong and only keyboard users notice.
 */
export const MediaLightbox = () => {
  const { t } = useTranslation('media');
  const items = useMediaStore((state) => state.items);
  const index = useMediaStore((state) => state.index);
  const close = useMediaStore((state) => state.close);
  const next = useMediaStore((state) => state.next);
  const previous = useMediaStore((state) => state.previous);

  const [zoomStep, setZoomStep] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  const item = items[index];
  const open = items.length > 0;
  const zoom = ZOOM_STEPS[zoomStep] ?? 1;

  // `formatBytes` returns '' for a missing size, so an item the server never
  // reported a size for simply drops the segment instead of showing '0 B'.
  const size = formatBytes(item?.sizeBytes);

  // Zoom is per-image, and it is reset where the change originates rather than
  // in an effect watching the item — one fewer render pass, and no window in
  // which the new image is briefly shown at the old zoom.
  const showNext = useCallback(() => {
    setZoomStep(0);
    next();
  }, [next]);

  const showPrevious = useCallback(() => {
    setZoomStep(0);
    previous();
  }, [previous]);

  const showAt = useCallback((target: number) => {
    setZoomStep(0);
    useMediaStore.getState().goTo(target);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        showNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        showPrevious();
      } else if (event.key === '+' || event.key === '=') {
        setZoomStep((step) => Math.min(step + 1, ZOOM_STEPS.length - 1));
      } else if (event.key === '-') {
        setZoomStep((step) => Math.max(step - 1, 0));
      } else if (event.key === '0') {
        setZoomStep(0);
      }
    },
    [open, showNext, showPrevious],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  if (!item) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex flex-col outline-none"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // Focus the stage rather than the first toolbar button, so the
            // arrow keys drive the gallery immediately.
            event.preventDefault();
            stageRef.current?.focus();
          }}
        >
          <Dialog.Title className="sr-only">{t('lightbox.title')}</Dialog.Title>

          <header className="flex items-center gap-2 px-4 py-3 text-white">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
              {items.length > 1 || size ? (
                <p className="flex items-center gap-1.5 text-xs text-white/60">
                  {items.length > 1 ? (
                    <span>{t('lightbox.counter', { current: index + 1, total: items.length })}</span>
                  ) : null}
                  {items.length > 1 && size ? <span aria-hidden>·</span> : null}
                  {size ? <span>{size}</span> : null}
                </p>
              ) : null}
            </div>

            {item.kind === 'image' ? (
              <>
                <ToolbarButton
                  label={t('lightbox.zoomOut')}
                  onClick={() => setZoomStep((step) => Math.max(step - 1, 0))}
                  disabled={zoomStep === 0}
                >
                  <Icons.zoomOut />
                </ToolbarButton>
                <ToolbarButton
                  label={t('lightbox.zoomIn')}
                  onClick={() => setZoomStep((step) => Math.min(step + 1, ZOOM_STEPS.length - 1))}
                  disabled={zoomStep === ZOOM_STEPS.length - 1}
                >
                  <Icons.zoomIn />
                </ToolbarButton>
              </>
            ) : null}

            <a
              href={item.url}
              download={item.name}
              aria-label={t('lightbox.download')}
              title={t('lightbox.download')}
              className="flex size-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <Icons.download />
            </a>

            <ToolbarButton label={t('lightbox.close')} onClick={close}>
              <Icons.close />
            </ToolbarButton>
          </header>

          <div
            ref={stageRef}
            tabIndex={-1}
            className="flex flex-1 items-center justify-center overflow-hidden px-4 pb-6 outline-none"
          >
            {items.length > 1 ? (
              <ToolbarButton label={t('lightbox.previous')} onClick={showPrevious}>
                <Icons.chevronLeft size={28} />
              </ToolbarButton>
            ) : null}

            <div className="flex h-full flex-1 items-center justify-center overflow-auto">
              {item.kind === 'video' ? (
                <VideoStage key={item.id} item={item} />
              ) : (
                <ImageStage key={item.id} item={item} zoom={zoom} />
              )}
            </div>

            {items.length > 1 ? (
              <ToolbarButton label={t('lightbox.next')} onClick={showNext}>
                <Icons.chevronRight size={28} />
              </ToolbarButton>
            ) : null}
          </div>

          {items.length > 1 ? (
            <nav className="scrollbar-slim flex shrink-0 justify-center gap-2 overflow-x-auto px-4 pb-4">
              {items.map((candidate, candidateIndex) => (
                <button
                  key={candidate.id}
                  type="button"
                  aria-label={candidate.name}
                  aria-current={candidateIndex === index}
                  onClick={() => showAt(candidateIndex)}
                  className={cn(
                    'size-14 shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                    candidateIndex === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100',
                  )}
                >
                  {candidate.kind === 'image' ? (
                    <img src={candidate.thumbnailUrl ?? candidate.url} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center bg-white/10 text-white">
                      <Icons.expand />
                    </span>
                  )}
                </button>
              ))}
            </nav>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
