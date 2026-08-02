import { create } from 'zustand';

/**
 * Why an action this client still shows is not actually available.
 *
 * Rocket.Chat's own client removes these controls outright. Keeping them on
 * screen and explaining the refusal when they are pressed is the deliberate
 * difference: a control that quietly disappears teaches nobody that an
 * administrator switched the feature off, and the user is left thinking the
 * app has lost a feature it used to have.
 */
export type UnavailableReason =
  | 'createRoom'
  | 'createChannel'
  | 'createPrivate'
  | 'createDirect'
  | 'setReadOnly'
  | 'encryption'
  | 'changeRoomType'
  | 'changeAvatar';

interface FeatureNoticeState {
  /** The notice on screen, or `null` when none is. */
  reason: UnavailableReason | null;
  show: (reason: UnavailableReason) => void;
  dismiss: () => void;
}

export const useFeatureNoticeStore = create<FeatureNoticeState>((set) => ({
  reason: null,
  show: (reason) => set({ reason }),
  dismiss: () => set({ reason: null }),
}));

/**
 * Raises the notice from a click handler, so a call site does not have to
 * subscribe to the store merely to be able to open it.
 */
export const showFeatureNotice = (reason: UnavailableReason): void => useFeatureNoticeStore.getState().show(reason);
