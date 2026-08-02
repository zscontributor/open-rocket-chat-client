import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether the browser will let this app raise a desktop notification.
 *
 * A module-level store rather than component state because the answer is a
 * property of the browser, not of any one screen: Settings asks for permission,
 * the notifier reads it, and the browser itself can revoke it from the site
 * controls while both are mounted. Mirrors Rocket.Chat's `notificationManager`.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Not every context has the API: older Safari, and any insecure origin. */
export const notificationsSupported = (): boolean => typeof window !== 'undefined' && 'Notification' in window;

const browserPermission = (): NotificationPermission => (notificationsSupported() ? Notification.permission : 'denied');

let permission = browserPermission();

/**
 * Set once, and only after a real request: `navigator.permissions` is what
 * reports a permission being revoked from the site controls, which fires no
 * event on `Notification` itself.
 */
let watchingBrowserPermission = false;

const publish = (next: NotificationPermission): void => {
  if (permission === next) return;

  permission = next;
  for (const listener of [...listeners]) listener();
};

/** Re-reads the browser's answer, for callers that suspect it has moved. */
export const syncNotificationPermission = (): void => publish(browserPermission());

const watchBrowserPermission = async (): Promise<void> => {
  if (watchingBrowserPermission || !navigator.permissions) return;
  watchingBrowserPermission = true;

  try {
    const status = await navigator.permissions.query({ name: 'notifications' });
    status.onchange = () => publish(status.state === 'prompt' ? 'default' : status.state);
  } catch {
    // Some browsers reject the `notifications` descriptor. Permission still
    // works; only revocation goes unnoticed until something calls
    // `syncNotificationPermission` again.
    watchingBrowserPermission = false;
  }
};

/**
 * Asks the browser for permission, if it has not already answered.
 *
 * Safe to call when the answer is known: `requestPermission` resolves with the
 * standing decision without prompting, which is how a granted permission is
 * re-confirmed after a reload.
 */
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!notificationsSupported()) return 'denied';

  const response = await Notification.requestPermission();
  publish(response);
  void watchBrowserPermission();

  return response;
};

const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The browser's standing answer, kept in step with the site controls. */
export const useNotificationPermission = (): NotificationPermission =>
  useSyncExternalStore(
    useCallback(subscribe, []),
    () => permission,
    // Server-rendered output has no browser to ask, and nothing to show it on.
    () => 'denied' as NotificationPermission,
  );

/** Whether a notification raised right now would actually be shown. */
export const useNotificationAllowed = (): boolean => useNotificationPermission() === 'granted';
