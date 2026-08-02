import { create } from 'zustand';

/**
 * A panel in the contextual bar, with whatever it needs to render.
 *
 * A discriminated union rather than an id plus a loose parameter bag: a
 * `user-info` tab without a user is not a state the bar can be in, and the type
 * is what says so.
 */
export type ContextualTab =
  | { id: 'room-info' }
  | { id: 'room-edit' }
  | { id: 'members' }
  | { id: 'add-members' }
  | { id: 'user-info'; userId: string }
  | { id: 'files' }
  | { id: 'pinned' }
  | { id: 'starred' }
  | { id: 'mentions' }
  | { id: 'threads' }
  | { id: 'thread'; messageId: string }
  | { id: 'search' }
  | { id: 'notifications' }
  | { id: 'prune' }
  | { id: 'shortcuts' };

export type ContextualTabId = ContextualTab['id'];

interface ContextualBarStore {
  /**
   * The drill-down path. The last entry is what is on screen; anything before
   * it is where the back button goes. Empty means the bar is closed.
   *
   * A stack rather than a single tab because the panels genuinely nest —
   * Members opens a member, Room Info opens the edit form — and a back button
   * that guesses where it came from gets it wrong as soon as two paths lead to
   * the same panel.
   */
  stack: ContextualTab[];

  /** Replaces whatever was open. Used by the toolbar, which has no history. */
  open: (tab: ContextualTab) => void;
  /** Opens `tab` unless it is already the only thing open, in which case it closes. */
  toggle: (tab: ContextualTab) => void;
  /** Drills in, keeping the current panel as the back target. */
  push: (tab: ContextualTab) => void;
  back: () => void;
  close: () => void;
}

/** True when the two tabs address the same panel and the same subject. */
const sameTab = (left: ContextualTab, right: ContextualTab): boolean => {
  if (left.id !== right.id) return false;
  if (left.id === 'user-info' && right.id === 'user-info') return left.userId === right.userId;
  if (left.id === 'thread' && right.id === 'thread') return left.messageId === right.messageId;
  return true;
};

/**
 * One panel at a time, on the right-hand edge — Rocket.Chat's contextual bar.
 *
 * Kept out of the shared UI store for the same reason the room drawer is: it
 * belongs to one feature, and the pane's history is nobody else's business.
 */
export const useContextualBarStore = create<ContextualBarStore>((set, get) => ({
  stack: [],

  open: (tab) => set({ stack: [tab] }),

  toggle: (tab) => {
    const { stack } = get();
    // Only a top-level match closes: pressing Members while looking at a member
    // should take you back to the list, not dismiss the bar entirely.
    const current = stack[0];
    if (stack.length === 1 && current && sameTab(current, tab)) {
      set({ stack: [] });
      return;
    }
    set({ stack: [tab] });
  },

  push: (tab) =>
    set((state) => {
      const current = state.stack.at(-1);
      // Re-selecting the panel already on screen would stack it on itself and
      // leave a back button that appears to do nothing.
      if (current && sameTab(current, tab)) return state;
      return { stack: [...state.stack, tab] };
    }),

  back: () => set((state) => ({ stack: state.stack.slice(0, -1) })),

  close: () => set({ stack: [] }),
}));

/** The panel on screen, or `null` when the bar is closed. */
export const useCurrentTab = (): ContextualTab | null => useContextualBarStore((state) => state.stack.at(-1) ?? null);
