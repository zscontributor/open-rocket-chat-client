import { create } from 'zustand';

/**
 * A message the timeline has been asked to show.
 *
 * The room is part of it because the request outlives the click: a jump asked
 * for while one room is open must not be answered by the next one, and the
 * timeline is the only component in a position to notice.
 */
export interface JumpTarget {
  roomId: string;
  messageId: string;
}

interface JumpStore {
  /** What has been asked for and not yet reached, or `null` when nothing is. */
  target: JumpTarget | null;
  jumpTo: (roomId: string, messageId: string) => void;
  /** Called by the timeline once it has arrived, or given up trying. */
  clear: () => void;
}

/**
 * Where the timeline is being sent, set by whatever is pointing at a message.
 *
 * A store rather than a prop because the two ends are in different trees: a
 * search result sits in the contextual bar, and the timeline it is naming is on
 * the other side of the room view. Threading a callback between them would
 * make every component in the path carry a concern that belongs to neither.
 */
export const useJumpStore = create<JumpStore>((set) => ({
  target: null,

  jumpTo: (roomId, messageId) => set({ target: { roomId, messageId } }),

  clear: () => set({ target: null }),
}));
