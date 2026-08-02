import { create } from 'zustand';

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

export interface MediaItem {
  id: string;
  /** Absolute URL, or a blob URL for an attachment that has not been sent yet. */
  url: string;
  /**
   * Downscaled preview, when the server made one. Everything that renders the
   * item small — the timeline, the lightbox filmstrip — should prefer this;
   * `url` is only worth fetching once the item fills the screen.
   */
  thumbnailUrl?: string | null;
  name: string;
  mimeType: string | null;
  kind: MediaKind;
  sizeBytes?: number | null;
}

/** Classifies by MIME type, falling back to the extension when it is absent. */
export const mediaKindOf = (mimeType: string | null | undefined, name = ''): MediaKind => {
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('audio/')) return 'audio';

  // Rocket.Chat omits the type on some older upload records.
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(extension)) return 'image';
  if (['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(extension)) return 'video';
  if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac'].includes(extension)) return 'audio';

  return 'file';
};

export const isPreviewable = (item: MediaItem): boolean => item.kind === 'image' || item.kind === 'video';

interface MediaState {
  /** The gallery currently open, or an empty list when the viewer is closed. */
  items: MediaItem[];
  index: number;

  /**
   * Opens the viewer. `items` is the whole gallery so the arrow keys can move
   * between every image in a message, not just the one that was clicked.
   */
  open: (items: MediaItem[], startAt?: number) => void;
  close: () => void;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
}

export const useMediaStore = create<MediaState>((set, get) => ({
  items: [],
  index: 0,

  open: (items, startAt = 0) => {
    const previewable = items.filter(isPreviewable);
    if (previewable.length === 0) return;

    // The clicked item may not be previewable; land on the nearest one that is.
    const clicked = items[startAt];
    const index = clicked
      ? Math.max(
          0,
          previewable.findIndex((item) => item.id === clicked.id),
        )
      : 0;

    set({ items: previewable, index });
  },

  close: () => set({ items: [], index: 0 }),

  next: () => {
    const { items, index } = get();
    if (items.length === 0) return;
    // Wrapping keeps a long press on the arrow key from dead-ending.
    set({ index: (index + 1) % items.length });
  },

  previous: () => {
    const { items, index } = get();
    if (items.length === 0) return;
    set({ index: (index - 1 + items.length) % items.length });
  },

  goTo: (index) => set((state) => ({ index: Math.min(Math.max(index, 0), state.items.length - 1) })),
}));
