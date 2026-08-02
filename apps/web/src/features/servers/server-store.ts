import { create } from 'zustand';

const ACTIVE_SERVER_KEY = 'orc:active-server';

/**
 * The chosen server outlives the tab, like the sidebar width, but is not worth
 * failing over: storage is unavailable in some privacy modes, and falling back
 * to the session's default server is a perfectly good outcome.
 */
const readStored = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_SERVER_KEY);
  } catch {
    return null;
  }
};

interface ServerState {
  /**
   * The server the user last chose, which may no longer be one they are signed
   * in to — `resolveActiveServerId` decides what is actually usable.
   */
  preferredServerId: string | null;
  /** Set while the "add a server" dialog is open. */
  addingServer: boolean;

  setPreferredServer: (serverId: string) => void;
  setAddingServer: (adding: boolean) => void;
}

export const useServerStore = create<ServerState>((set) => ({
  preferredServerId: readStored(),
  addingServer: false,

  setPreferredServer: (preferredServerId) => {
    try {
      localStorage.setItem(ACTIVE_SERVER_KEY, preferredServerId);
    } catch {
      // Ignored — see readStored.
    }
    set({ preferredServerId });
  },

  setAddingServer: (addingServer) => set({ addingServer }),
}));

/**
 * Picks the server to work with.
 *
 * The stored preference wins only if the session is still signed in to it: a
 * server can be signed out of in another tab, or become unreachable and be
 * dropped from the session, and neither should leave the app pointing at a
 * server it cannot talk to.
 */
export const resolveActiveServerId = (
  connectedServerIds: readonly string[],
  defaultServerId: string,
  preferredServerId: string | null,
): string => {
  if (preferredServerId && connectedServerIds.includes(preferredServerId)) return preferredServerId;
  if (connectedServerIds.includes(defaultServerId)) return defaultServerId;
  return connectedServerIds[0] ?? defaultServerId;
};
