import { create } from 'zustand';

export type ToastTone = 'error' | 'success';

/**
 * Which corner a notice is anchored to.
 *
 * Bottom-left is the default because that is the corner the app keeps clear;
 * see {@link Toaster}. Sign-in is the exception: it happens on a screen with no
 * composer to cover, and the outcome is expected on the right.
 */
export type ToastPlacement = 'bottom-left' | 'bottom-right';

export interface Toast {
  id: string;
  tone: ToastTone;
  /** Already translated: the store holds sentences, not keys. */
  message: string;
  /** Optional context above the message, e.g. what was being attempted. */
  title?: string;
  /** How long it stays up. `0` keeps it until dismissed. */
  durationMs: number;
  placement: ToastPlacement;
}

export type ToastInput = Omit<Toast, 'id' | 'durationMs' | 'placement'> & {
  durationMs?: number;
  placement?: ToastPlacement;
};

/**
 * Long enough to read a sentence about why something was refused. Success
 * notices are shorter because they only confirm what the user just did.
 */
const DEFAULT_DURATION_MS: Record<ToastTone, number> = {
  error: 8_000,
  success: 4_000,
};

/**
 * Beyond this the stack covers the composer, which is usually where the user
 * has to go to recover from whatever failed.
 */
const MAX_VISIBLE = 3;

/**
 * Ids are a counter rather than `crypto.randomUUID`: they never leave the tab,
 * and a predictable sequence keeps the store's tests readable.
 */
let nextId = 0;

interface ToastState {
  toasts: Toast[];
  /** Returns the id, so a caller can dismiss its own notice early. */
  show: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const isSame = (toast: Toast, input: ToastInput): boolean =>
  toast.tone === input.tone &&
  toast.message === input.message &&
  toast.title === input.title &&
  toast.placement === (input.placement ?? 'bottom-left');

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (input) => {
    // A failure that repeats — pressing a disabled action twice, or ten
    // reactions rejected by the same permission — should not bury the screen in
    // copies of one sentence.
    const existing = get().toasts.find((toast) => isSame(toast, input));
    if (existing) return existing.id;

    const toast: Toast = {
      ...input,
      id: `toast-${(nextId += 1)}`,
      durationMs: input.durationMs ?? DEFAULT_DURATION_MS[input.tone],
      placement: input.placement ?? 'bottom-left',
    };

    set((state) => ({ toasts: [...state.toasts, toast].slice(-MAX_VISIBLE) }));
    return toast.id;
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  clear: () => set({ toasts: [] }),
}));

/**
 * Raises a toast from outside React — the global mutation handler in
 * `lib/query.ts` is not a component and has no hook to call.
 */
export const showToast = (toast: ToastInput): string => useToastStore.getState().show(toast);
