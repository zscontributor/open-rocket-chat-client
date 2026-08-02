import type { ServerEventOf } from '@open-rocket-chat/client-sdk';
import { useCallback, useEffect, useRef } from 'react';

import { useSession } from '@/features/auth/use-session';
import { useRealtime } from '@/features/realtime/realtime-provider';
import { client } from '@/lib/client';
import { avatarAsPng } from './avatar-icon';
import { notificationsSupported, requestNotificationPermission, useNotificationAllowed } from './permission';
import { useNotificationPreferences } from './preferences';
import { dismissAfterMs, shouldAnnounce, shouldShowOnScreen, stripTags } from './rules';
import { playNotificationSound, shouldPlaySound, unlockNotificationSound } from './sound';

/**
 * Desktop notifications, ported from Rocket.Chat's own client.
 *
 * The division of labour is the important part. *Whether* a message deserves a
 * notification is settled upstream — Rocket.Chat weighs the subscription's
 * alert setting, mentions, the recipient's status and the workspace defaults,
 * then publishes a ready-made notification. Everything here is about the one
 * thing the server cannot know: what is on this screen right now.
 */

export type DesktopNotification = ServerEventOf<'notification'>;

/** Where the notification came from, as the app understands "where". */
export interface OpenConversation {
  serverId: string;
  roomId?: string;
}

interface NotifierOptions {
  /** The conversation on screen, so it can be left to speak for itself. */
  open: OpenConversation;
  /** Called when a notification is clicked, with the room it belongs to. */
  onOpenRoom: (serverId: string, roomId: string) => void;
}

const isOpenConversation = (event: DesktopNotification, open: OpenConversation): boolean =>
  event.serverId === open.serverId && event.payload.roomId === open.roomId;

/**
 * Raises the notification itself.
 *
 * Every input is read through a ref rather than closed over, so that changing a
 * preference — or the browser granting permission — does not tear down and
 * rebuild the realtime subscription underneath.
 */
const useNotify = ({ onOpenRoom }: NotifierOptions) => {
  const allowed = useNotificationAllowed();
  const requireInteraction = useNotificationPreferences((state) => state.requireInteraction);

  const latest = useRef({ allowed, requireInteraction, onOpenRoom });
  useEffect(() => {
    latest.current = { allowed, requireInteraction, onOpenRoom };
  });

  return useCallback((event: DesktopNotification, icon: string | undefined) => {
    const { allowed: isAllowed, requireInteraction: keepOnScreen, onOpenRoom: openRoom } = latest.current;
    if (!isAllowed) return;

    const { payload } = event;

    const notification = new Notification(event.title, {
      icon,
      body: stripTags(event.text),
      // The message id: a second tab, or a redelivery after a reconnect,
      // replaces the notification already on screen instead of stacking
      // another one on top of it.
      tag: payload.messageId,
      // The app plays its own sound, which respects the room's audio setting
      // and the volume in Settings. Leaving the browser's default on top of it
      // would announce the same message twice, a beat apart.
      silent: true,
      requireInteraction: keepOnScreen,
    });

    const dismissAfter = dismissAfterMs(event.duration, keepOnScreen);
    if (dismissAfter !== null) {
      setTimeout(() => notification.close(), dismissAfter);
    }

    notification.onclick = () => {
      notification.close();
      // The window may be behind another application entirely; raising it is
      // half of what clicking a notification is for.
      window.focus();
      openRoom(event.serverId, payload.roomId);
    };
  }, []);
};

/**
 * Applies the second of Rocket.Chat's two gates and finds an icon.
 *
 * The avatar is fetched into the page before being handed over — see
 * `avatarAsPng` for why a plain URL is not enough.
 */
const useDesktopNotification = (options: NotifierOptions) => {
  const notify = useNotify(options);
  const { data: session } = useSession();

  const latest = useRef({ open: options.open, session });
  useEffect(() => {
    latest.current = { open: options.open, session };
  });

  return useCallback(
    async (event: DesktopNotification) => {
      const { open, session: current } = latest.current;

      // The account being notified, which on a multi-server session is not
      // necessarily the one whose rooms are on screen.
      const account = current?.connections.find((connection) => connection.server.id === event.serverId);

      const allowed = shouldShowOnScreen({
        hasFocus: document.hasFocus(),
        isOpenRoom: isOpenConversation(event, open),
        status: account?.user.status,
      });
      if (!allowed) return;

      const avatarUrl = event.payload.sender?.avatarUrl;
      const icon = avatarUrl ? await avatarAsPng(client.forServer(event.serverId).mediaUrl(avatarUrl)) : undefined;

      notify(event, icon);
    },
    [notify],
  );
};

/**
 * The new-message sound, gated the way Rocket.Chat's `useNewMessageNotification`
 * gates it: on the room's own audio setting, and nothing else.
 */
const useNewMessageNotification = () => {
  const soundVolume = useNotificationPreferences((state) => state.soundVolume);

  const latest = useRef(soundVolume);
  useEffect(() => {
    latest.current = soundVolume;
  });

  return useCallback((sound: string | null) => {
    if (!shouldPlaySound(sound)) return;
    playNotificationSound(latest.current);
  }, []);
};

/**
 * Subscribes to the server's notifications for as long as the app is signed in.
 *
 * The gate here is Rocket.Chat's `useNotifyUser`: a message in the conversation
 * on screen is still announced unless the window has focus *and* the user asked
 * for focused conversations to stay quiet.
 */
const useNotifyUser = (options: NotifierOptions): void => {
  const connection = useRealtime();
  const showDesktopNotification = useDesktopNotification(options);
  const notifyNewMessage = useNewMessageNotification();
  const muteFocusedConversations = useNotificationPreferences((state) => state.muteFocusedConversations);

  const latest = useRef({ open: options.open, muteFocusedConversations });
  useEffect(() => {
    latest.current = { open: options.open, muteFocusedConversations };
  });

  useEffect(() => {
    if (!connection) return;

    return connection.on('notification', (event) => {
      const { open, muteFocusedConversations: muted } = latest.current;

      const announce = shouldAnnounce({
        hasFocus: document.hasFocus(),
        isOpenRoom: isOpenConversation(event, open),
        muteFocusedConversations: muted,
      });
      if (!announce) return;

      // Sound and banner are decided separately, as they are in Rocket.Chat:
      // the sound answers only to the room's audio setting, while the banner
      // still has the busy and open-room checks to pass. A busy account never
      // reaches here anyway — the server stops notifying it at the source.
      notifyNewMessage(event.payload.sound);
      void showDesktopNotification(event);
    });
  }, [connection, notifyNewMessage, showDesktopNotification]);
};

/**
 * Mounts desktop notifications. Renders nothing.
 *
 * Permission is asked for on the way in, as Rocket.Chat does: a browser that
 * has already answered resolves immediately without prompting, and one that
 * insists on a user gesture simply declines — Settings offers the same request
 * behind a button for exactly that case.
 */
export const DesktopNotifications = ({ open, onOpenRoom }: NotifierOptions) => {
  useNotifyUser({ open, onOpenRoom });

  useEffect(() => {
    if (!notificationsSupported()) return;
    void requestNotificationPermission();
  }, []);

  // Every interaction, not just the first: a gesture can be refused — the page
  // may still be loading the clip — and `unlockNotificationSound` costs nothing
  // once one of them has worked. Capture phase, so a handler that stops the
  // event from propagating cannot quietly cost the app its audio permission.
  useEffect(() => {
    const unlock = () => unlockNotificationSound();
    const options = { capture: true, passive: true } as const;

    window.addEventListener('pointerdown', unlock, options);
    window.addEventListener('keydown', unlock, options);
    return () => {
      window.removeEventListener('pointerdown', unlock, options);
      window.removeEventListener('keydown', unlock, options);
    };
  }, []);

  return null;
};
