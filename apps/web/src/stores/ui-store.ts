import type { RealtimeStatus } from '@open-rocket-chat/client-sdk';
import { create } from 'zustand';

import {
  clampSize,
  composerBounds,
  contextualBarBounds,
  isMobileViewport,
  layoutWidth,
  parseStoredSize,
  sidebarBounds,
  sidebarForViewport,
  CONTEXTUAL_BAR_WIDTH,
  SIDEBAR_WIDTH,
} from '@/lib/resize';

const SIDEBAR_WIDTH_KEY = 'orc:sidebar-width';
const COMPOSER_HEIGHT_KEY = 'orc:composer-height';
const CONTEXTUAL_BAR_WIDTH_KEY = 'orc:contextual-bar-width';
const ENTER_TO_SEND_KEY = 'orc:enter-to-send';

/**
 * Layout sizes outlive the tab, like every other chat client, but they are not
 * worth failing over: storage is unavailable in some privacy modes and blocked
 * in others, and a sidebar that forgets its width is a far better outcome than
 * an app that will not start.
 */
const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Ignored — see readStored.
  }
};

/**
 * Only an explicit `false` turns it off, so a corrupt or missing value leaves
 * the composer behaving the way every chat client does out of the box.
 */
const readEnterToSend = (): boolean => readStored(ENTER_TO_SEND_KEY) !== 'false';

/** The width the resizable panes are competing over, rail already deducted. */
const availableWidth = (serverRailWidth: number): number => layoutWidth(window.innerWidth, serverRailWidth);

/**
 * Keys per-room client state by server as well as room.
 *
 * Rocket.Chat ids are only unique within one server, and this app is connected
 * to several: without the prefix a draft typed on one server could surface in
 * a room on another.
 */
export const roomScopeKey = (serverId: string, roomId: string): string => `${serverId}:${roomId}`;

export interface EditingMessage {
  roomId: string;
  messageId: string;
  /** The text as it was, for the label above the composer. */
  originalText: string;
}

/**
 * Editing borrows the room's message box, so it needs a draft slot of its own —
 * otherwise starting an edit would overwrite whatever the user had half-typed,
 * and cancelling would not give it back.
 */
export const editDraftKey = (roomId: string, messageId: string): string => `${roomId}:edit:${messageId}`;

/**
 * Client-owned state only.
 *
 * Anything the server has an opinion about — rooms, messages, profiles — lives
 * in TanStack Query. Mirroring it here is what creates two sources of truth
 * that drift. Appearance moved to `features/theme/theme-store.ts`.
 */
interface UiState {
  sidebarOpen: boolean;
  /**
   * Whether the room list was closed by the viewport rather than by the user.
   * Only such a collapse is undone when the width comes back — see
   * `sidebarForViewport`.
   */
  sidebarAutoCollapsed: boolean;
  /**
   * Whether the viewport is too narrow to show the room list beside the
   * conversation. Components read it to lay the list out as a drawer over the
   * messages instead of a pane beside them.
   */
  viewportIsMobile: boolean;
  /**
   * The window's width, as of the last resize.
   *
   * Panes that decide their own layout from the width — the contextual bar
   * chooses between sitting beside the conversation and floating over it — need
   * it in the store rather than reading `window.innerWidth` while rendering:
   * nothing re-renders them when the window changes, so what they read there is
   * whatever it was when something else happened to update.
   */
  viewportWidth: number;
  /**
   * What the server rail is taking, or 0 while it is hidden — it only appears
   * once there is a second server. Every other pane is measured against what it
   * leaves behind, so it has to be known here rather than only in its own
   * component.
   */
  serverRailWidth: number;
  /** Width of the room list, in pixels. Dragged by the user, persisted. */
  sidebarWidth: number;
  /**
   * Height the message box was dragged to, or `null` while it grows to fit
   * what has been typed.
   */
  composerHeight: number | null;
  /**
   * Width of the contextual bar, in pixels. Which panel it shows lives in
   * `features/rooms/contextual-bar/store.ts`; only the geometry is here,
   * because only the geometry is shared with the sidebar's own limits.
   */
  contextualBarWidth: number;
  /**
   * Whether a bare Enter sends the message. With it off the two swap: Enter
   * opens a new line and the platform modifier sends.
   *
   * One setting for every room and both panes, because it is a habit about a
   * keyboard rather than a property of a conversation.
   */
  enterToSend: boolean;
  /** The message the composer has been handed for editing, if any. */
  editingMessage: EditingMessage | null;
  settingsOpen: boolean;
  connection: RealtimeStatus;
  /**
   * Epoch milliseconds at which the realtime connection retries by itself, or
   * `null` when there is no wait in progress — an attempt is either in flight
   * or unnecessary. The connection banner counts down to it and offers to skip
   * the rest of it.
   */
  connectionRetryAt: number | null;
  /**
   * Per-room composer text. Kept here rather than in component state so it
   * survives switching rooms, which is what users expect from a chat client.
   */
  drafts: Record<string, string>;
  /** Usernames currently typing, keyed by `roomScopeKey`. */
  typing: Record<string, string[]>;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  /**
   * Closes the room list on the app's behalf rather than the user's — picking a
   * room on a phone, where the list is covering the conversation it just opened.
   * Unlike `setSidebarOpen(false)` this is undone when the viewport widens.
   */
  collapseSidebarForViewport: () => void;
  /** Reported by the server rail as it appears, goes away, or changes size. */
  setServerRailWidth: (width: number) => void;
  setSidebarWidth: (width: number) => void;
  resetSidebarWidth: () => void;
  setComposerHeight: (height: number) => void;
  resetComposerHeight: () => void;
  setContextualBarWidth: (width: number) => void;
  resetContextualBarWidth: () => void;
  setEnterToSend: (enterToSend: boolean) => void;
  /**
   * Re-applies everything that depends on the viewport after the window is
   * resized: the pane limits, and whether the room list fits beside the
   * conversation at all.
   */
  syncLayoutToViewport: () => void;
  /** Hands a message to the composer, seeding its edit draft with the text. */
  startEditingMessage: (message: EditingMessage) => void;
  stopEditingMessage: () => void;
  setSettingsOpen: (open: boolean) => void;
  setConnection: (status: RealtimeStatus, retryAt?: number) => void;
  setDraft: (roomId: string, text: string) => void;
  clearDraft: (roomId: string) => void;
  /** `roomKey` comes from `roomScopeKey`, never a bare room id. */
  setTyping: (roomKey: string, username: string, typing: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  // Nothing has reported the rail yet, so the first measurement is of the bare
  // window; the rail re-runs all of this the moment it knows its own width.
  // A phone starts on the conversation, not on the room list. The collapse
  // counts as automatic, so turning the device sideways gives the list back.
  sidebarOpen: !isMobileViewport(window.innerWidth),
  sidebarAutoCollapsed: isMobileViewport(window.innerWidth),
  viewportIsMobile: isMobileViewport(window.innerWidth),
  viewportWidth: window.innerWidth,
  serverRailWidth: 0,
  sidebarWidth:
    parseStoredSize(readStored(SIDEBAR_WIDTH_KEY), sidebarBounds(window.innerWidth)) ?? SIDEBAR_WIDTH.default,
  composerHeight: parseStoredSize(readStored(COMPOSER_HEIGHT_KEY), composerBounds(window.innerHeight)),
  contextualBarWidth:
    parseStoredSize(readStored(CONTEXTUAL_BAR_WIDTH_KEY), contextualBarBounds(window.innerWidth, 0)) ??
    CONTEXTUAL_BAR_WIDTH.default,
  enterToSend: readEnterToSend(),
  editingMessage: null,
  settingsOpen: false,
  connection: 'idle',
  connectionRetryAt: null,
  drafts: {},
  typing: {},

  // Both clear the automatic flag: once the user has had an opinion about the
  // room list, the viewport stops having one on their behalf.
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen, sidebarAutoCollapsed: false })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen, sidebarAutoCollapsed: false }),
  collapseSidebarForViewport: () => set({ sidebarOpen: false, sidebarAutoCollapsed: true }),

  // The rail appearing takes 56px away from panes that were already sized
  // against them, so it settles the layout again rather than only recording a
  // number — a second server connecting is a resize in everything but name.
  setServerRailWidth: (serverRailWidth) => {
    if (get().serverRailWidth === serverRailWidth) return;
    set({ serverRailWidth });
    get().syncLayoutToViewport();
  },

  setSidebarWidth: (width) => {
    const sidebarWidth = clampSize(width, sidebarBounds(availableWidth(get().serverRailWidth)));
    writeStored(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    set({ sidebarWidth });
  },

  resetSidebarWidth: () => {
    writeStored(SIDEBAR_WIDTH_KEY, null);
    set((state) => ({
      sidebarWidth: clampSize(SIDEBAR_WIDTH.default, sidebarBounds(availableWidth(state.serverRailWidth))),
    }));
  },

  setComposerHeight: (height) => {
    const composerHeight = clampSize(height, composerBounds(window.innerHeight));
    writeStored(COMPOSER_HEIGHT_KEY, String(composerHeight));
    set({ composerHeight });
  },

  // Back to growing with the text, rather than to a fixed default height.
  resetComposerHeight: () => {
    writeStored(COMPOSER_HEIGHT_KEY, null);
    set({ composerHeight: null });
  },

  setContextualBarWidth: (width) =>
    set((state) => {
      const contextualBarWidth = clampSize(
        width,
        contextualBarBounds(availableWidth(state.serverRailWidth), state.sidebarOpen ? state.sidebarWidth : 0),
      );
      writeStored(CONTEXTUAL_BAR_WIDTH_KEY, String(contextualBarWidth));
      return { contextualBarWidth };
    }),

  resetContextualBarWidth: () =>
    set((state) => {
      writeStored(CONTEXTUAL_BAR_WIDTH_KEY, null);
      return {
        contextualBarWidth: clampSize(
          CONTEXTUAL_BAR_WIDTH.default,
          contextualBarBounds(availableWidth(state.serverRailWidth), state.sidebarOpen ? state.sidebarWidth : 0),
        ),
      };
    }),

  setEnterToSend: (enterToSend) => {
    writeStored(ENTER_TO_SEND_KEY, String(enterToSend));
    set({ enterToSend });
  },

  syncLayoutToViewport: () =>
    set((state) => {
      const viewportWidth = window.innerWidth;
      const available = availableWidth(state.serverRailWidth);
      const sidebar = sidebarForViewport(state, isMobileViewport(available));

      // Re-read rather than re-clamp what is already on screen: the list is
      // squeezed to its minimum at phone widths, and clamping *that* upwards
      // gives back nothing. Storage still holds the width the user dragged, so
      // a visit on a phone does not cost them their desktop layout.
      const bounds = sidebarBounds(available);
      const sidebarWidth =
        parseStoredSize(readStored(SIDEBAR_WIDTH_KEY), bounds) ?? clampSize(SIDEBAR_WIDTH.default, bounds);
      const composerHeight =
        state.composerHeight === null ? null : clampSize(state.composerHeight, composerBounds(window.innerHeight));
      // Clamped against the sidebar's *new* width — and against whether it is
      // still on screen at all — so shrinking the window resolves every pane in
      // one pass rather than leaving the bar sized against a room list that has
      // since given ground.
      const contextualBarWidth = clampSize(
        state.contextualBarWidth,
        contextualBarBounds(available, (sidebar?.sidebarOpen ?? state.sidebarOpen) ? sidebarWidth : 0),
      );

      // Nothing is written back: the size the user chose stays in storage, so
      // resizing the window down and back up does not cost them their layout.
      if (
        !sidebar &&
        viewportWidth === state.viewportWidth &&
        sidebarWidth === state.sidebarWidth &&
        composerHeight === state.composerHeight &&
        contextualBarWidth === state.contextualBarWidth
      ) {
        return state;
      }
      return { ...sidebar, viewportWidth, sidebarWidth, composerHeight, contextualBarWidth };
    }),

  startEditingMessage: (message) =>
    set((state) => {
      const drafts = { ...state.drafts };

      // Switching straight from one edit to another abandons the first, and its
      // slot goes with it rather than lingering for the life of the tab.
      if (state.editingMessage) {
        delete drafts[editDraftKey(state.editingMessage.roomId, state.editingMessage.messageId)];
      }

      // Seeded here rather than in the composer: the text has to be in place
      // before the box switches slots, or the first render shows it empty.
      drafts[editDraftKey(message.roomId, message.messageId)] = message.originalText;

      return { editingMessage: message, drafts };
    }),

  stopEditingMessage: () =>
    set((state) => {
      const { editingMessage } = state;
      if (!editingMessage) return state;

      const { [editDraftKey(editingMessage.roomId, editingMessage.messageId)]: _discarded, ...drafts } = state.drafts;
      return { editingMessage: null, drafts };
    }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  // Always written as a pair: an omitted deadline means the wait is over, and
  // leaving the old one behind would leave a countdown ticking into the past.
  setConnection: (connection, retryAt) => set({ connection, connectionRetryAt: retryAt ?? null }),

  setDraft: (roomId, text) => set((state) => ({ drafts: { ...state.drafts, [roomId]: text } })),

  clearDraft: (roomId) =>
    set((state) => {
      const { [roomId]: _removed, ...rest } = state.drafts;
      return { drafts: rest };
    }),

  setTyping: (roomKey, username, typing) =>
    set((state) => {
      const current = state.typing[roomKey] ?? [];
      const next = typing ? [...new Set([...current, username])] : current.filter((name) => name !== username);

      // Avoid a new array identity when nothing changed, or every typing
      // heartbeat would re-render the room.
      if (next.length === current.length && next.every((name, index) => name === current[index])) {
        return state;
      }

      return { typing: { ...state.typing, [roomKey]: next } };
    }),
}));
