import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOBILE_BREAKPOINT, SERVER_RAIL_WIDTH } from '@/lib/resize';

// The store reads the viewport and localStorage as it is created, neither of
// which exists under the node test environment.
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 });
const stored = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => stored.set(key, value),
  removeItem: (key: string) => stored.delete(key),
});

type Store = typeof import('../ui-store');
let store: Store;

beforeAll(async () => {
  store = await import('../ui-store');
});

beforeEach(() => {
  store.useUiStore.setState({ editingMessage: null, drafts: {} });
});

const message = { roomId: 'room1', messageId: 'msg1', originalText: 'the original' };

describe('editing a message', () => {
  it('seeds a draft slot of its own, leaving what was being typed alone', () => {
    store.useUiStore.getState().setDraft('room1', 'half a sentence');
    store.useUiStore.getState().startEditingMessage(message);

    const { drafts, editingMessage } = store.useUiStore.getState();
    expect(editingMessage).toEqual(message);
    expect(drafts[store.editDraftKey('room1', 'msg1')]).toBe('the original');
    expect(drafts.room1).toBe('half a sentence');
  });

  it('gives the box back on cancel without touching the room draft', () => {
    store.useUiStore.getState().setDraft('room1', 'half a sentence');
    store.useUiStore.getState().startEditingMessage(message);
    store.useUiStore.getState().setDraft(store.editDraftKey('room1', 'msg1'), 'edited text');
    store.useUiStore.getState().stopEditingMessage();

    const { drafts, editingMessage } = store.useUiStore.getState();
    expect(editingMessage).toBeNull();
    expect(drafts[store.editDraftKey('room1', 'msg1')]).toBeUndefined();
    expect(drafts.room1).toBe('half a sentence');
  });

  it('drops the abandoned slot when one edit replaces another', () => {
    store.useUiStore.getState().startEditingMessage(message);
    store.useUiStore.getState().startEditingMessage({ ...message, messageId: 'msg2', originalText: 'another' });

    const { drafts, editingMessage } = store.useUiStore.getState();
    expect(editingMessage?.messageId).toBe('msg2');
    expect(drafts[store.editDraftKey('room1', 'msg1')]).toBeUndefined();
    expect(drafts[store.editDraftKey('room1', 'msg2')]).toBe('another');
  });

  it('is a no-op when nothing is being edited', () => {
    store.useUiStore.getState().setDraft('room1', 'untouched');
    store.useUiStore.getState().stopEditingMessage();

    expect(store.useUiStore.getState().drafts.room1).toBe('untouched');
  });
});

describe('the room list against the viewport', () => {
  const resizeTo = (innerWidth: number) => {
    window.innerWidth = innerWidth;
    store.useUiStore.getState().syncLayoutToViewport();
  };

  beforeEach(() => {
    stored.clear();
    window.innerWidth = 1440;
    store.useUiStore.setState({
      sidebarOpen: true,
      sidebarAutoCollapsed: false,
      viewportIsMobile: false,
      serverRailWidth: 0,
    });
  });

  it('collapses itself on a phone and comes back on a desktop', () => {
    resizeTo(390);
    expect(store.useUiStore.getState().sidebarOpen).toBe(false);
    expect(store.useUiStore.getState().viewportIsMobile).toBe(true);

    resizeTo(1440);
    expect(store.useUiStore.getState().sidebarOpen).toBe(true);
  });

  it('stays out of the way once the user has reopened it', () => {
    resizeTo(390);
    store.useUiStore.getState().setSidebarOpen(true);

    // The on-screen keyboard resizes the window; the drawer is not its business.
    resizeTo(390);
    expect(store.useUiStore.getState().sidebarOpen).toBe(true);
  });

  it('does not reopen a list the user had closed before the phone', () => {
    store.useUiStore.getState().toggleSidebar();
    resizeTo(390);
    resizeTo(1440);

    expect(store.useUiStore.getState().sidebarOpen).toBe(false);
  });

  it('collapses on the window from the reported broken header', () => {
    // 604px with a second server connected: the rail's 56px used to be counted
    // as room for the conversation, leaving the header without its room name.
    window.innerWidth = 604;
    store.useUiStore.getState().setServerRailWidth(SERVER_RAIL_WIDTH);

    expect(store.useUiStore.getState().viewportIsMobile).toBe(true);
    expect(store.useUiStore.getState().sidebarOpen).toBe(false);
  });

  it('collapses when a second server takes the width the list was sized against', () => {
    // Wide enough for the list beside the conversation, but not once the rail
    // appears — connecting a server is a resize in everything but name.
    window.innerWidth = MOBILE_BREAKPOINT + 20;
    store.useUiStore.getState().syncLayoutToViewport();
    expect(store.useUiStore.getState().sidebarOpen).toBe(true);

    store.useUiStore.getState().setServerRailWidth(SERVER_RAIL_WIDTH);
    expect(store.useUiStore.getState().sidebarOpen).toBe(false);
  });

  it('gives the dragged width back after a phone squeezed it to the minimum', () => {
    store.useUiStore.getState().setSidebarWidth(420);

    resizeTo(390);
    expect(store.useUiStore.getState().sidebarWidth).toBeLessThan(420);

    resizeTo(1440);
    expect(store.useUiStore.getState().sidebarWidth).toBe(420);
  });

  it('reopens one closed by picking a room on a phone', () => {
    resizeTo(390);
    store.useUiStore.getState().setSidebarOpen(true);
    store.useUiStore.getState().collapseSidebarForViewport();
    resizeTo(1440);

    expect(store.useUiStore.getState().sidebarOpen).toBe(true);
  });
});

describe('connection status', () => {
  it('drops the retry deadline once the wait is over', () => {
    // The banner counts down to this. Left behind, it would keep counting
    // towards an attempt that has already been made.
    const retryAt = Date.now() + 5_000;

    store.useUiStore.getState().setConnection('reconnecting', retryAt);
    expect(store.useUiStore.getState().connectionRetryAt).toBe(retryAt);

    store.useUiStore.getState().setConnection('connected');
    expect(store.useUiStore.getState().connectionRetryAt).toBeNull();
  });
});
