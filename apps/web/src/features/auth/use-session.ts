import {
  GatewayError,
  NetworkError,
  type LoginService,
  type ServerConnection,
  type Session,
} from '@open-rocket-chat/client-sdk';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import i18next from 'i18next';

import { useServerStore } from '@/features/servers/server-store';
import { client } from '@/lib/client';
import { clearPersistedCache } from '@/lib/persist';
import { queryKeys, serverKeys, SERVER_SCOPE_ROOT } from '@/lib/query';
import { showToast } from '@/stores/toast-store';
import { OAuthError, requestOAuthCredential } from './oauth';

/**
 * The current session, or `null` when signed out.
 *
 * A 401 is a normal answer here, not an error — it is how the app learns to
 * show the login screen — so it is mapped to `null` rather than thrown.
 */
export const useSession = () =>
  useQuery<Session | null>({
    queryKey: queryKeys.session,
    queryFn: async () => {
      try {
        return await client.auth.session();
      } catch (error) {
        if (error instanceof GatewayError && error.isUnauthenticated) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });

/**
 * The Rocket.Chat servers this gateway fronts.
 *
 * Public, so the login screen can offer a picker before any credentials exist.
 * A gateway configured with one server returns one entry, and the picker
 * hides itself.
 */
export const useServers = () =>
  useQuery({
    queryKey: queryKeys.servers,
    queryFn: () => client.auth.servers(),
    // Fixed at gateway boot; refetching per visit buys nothing.
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });

/**
 * Why a sign-in was refused, in the user's language.
 *
 * Translated through i18next directly rather than a component's `t`, because
 * the mutation's own handlers run this after the form that fired them may
 * already have unmounted. Shared with that form, so the sentence beside the
 * button and the one in the toast can never disagree.
 */
export const describeLoginError = (error: unknown): string => {
  if (error instanceof OAuthError) return i18next.t(`error.oauth.${error.reason}`, { ns: 'auth' });
  if (error instanceof NetworkError) return i18next.t('error.unreachable', { ns: 'auth' });
  if (error instanceof GatewayError && error.isUnauthenticated) {
    return i18next.t('error.invalidCredentials', { ns: 'auth' });
  }
  return i18next.t('error.generic', { ns: 'auth' });
};

/**
 * What both sign-in routes do once the gateway has answered with a session.
 *
 * The server just signed in to also becomes the active one — somebody who went
 * to the trouble of authenticating against it means to use it.
 */
const adoptSession = (
  queryClient: QueryClient,
  setPreferredServer: (serverId: string) => void,
  session: Session,
  requestedServerId: string | undefined,
): void => {
  const serverId = requestedServerId ?? session.defaultServerId;
  queryClient.setQueryData(queryKeys.session, session);
  setPreferredServer(serverId);

  // Bottom right, unlike the rest of the app: the login screen has no
  // composer down there, and the dialog that adds a server closes on
  // success — so the toast is the only thing left saying it worked.
  const name = connectionFor(session, serverId)?.server.name;
  showToast({
    tone: 'success',
    placement: 'bottom-right',
    message: name
      ? i18next.t('toast.signedIn', { ns: 'auth', name })
      : i18next.t('toast.signedInPlain', { ns: 'auth' }),
  });
};

/** A sign-in the user abandoned is not worth a toast. */
const reportLoginError = (error: unknown): void => {
  // A two-factor prompt arrives as a rejection, but it is the next step of
  // the sign-in rather than a failure — the form asks for the code instead.
  if (error instanceof GatewayError && error.needsTwoFactor) return;
  if (error instanceof OAuthError && error.reason === 'cancelled') return;

  showToast({ tone: 'error', placement: 'bottom-right', message: describeLoginError(error) });
};

/**
 * Signs in to a server.
 *
 * With a session already established this *adds* a server rather than
 * replacing one, which is how the app ends up connected to several at once.
 * The server just signed in to also becomes the active one — somebody who
 * enters credentials for it means to use it.
 */
export const useLogin = ({ onSuccess }: { onSuccess?: (session: Session) => void } = {}) => {
  const queryClient = useQueryClient();
  const setPreferredServer = useServerStore((state) => state.setPreferredServer);

  return useMutation({
    mutationFn: (input: { user: string; password: string; totpCode?: string; serverId?: string }) =>
      client.auth.login(input),
    // The form turns a rejection into a field-level message, and a two-factor
    // prompt is not a failure at all — it is the next step of the sign-in.
    meta: { silentError: true },
    // Declared here rather than passed to `mutate`: signing in changes what the
    // caller renders, and per-call callbacks are dropped when the component
    // that fired them unmounts first. That is exactly what happens to the
    // "add a server" dialog, whose form disappears the moment the session
    // gains the server it was signing in to.
    onSuccess: (session, input) => {
      adoptSession(queryClient, setPreferredServer, session, input.serverId);
      onSuccess?.(session);
    },
    onError: reportLoginError,
  });
};

/**
 * Signs in through one of the server's OAuth providers.
 *
 * Two steps that have to stay together: the browser runs the provider
 * handshake against Rocket.Chat itself — the gateway holds no client secret
 * and takes no part in it — and only the resulting credential pair is handed
 * to the gateway, which redeems it for the same session a password produces.
 */
export const useOAuthLogin = ({ onSuccess }: { onSuccess?: (session: Session) => void } = {}) => {
  const queryClient = useQueryClient();
  const setPreferredServer = useServerStore((state) => state.setPreferredServer);

  return useMutation({
    mutationFn: async ({ service, serverId }: { service: LoginService; serverId?: string }) => {
      const credential = await requestOAuthCredential(service);
      return client.auth.loginWithOAuth({ ...credential, ...(serverId ? { serverId } : {}) });
    },
    // The form shows the reason beside the buttons, as it does for a password.
    meta: { silentError: true },
    onSuccess: (session, input) => {
      adoptSession(queryClient, setPreferredServer, session, input.serverId);
      onSuccess?.(session);
    },
    onError: reportLoginError,
  });
};

/**
 * Signs out of one server, or of every server when called with no argument.
 *
 * Disconnecting one server drops only that server's cache: the other
 * connections are still live, and evicting their rooms would blank a UI that
 * is still perfectly usable.
 */
export const useLogout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serverId?: string) => client.auth.logout(serverId),
    onSettled: (remaining, _error, serverId) => {
      if (serverId && remaining) {
        queryClient.setQueryData(queryKeys.session, remaining);
        queryClient.removeQueries({ queryKey: serverKeys(serverId).all });
        return;
      }

      // Clear unconditionally: if the upstream logout failed, the local session
      // is still gone and keeping cached rooms on screen would be misleading.
      queryClient.setQueryData(queryKeys.session, null);
      queryClient.removeQueries({ queryKey: [SERVER_SCOPE_ROOT] });
      // Two accounts on one machine must not see each other's rooms, and the
      // in-memory cache alone would leave the IndexedDB copy behind.
      void clearPersistedCache();
    },
  });
};

/** The session's connection to one server, if it has one. */
export const connectionFor = (session: Session | null | undefined, serverId: string): ServerConnection | undefined =>
  session?.connections.find((connection) => connection.server.id === serverId);
