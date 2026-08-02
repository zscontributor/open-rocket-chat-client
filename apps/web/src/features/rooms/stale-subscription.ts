import { GatewayError } from '@open-rocket-chat/client-sdk';
import type { QueryClient } from '@tanstack/react-query';

import type { ServerKeys } from '@/lib/query';

/**
 * Refetches the sidebar list when the server says the user has no subscription
 * to the room they just acted on.
 *
 * Rocket.Chat answers `error-invalid-subscription` to anything that touches the
 * caller's own membership — favouriting, hiding, marking read — once that
 * membership is gone. It arrives without a realtime event when the removal
 * happened from another client or while this tab was asleep, so the row sits in
 * the sidebar and every action on it fails the same way. The error itself is
 * reported by the global handler in `lib/query.ts`; this only clears the stale
 * row behind it, so the toast is the last the user hears of that room.
 *
 * Deliberately narrow: a refused permission or an offline moment says nothing
 * about membership, and refetching the list on every failure would turn one
 * rejected action into a burst of requests.
 *
 * Lives outside `use-rooms` so it stays importable without the client and
 * server-scope modules, which need a browser to load.
 */
export const refetchOnStaleSubscription = (queryClient: QueryClient, keys: ServerKeys, error: unknown): void => {
  if (!(error instanceof GatewayError) || error.upstream !== 'error-invalid-subscription') return;

  void queryClient.invalidateQueries({ queryKey: keys.rooms });
};
