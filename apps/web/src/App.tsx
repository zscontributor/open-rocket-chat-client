import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LoginScreen } from '@/features/auth/login-screen';
import { connectionFor, useSession } from '@/features/auth/use-session';
import { MediaLightbox } from '@/features/media/lightbox';
import { DesktopNotifications } from '@/features/notifications/desktop-notifications';
import { PluginProvider } from '@/features/plugins/plugin-provider';
import { ConnectionStatusBanner } from '@/features/realtime/connection-status-banner';
import { RealtimeProvider } from '@/features/realtime/realtime-provider';
import { RoomDrawer } from '@/features/rooms/room-drawer';
import { RoomView } from '@/features/rooms/room-view';
import { Sidebar } from '@/features/rooms/sidebar';
import { FeatureNoticeDialog } from '@/features/server/feature-notice';
import { AddServerDialog } from '@/features/servers/add-server-dialog';
import { ServerRail } from '@/features/servers/server-rail';
import { ServerScope } from '@/features/servers/server-scope';
import { resolveActiveServerId, useServerStore } from '@/features/servers/server-store';
import { SettingsDialog } from '@/features/settings/settings-dialog';
import { useThemeStore } from '@/features/theme/theme-store';
import { useUiStore } from '@/stores/ui-store';
import { Icons, IconProvider, Spinner } from '@/ui/icon';
import { Toaster } from '@/ui/toast';

interface Route {
  /** The server named in the URL, if any. Absent on a legacy `/rooms/…` link. */
  serverId?: string;
  roomId?: string;
}

/**
 * Selection lives in the URL so conversations can be linked and the back
 * button behaves. A two-view app does not need a routing library for this; one
 * can be introduced when settings and admin screens get their own routes.
 *
 * The server is part of the path because room ids are only unique within one
 * Rocket.Chat server: `/rooms/abc` alone is ambiguous once the client is
 * connected to several. Links written before multi-server still resolve — they
 * simply open against whichever server is active.
 */
const routeFromLocation = (): Route => {
  const { pathname } = window.location;

  const scoped = /^\/servers\/([^/]+)(?:\/rooms\/([^/]+))?/.exec(pathname);
  if (scoped?.[1]) {
    return {
      serverId: decodeURIComponent(scoped[1]),
      ...(scoped[2] ? { roomId: decodeURIComponent(scoped[2]) } : {}),
    };
  }

  const legacy = /^\/rooms\/([^/]+)/.exec(pathname);
  return legacy?.[1] ? { roomId: decodeURIComponent(legacy[1]) } : {};
};

const useAppRoute = () => {
  const [route, setRoute] = useState(routeFromLocation);

  useEffect(() => {
    const onPopState = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((next: Route) => {
    const path = next.serverId
      ? `/servers/${encodeURIComponent(next.serverId)}${next.roomId ? `/rooms/${encodeURIComponent(next.roomId)}` : ''}`
      : '/';

    window.history.pushState(null, '', path);
    setRoute(next);
  }, []);

  return { route, navigate };
};

/**
 * A sidebar or message box sized in a large window would crowd out everything
 * else once that window is made small, so the limits are re-applied on resize —
 * as is the room list's collapse on a viewport too narrow to hold both it and
 * the conversation.
 */
const useViewportLimits = () => {
  const sync = useUiStore((state) => state.syncLayoutToViewport);

  useEffect(() => {
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [sync]);
};

/** Applies the chosen theme and keeps it in step with the OS preference. */
const useTheme = () => {
  const preference = useThemeStore((state) => state.preference);
  const themeId = useThemeStore((state) => state.themeId);
  const apply = useThemeStore((state) => state.apply);

  useEffect(() => {
    apply();

    if (preference !== 'system') return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [apply, preference, themeId]);
};

export const App = () => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');

  const { data: session, isLoading } = useSession();
  const { route, navigate } = useAppRoute();
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const viewportIsMobile = useUiStore((state) => state.viewportIsMobile);
  const collapseSidebar = useUiStore((state) => state.collapseSidebarForViewport);
  const preferredServerId = useServerStore((state) => state.preferredServerId);
  const setPreferredServer = useServerStore((state) => state.setPreferredServer);

  useTheme();
  useViewportLimits();

  if (isLoading) {
    return (
      <div className="bg-sunken text-content-muted flex h-full items-center justify-center gap-2 text-sm">
        <Spinner className="size-4" /> {tCommon('connection.connecting')}
      </div>
    );
  }

  if (!session) {
    return (
      <IconProvider>
        <LoginScreen />
        {/* Signing in to a second server happens from a dialog here, and its
            failures have nowhere else to go. */}
        <Toaster />
      </IconProvider>
    );
  }

  // The URL wins over the remembered choice, so a shared link opens on the
  // server it names; both are ignored if the session is not signed in to it.
  const activeServerId = resolveActiveServerId(
    session.connections.map((connection) => connection.server.id),
    session.defaultServerId,
    route.serverId ?? preferredServerId,
  );

  const connection = connectionFor(session, activeServerId);
  if (!connection) {
    // Every connection was dropped between the query resolving and this
    // render; the session query will settle on `null` and show the login.
    return null;
  }

  // Only when the URL's room can belong to the server on screen. A link naming
  // a server the session is not signed in to falls back to the active one
  // above, and carrying its room across would look that id up on a server that
  // never issued it — the same mistake `selectServer` avoids. A legacy
  // `/rooms/…` link names no server at all and is resolved against whichever
  // one is active, as it always was.
  const roomId = !route.serverId || route.serverId === activeServerId ? route.roomId : undefined;

  const selectRoom = (next: string) => {
    navigate({ serverId: activeServerId, roomId: next });
    // On a phone the room list is a drawer over the conversation, so leaving it
    // open would hide the room that was just asked for.
    if (viewportIsMobile) collapseSidebar();
  };

  const selectServer = (next: string) => {
    setPreferredServer(next);
    // Deliberately without a room: an id from the previous server means
    // nothing on this one, and would only produce a "not found" view.
    navigate({ serverId: next });
  };

  // A notification can be about any server the session is signed in to, so
  // clicking one may have to switch server *and* room. Unlike `selectServer`
  // that keeps the room, because here the room is the whole point.
  const openFromNotification = (serverId: string, next: string) => {
    setPreferredServer(serverId);
    navigate({ serverId, roomId: next });
    if (viewportIsMobile) collapseSidebar();
  };

  return (
    <IconProvider>
      {/* Outside the server scope: one socket carries every server, and
          remounting it on each switch would cost a reconnect. */}
      <RealtimeProvider enabled>
        {/* Outside the server scope as well: the server pushes notifications
            for every account the session holds, not only the one on screen. */}
        <DesktopNotifications open={{ serverId: activeServerId, roomId }} onOpenRoom={openFromNotification} />

        <ServerScope connection={connection}>
          <PluginProvider>
            <div className="bg-app flex h-full flex-col">
              {/* In the flow rather than floating over the app: it appears
                  without warning, and an overlay would land on the room header
                  and its actions. */}
              <ConnectionStatusBanner />

              <div className="flex min-h-0 flex-1">
                <ServerRail connections={session.connections} activeServerId={activeServerId} onSelect={selectServer} />

                {/* Always mounted: it animates between its full width and a rail, and
                a component that unmounts cannot animate its way out. */}
                <Sidebar
                  key={activeServerId}
                  activeRoomId={roomId}
                  onSelectRoom={selectRoom}
                  onOpenSettings={() => setSettingsOpen(true)}
                />

                {roomId ? (
                  <RoomView key={`${activeServerId}:${roomId}`} roomId={roomId} onOpenRoom={selectRoom} />
                ) : (
                  <div className="text-content-muted flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                    <Icons.direct size={40} className="opacity-40" />
                    <div>
                      <p className="text-content text-sm font-medium">{t('placeholder.noRoom')}</p>
                      <p className="mt-1 text-sm">{t('placeholder.noRoomHint')}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <RoomDrawer />
            <SettingsDialog />
            <MediaLightbox />
            <AddServerDialog />
            {/* After the drawer: it explains a control inside it, so it has to
                paint on top rather than behind. */}
            <FeatureNoticeDialog />
            {/* Last, so it paints over the drawers and dialogs above rather
                than under them. */}
            <Toaster />
          </PluginProvider>
        </ServerScope>
      </RealtimeProvider>
    </IconProvider>
  );
};
