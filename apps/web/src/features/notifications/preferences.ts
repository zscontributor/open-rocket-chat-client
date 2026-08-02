import { create } from 'zustand';

/**
 * The two choices Rocket.Chat lets a person make about desktop notifications.
 *
 * Kept in this browser rather than on the account, unlike Rocket.Chat, because
 * the gateway exposes no user-preferences endpoint — and because both are
 * really about *this* machine: whether its notifications stay on screen, and
 * whether the conversation on its monitor should stay quiet.
 *
 * What is *worth* notifying about is not here. That decision belongs to the
 * server, which weighs the subscription's alert setting, mentions and the
 * workspace defaults before it publishes anything at all.
 */

const REQUIRE_INTERACTION_KEY = 'orc:notify-require-interaction';
const MUTE_FOCUSED_KEY = 'orc:notify-mute-focused';
const SOUND_VOLUME_KEY = 'orc:notify-sound-volume';

/** Storage is unavailable in some privacy modes; a lost preference is not worth failing over. */
const readStored = (key: string, fallback: boolean): boolean => {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === 'true';
  } catch {
    return fallback;
  }
};

const writeStored = (key: string, value: boolean | number): void => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Ignored — see readStored.
  }
};

/** A stored volume that is missing, corrupt or out of range falls back to full. */
const readStoredVolume = (key: string, fallback: number): number => {
  try {
    const stored = Number(localStorage.getItem(key));
    return Number.isFinite(stored) && stored >= 0 && stored <= 100 ? stored : fallback;
  } catch {
    return fallback;
  }
};

interface NotificationPreferencesState {
  /**
   * Keep notifications on screen until they are dismissed. Off by default, as
   * in Rocket.Chat: a stack of banners nobody clears is its own annoyance.
   */
  requireInteraction: boolean;
  /**
   * Stay silent about the conversation already on screen while the window has
   * focus. On by default, as in Rocket.Chat — a notification for a message
   * being read as it arrives tells nobody anything.
   */
  muteFocusedConversations: boolean;
  /**
   * How loud the new-message sound is, `0`–`100` as Rocket.Chat stores it.
   * Zero is the off switch: Rocket.Chat has no separate one either.
   */
  soundVolume: number;

  setRequireInteraction: (requireInteraction: boolean) => void;
  setMuteFocusedConversations: (muteFocusedConversations: boolean) => void;
  setSoundVolume: (soundVolume: number) => void;
}

export const useNotificationPreferences = create<NotificationPreferencesState>((set) => ({
  requireInteraction: readStored(REQUIRE_INTERACTION_KEY, false),
  muteFocusedConversations: readStored(MUTE_FOCUSED_KEY, true),
  soundVolume: readStoredVolume(SOUND_VOLUME_KEY, 100),

  setRequireInteraction: (requireInteraction) => {
    writeStored(REQUIRE_INTERACTION_KEY, requireInteraction);
    set({ requireInteraction });
  },

  setMuteFocusedConversations: (muteFocusedConversations) => {
    writeStored(MUTE_FOCUSED_KEY, muteFocusedConversations);
    set({ muteFocusedConversations });
  },

  setSoundVolume: (volume) => {
    const soundVolume = Math.max(0, Math.min(Math.round(volume), 100));
    writeStored(SOUND_VOLUME_KEY, soundVolume);
    set({ soundVolume });
  },
}));
