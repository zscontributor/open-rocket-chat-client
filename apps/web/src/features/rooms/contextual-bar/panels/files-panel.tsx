import type { FileTypeGroup, RoomFile } from '@open-rocket-chat/client-sdk';
import { format } from 'date-fns';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fileIconOf } from '@/features/media/file-icon';
import { mediaKindOf, useMediaStore } from '@/features/media/media';
import { displayNameOf, useCapabilities } from '@/features/server/use-capabilities';
import { useClient } from '@/features/servers/server-scope';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { Icons } from '@/ui/icon';
import { LoadMore, PanelBody, PanelSearch, PanelState, PanelToolbar } from '../panel';
import { useDebounced, useRoomFiles } from '../use-panels';

/** Rocket.Chat's own filter set, in its order. */
const FILTERS: ('all' | FileTypeGroup)[] = ['all', 'image', 'video', 'audio', 'text', 'application'];

export const FilesPanel = ({ roomId }: { roomId: string }) => {
  const { t } = useTranslation('rooms');
  const { data: capabilities } = useCapabilities();
  const openMedia = useMediaStore((state) => state.open);
  // Paths from the gateway are server-relative. `mediaUrl` on the *scoped*
  // client is what names the server they belong to, and the browser loads
  // these through `<img>` and a download link, neither of which can send the
  // scoping header — so without it a file on the second server is fetched
  // from the first.
  const client = useClient();

  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | FileTypeGroup>('all');
  const debouncedQuery = useDebounced(query);

  const files = useRoomFiles(roomId, { q: debouncedQuery, type });
  const items = files.data?.files ?? [];

  /**
   * Only the images and videos go into the viewer, and the clicked file has to
   * be located within *that* list rather than within the panel's — the two
   * differ as soon as a document sits between two photos.
   */
  const preview = (file: RoomFile) => {
    const gallery = items
      .filter((entry) => entry.typeGroup === 'image' || entry.typeGroup === 'video')
      .map((entry) => ({
        id: entry.id,
        url: client.mediaUrl(entry.url),
        thumbnailUrl: entry.thumbnailUrl ? client.mediaUrl(entry.thumbnailUrl) : null,
        name: entry.name,
        mimeType: entry.mimeType,
        kind: mediaKindOf(entry.mimeType, entry.name),
        sizeBytes: entry.size,
      }));

    const index = gallery.findIndex((entry) => entry.id === file.id);
    if (index >= 0) openMedia(gallery, index);
  };

  return (
    <>
      <PanelToolbar>
        <PanelSearch
          value={query}
          onChange={setQuery}
          label={t('files.search')}
          placeholder={t('files.searchPlaceholder')}
        />

        {/* Wrapped rather than scrolled sideways: six short chips fit in two
            rows at any width the bar can be dragged to, and a filter the user
            has to scroll to find is a filter they will not use. */}
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={type === filter}
              onClick={() => setType(filter)}
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                type === filter ? 'bg-accent text-accent-content' : 'bg-sunken text-content-muted hover:text-content',
              )}
            >
              {t(`files.filter.${filter}`)}
            </button>
          ))}
        </div>
      </PanelToolbar>

      <PanelBody>
        <PanelState
          loading={files.isPending}
          error={files.error}
          empty={items.length === 0}
          emptyIcon={<Icons.attach size={32} />}
          emptyLabel={debouncedQuery ? t('files.noMatches', { query: debouncedQuery }) : t('files.empty')}
        >
          <ul>
            {items.map((file) => {
              // Only images arrive with a thumbnail, and not always; everything
              // else is identified by the mark for its type.
              const Icon = Icons[fileIconOf(file.mimeType, file.name)];
              const previewable = file.typeGroup === 'image' || file.typeGroup === 'video';

              return (
                <li key={file.id} className="group/file hover:bg-sunken relative transition-colors">
                  <button
                    type="button"
                    onClick={previewable ? () => preview(file) : undefined}
                    disabled={!previewable}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left disabled:cursor-default"
                  >
                    {file.typeGroup === 'image' && file.thumbnailUrl ? (
                      <img
                        src={client.mediaUrl(file.thumbnailUrl)}
                        alt=""
                        loading="lazy"
                        className="bg-sunken size-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="bg-sunken text-content-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
                        <Icon size={18} />
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{file.name}</span>
                      <span className="text-content-muted block truncate text-[11px]">
                        {[
                          file.uploadedBy ? displayNameOf(capabilities, file.uploadedBy) : null,
                          file.uploadedAt ? format(new Date(file.uploadedAt), 'd MMM yyyy') : null,
                          formatBytes(file.size) || null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>

                  {/* A download link rather than a button: the browser's own
                      save behaviour, including the file name, comes free. */}
                  <a
                    href={client.mediaUrl(file.url)}
                    download={file.name}
                    aria-label={t('files.download', { name: file.name })}
                    title={t('files.download', { name: file.name })}
                    className="bg-panel border-line text-content-muted hover:text-content absolute top-1/2 right-3 -translate-y-1/2 rounded-md border p-1.5 opacity-0 shadow-sm transition-opacity group-hover/file:opacity-100 focus-visible:opacity-100"
                  >
                    <Icons.download size={15} />
                  </a>
                </li>
              );
            })}
          </ul>

          {files.hasNextPage ? (
            <LoadMore onClick={() => void files.fetchNextPage()} loading={files.isFetchingNextPage} />
          ) : null}
        </PanelState>
      </PanelBody>
    </>
  );
};
