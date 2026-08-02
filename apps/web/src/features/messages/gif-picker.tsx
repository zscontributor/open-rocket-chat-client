import * as Popover from '@radix-ui/react-popover';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useUiStore } from '@/stores/ui-store';
import { Icons, Spinner } from '@/ui/icon';
import { Input } from '@/ui/input';
import { GIPHY_DEVELOPER_URL, GIPHY_URL, useGiphyApiKey, useGiphySearch, type GiphyGif } from './giphy';

/** Long enough that typing a word does not cost a request per letter. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * GIF picker over GIPHY.
 *
 * Opening it is what starts the first request — most messages are not GIFs, and
 * a client that calls a third party on every room switch would be paying for
 * that in requests and in privacy.
 */
export const GifPicker = ({
  trigger,
  onSelect,
  align = 'start',
  side = 'top',
  onOpenChange,
}: {
  trigger: ReactNode;
  /** Awaited, so the tile can show progress while the GIF is downloaded. */
  onSelect: (gif: GiphyGif) => void | Promise<void>;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  onOpenChange?: (open: boolean) => void;
}) => {
  const { t } = useTranslation('composer');
  const { t: tCommon } = useTranslation('common');
  const openSettings = useUiStore((state) => state.setSettingsOpen);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const apiKey = useGiphyApiKey();
  const { data: gifs, isFetching, error, refetch } = useGiphySearch(term, open);

  // Debounced so the search runs on the phrase rather than on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const close = () => {
    setOpen(false);
    onOpenChange?.(false);
    setQuery('');
    setTerm('');
  };

  const choose = async (gif: GiphyGif) => {
    if (pendingId) return;

    setPendingId(gif.id);
    try {
      await onSelect(gif);
      close();
    } finally {
      setPendingId(null);
    }
  };

  const failureKey = error instanceof Error && error.message === 'giphy-unauthorised' ? 'unauthorised' : 'unavailable';

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
        if (!next) {
          setQuery('');
          setTerm('');
        }
      }}
    >
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={8}
          className="bg-panel border-line z-40 flex h-96 w-80 flex-col overflow-hidden rounded-xl border shadow-lg"
        >
          <div className="border-line border-b p-2">
            <div className="relative">
              <Icons.search
                size={16}
                className="text-content-muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('gifPicker.search')}
                aria-label={t('gifPicker.search')}
                autoFocus
                disabled={!apiKey}
                className="h-9 pl-8 text-sm"
              />
            </div>
          </div>

          <div className="scrollbar-slim flex-1 overflow-y-auto p-2">
            {!apiKey ? (
              // Nothing can be searched without a key, so the picker says how to
              // get one rather than showing an empty grid nobody can explain.
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <Icons.gif size={28} className="text-content-muted" />
                <p className="text-sm font-medium">{t('gifPicker.needsKey.title')}</p>
                <p className="text-content-muted text-xs">{t('gifPicker.needsKey.hint')}</p>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    openSettings(true);
                  }}
                  className="border-line hover:bg-sunken mt-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  {t('gifPicker.needsKey.action')}
                </button>
              </div>
            ) : error ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <Icons.error size={24} className="text-danger" />
                <p className="text-content-muted text-sm">{t(`gifPicker.error.${failureKey}`)}</p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="border-line hover:bg-sunken rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  {tCommon('action.retry')}
                </button>
              </div>
            ) : isFetching && !gifs ? (
              <div className="text-content-muted flex h-full items-center justify-center gap-2 text-sm">
                <Spinner className="size-4" /> {tCommon('state.loading')}
              </div>
            ) : !gifs || gifs.length === 0 ? (
              <p className="text-content-muted p-4 text-center text-sm">
                {term ? t('gifPicker.noResults', { query: term }) : tCommon('state.empty')}
              </p>
            ) : (
              <>
                <h3 className="text-content-muted mb-1.5 px-1 text-[11px] font-semibold">
                  {term ? t('gifPicker.results') : t('gifPicker.trending')}
                </h3>

                {/* Two masonry columns: GIFs vary wildly in aspect ratio, and a
                    square grid would either crop the joke or letterbox it. */}
                <div className="columns-2 gap-2 [column-fill:_balance]">
                  {gifs.map((gif) => (
                    <button
                      key={gif.id}
                      type="button"
                      title={gif.title}
                      aria-label={gif.title}
                      disabled={pendingId !== null}
                      onClick={() => void choose(gif)}
                      className="bg-sunken focus-visible:ring-accent relative mb-2 block w-full overflow-hidden rounded-md focus:outline-none focus-visible:ring-2"
                    >
                      <img
                        src={gif.previewUrl}
                        alt=""
                        loading="lazy"
                        width={gif.previewWidth}
                        height={gif.previewHeight}
                        className="block w-full"
                      />
                      {pendingId === gif.id ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                          <Spinner className="size-5" />
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* GIPHY's terms require the mark to be shown wherever their results are. */}
          <a
            href={GIPHY_URL}
            target="_blank"
            rel="noreferrer"
            className="border-line text-content-muted hover:text-content flex items-center justify-center gap-1 border-t py-1.5 text-[11px] transition-colors"
          >
            {t('gifPicker.poweredBy')}
            <Icons.openExternal size={11} />
          </a>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

/** The developer-dashboard link, shared by the picker's empty state and Settings. */
export const GiphyKeyLink = ({ label }: { label: string }) => (
  <a
    href={GIPHY_DEVELOPER_URL}
    target="_blank"
    rel="noreferrer"
    className="text-accent inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
  >
    <Icons.openExternal size={14} /> {label}
  </a>
);
