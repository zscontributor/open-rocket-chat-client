import { GatewayError, NetworkError } from '@open-rocket-chat/client-sdk';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { serverKeys } from '@/lib/query';
import { refetchOnStaleSubscription } from '../stale-subscription';

const keys = serverKeys('server-1');

let queryClient: QueryClient;
let invalidate: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  queryClient = new QueryClient();
  invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
});

describe('refetchOnStaleSubscription', () => {
  it('refetches the room list when the subscription is gone', () => {
    const error = new GatewayError(
      'bad_request',
      'You must be part of a room to favorite it [error-invalid-subscription]',
      400,
      'error-invalid-subscription',
    );

    refetchOnStaleSubscription(queryClient, keys, error);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.rooms });
  });

  /**
   * A rejected permission or an offline moment says nothing about membership,
   * and refetching the sidebar on every failure would turn one refused action
   * into a burst of requests.
   */
  it('leaves the list alone for any other failure', () => {
    refetchOnStaleSubscription(queryClient, keys, new GatewayError('forbidden', 'nope', 403, 'error-not-allowed'));
    refetchOnStaleSubscription(queryClient, keys, new GatewayError('bad_request', 'nope', 400));
    refetchOnStaleSubscription(queryClient, keys, new NetworkError('offline'));
    refetchOnStaleSubscription(queryClient, keys, undefined);

    expect(invalidate).not.toHaveBeenCalled();
  });
});
