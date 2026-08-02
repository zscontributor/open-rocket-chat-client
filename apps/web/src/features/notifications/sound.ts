/**
 * The sound a new message makes, ported from Rocket.Chat's `CustomSoundProvider`.
 *
 * Rocket.Chat lets a workspace upload sounds and a person pick between them per
 * room; this client ships one. What survives the reduction is the part that
 * matters at the call site: a subscription set to `none` stays silent, and
 * anything else plays.
 */

/** Served from `public/`, so it is a plain path rather than a bundled import. */
export const NOTIFICATION_SOUND_URL = '/sounds/notification.mp3';

/**
 * `0`–`100` from the preference to the `0`–`1` an `<audio>` element wants.
 * Ported whole, clamping included: a stored value from a future version — or a
 * hand-edited one — must not throw when it is assigned to `audio.volume`.
 */
export const formatVolume = (volume: number): number => {
  const clamped = Math.max(0, Math.min(volume, 100));
  return Number((clamped / 100).toPrecision(2));
};

/**
 * Whether the subscription's audio choice permits a sound at all.
 *
 * `none` is Rocket.Chat's explicit silence for one room. A custom sound name is
 * a choice this client cannot honour — it has one sound — so it plays that one
 * rather than nothing: the person asked to be told about this room, and the
 * name of the tone is the lesser half of what they asked for.
 */
export const shouldPlaySound = (sound: string | null | undefined): boolean => sound !== 'none';

/**
 * The element is kept and rewound rather than replaced, which is what stops a
 * burst of ten messages from playing ten overlapping copies — Rocket.Chat calls
 * `stop()` before every `play()` for the same reason.
 */
let element: HTMLAudioElement | undefined;

/** Whether the browser has accepted a `play()` from this page yet. */
let unlocked = false;

/** So a browser that refuses playback says so once, rather than per message. */
let reported = false;

const audio = (): HTMLAudioElement => {
  if (!element) {
    element = new Audio(NOTIFICATION_SOUND_URL);
    // Fetched up front: the first notification is the one most likely to be
    // missed, and a clip this short would otherwise start after it mattered.
    element.preload = 'auto';
  }

  return element;
};

/**
 * Teaches the browser that this page is allowed to make noise.
 *
 * Autoplay policy refuses `play()` until the page has been interacted with, and
 * a notification arrives minutes after any click — by then the gesture is long
 * gone and playback is rejected with nothing to show for it. Playing the clip
 * muted *during* a real gesture spends that permission on the element, which
 * keeps it for every later call.
 *
 * Cheap to call on every click: it returns immediately once it has worked.
 */
export const unlockNotificationSound = (): void => {
  if (unlocked) return;

  const sound = audio();
  sound.muted = true;

  void sound
    .play()
    .then(() => {
      unlocked = true;
      sound.pause();
      sound.currentTime = 0;
    })
    .catch(() => {
      // Not yet — this gesture may have been the wrong kind, or the file is
      // still loading. The next click tries again.
    })
    .finally(() => {
      sound.muted = false;
    });
};

export const playNotificationSound = (volume: number): void => {
  const level = formatVolume(volume);
  // Muted is silent, and a muted element left playing would still hold the
  // browser's audio focus for the length of the clip.
  if (level === 0) return;

  const sound = audio();
  sound.muted = false;
  sound.volume = level;
  sound.currentTime = 0;

  void sound.play().catch((error: unknown) => {
    unlocked = false;
    if (reported) return;

    reported = true;
    // Said once, and only once. Silence with no explanation is the hardest
    // version of this to diagnose, and it is entirely the browser's decision.
    console.warn(
      '[notifications] the browser refused to play the notification sound; it usually allows it after the page is clicked',
      error,
    );
  });
};
