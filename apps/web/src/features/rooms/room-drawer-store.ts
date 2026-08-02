import { create } from 'zustand';

export type RoomDrawerState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; roomId: string };

interface RoomDrawerStore {
  drawer: RoomDrawerState;
  openRoomDrawer: (next: Exclude<RoomDrawerState, { mode: 'closed' }>) => void;
  closeRoomDrawer: () => void;
}

/**
 * Kept in its own store rather than the shared UI store: it is used by exactly
 * one feature, and a feature-local store is one fewer thing to reason about
 * when the sidebar and the drawer are edited independently.
 */
export const useRoomDrawerStore = create<RoomDrawerStore>((set) => ({
  drawer: { mode: 'closed' },
  openRoomDrawer: (next) => set({ drawer: next }),
  closeRoomDrawer: () => set({ drawer: { mode: 'closed' } }),
}));
