import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';

/**
 * GIF search, backed by GIPHY's public API.
 *
 * The browser talks to `api.giphy.com` directly rather than through the
 * gateway: GIPHY is a third-party service with no bearing on the Rocket.Chat
 * session, and proxying it would put every search through a server that has no
 * reason to see it. The key is a per-deployment credential, not a secret tied
 * to an account, which is why it is safe to ship in the client — GIPHY issues
 * these specifically for browser use.
 */

const API_ORIGIN = 'https://api.giphy.com/v1/gifs';
const KEY_STORAGE = 'orc:giphy-api-key';

/** Enough to scroll for a while without paging the picker. */
const RESULT_LIMIT = 36;

/** Keeps explicit results out of what is, for most people, a work account. */
const RATING = 'pg-13';

/** Where a key is obtained, linked from the picker and from Settings. */
export const GIPHY_DEVELOPER_URL = 'https://developers.giphy.com/dashboard/';
export const GIPHY_URL = 'https://giphy.com/';

const buildTimeKey = ((import.meta.env.VITE_GIPHY_API_KEY as string | undefined) ?? '').trim();

/** True when the deployment shipped a key, so nobody has to enter one. */
export const hasBuildTimeGiphyKey = buildTimeKey.length > 0;

const readStoredKey = (): string => {
  try {
    return localStorage.getItem(KEY_STORAGE)?.trim() ?? '';
  } catch {
    // Storage is unavailable in some privacy modes. Losing the key is a far
    // better outcome than a picker that will not open.
    return '';
  }
};

interface GiphyKeyState {
  /**
   * The key entered in Settings. Kept separate from the build-time one so
   * clearing the field falls back to the deployment's key rather than leaving
   * the feature switched off.
   */
  userKey: string;
  setUserKey: (key: string) => void;
}

export const useGiphyKeyStore = create<GiphyKeyState>((set) => ({
  userKey: readStoredKey(),

  setUserKey: (key) => {
    const userKey = key.trim();

    try {
      if (userKey) localStorage.setItem(KEY_STORAGE, userKey);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {
      // Ignored — see readStoredKey. The key still applies for this session.
    }

    set({ userKey });
  },
}));

/** The key in force: whatever was entered in Settings, else the built-in one. */
export const useGiphyApiKey = (): string => useGiphyKeyStore((state) => state.userKey) || buildTimeKey;

export interface GiphyGif {
  id: string;
  /** GIPHY's own title, used as the accessible name and the file name. */
  title: string;
  /** Small animated rendition for the grid. */
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
  /** The rendition that gets attached to the message. */
  url: string;
  sizeBytes: number;
  /** Permalink on giphy.com, sent when the server does not accept uploads. */
  pageUrl: string;
}

interface GiphyRendition {
  url?: string;
  width?: string;
  height?: string;
  size?: string;
}

interface GiphyItem {
  id?: string;
  title?: string;
  url?: string;
  images?: Record<string, GiphyRendition | undefined>;
}

const firstRendition = (
  images: Record<string, GiphyRendition | undefined>,
  names: string[],
): GiphyRendition | undefined => {
  for (const name of names) {
    const rendition = images[name];
    if (rendition?.url) return rendition;
  }
  return undefined;
};

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Turns one GIPHY result into what the picker and the composer need.
 *
 * Renditions are tried in order because GIPHY does not guarantee every one for
 * every GIF, and the downsized ones come first deliberately: `original` is
 * routinely tens of megabytes, which is a slow upload and a slower timeline for
 * everybody else in the room.
 */
export const normaliseGif = (item: GiphyItem): GiphyGif | null => {
  const images = item.images ?? {};

  const preview = firstRendition(images, ['fixed_width', 'fixed_height', 'downsized', 'original']);
  const full = firstRendition(images, ['downsized', 'downsized_medium', 'downsized_large', 'fixed_width', 'original']);

  if (!item.id || !preview?.url || !full?.url) return null;

  return {
    id: item.id,
    title: item.title?.trim() || 'GIF',
    previewUrl: preview.url,
    previewWidth: toNumber(preview.width, 200),
    previewHeight: toNumber(preview.height, 200),
    url: full.url,
    sizeBytes: toNumber(full.size, 0),
    pageUrl: item.url ?? GIPHY_URL,
  };
};

/**
 * Trending GIFs when the box is empty, search results otherwise — the same two
 * endpoints giphy.com itself puts behind one field.
 */
export const searchGifs = async (apiKey: string, query: string, signal?: AbortSignal): Promise<GiphyGif[]> => {
  const term = query.trim();

  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(RESULT_LIMIT),
    rating: RATING,
  });
  if (term) params.set('q', term);

  const response = await fetch(`${API_ORIGIN}/${term ? 'search' : 'trending'}?${params.toString()}`, { signal });

  if (!response.ok) {
    // 401/403 is the one worth naming: it means the key is wrong, and telling
    // somebody "GIPHY is unreachable" would send them looking in the wrong place.
    throw new Error(response.status === 401 || response.status === 403 ? 'giphy-unauthorised' : 'giphy-unavailable');
  }

  const payload = (await response.json()) as { data?: GiphyItem[] };
  return (payload.data ?? []).flatMap((item) => normaliseGif(item) ?? []);
};

/** Fetches only once the picker has been opened, and never without a key. */
export const useGiphySearch = (query: string, enabled: boolean) => {
  const apiKey = useGiphyApiKey();

  return useQuery({
    queryKey: ['giphy', query.trim(), apiKey],
    queryFn: ({ signal }) => searchGifs(apiKey, query, signal),
    enabled: enabled && apiKey.length > 0,
    // Trending barely moves within a session, and re-searching the same term
    // should be instant.
    staleTime: 5 * 60_000,
    retry: false,
  });
};

/** `Party Parrot Dancing` -> `party-parrot-dancing`, for the uploaded file name. */
const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/**
 * Downloads the chosen GIF so it can be uploaded like any other attachment.
 *
 * Sending the URL alone would leave the GIF to the server's link previewer,
 * which is off on plenty of servers and never applies to a private room the
 * previewer cannot reach.
 */
export const fetchGifFile = async (gif: GiphyGif): Promise<File> => {
  const response = await fetch(gif.url);
  if (!response.ok) throw new Error('giphy-download-failed');

  const blob = await response.blob();
  const name = `${slugify(gif.title) || 'giphy'}.gif`;

  return new File([blob], name, { type: blob.type || 'image/gif' });
};
