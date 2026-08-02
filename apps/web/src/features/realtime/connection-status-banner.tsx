import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRealtime } from '@/features/realtime/realtime-provider';
import { useUiStore } from '@/stores/ui-store';
import { Button } from '@/ui/button';
import { Icons, Spinner } from '@/ui/icon';

/**
 * How long the connection has to stay down before the banner appears.
 *
 * Opening the app and switching networks both produce a brief gap that resolves
 * itself, and a warning that flashes on every load teaches people to ignore the
 * one that matters. Rocket.Chat shows its bar the moment Meteor is not
 * connected; this waits for the gap to look real first.
 */
const GRACE_MS = 1_000;

const secondsUntil = (deadline: number, now: number): number => Math.max(0, Math.ceil((deadline - now) / 1000));

/** Seconds left before the connection retries by itself; `0` when none is due. */
const useCountdown = (retryAt: number | null): number => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (retryAt === null) return;

    // Sampled from a timer rather than read once here, because a clock is
    // exactly the "external system" an effect is meant to subscribe to. Four
    // times a second: a one-second tick drifts against the deadline it counts
    // to, and the number then sticks on a value for nearly two seconds, which
    // reads as a countdown that has frozen.
    const sample = () => setSeconds(secondsUntil(retryAt, Date.now()));
    const timer = setInterval(sample, 250);
    return () => clearInterval(timer);
  }, [retryAt]);

  // Never a leftover from the previous wait: with no deadline there is nothing
  // to count, whatever the last sample happened to be.
  return retryAt === null ? 0 : seconds;
};

/**
 * Whether the browser believes it has a network at all.
 *
 * Worth separating from the socket's own state: "you are offline" is something
 * the user can act on, where "connection lost" leaves them wondering whether it
 * is them or the server.
 */
const useOnline = (): boolean => {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
};

/** True once `active` has held for `delayMs`; false again the moment it drops. */
const useSettled = (active: boolean, delayMs: number): boolean => {
  const [elapsed, setElapsed] = useState(false);
  const [previous, setPrevious] = useState(active);

  // Adjusted during render rather than from an effect: React re-runs this
  // render with the new state before committing anything, so the reset never
  // reaches the screen as a frame of its own — where an effect would let one
  // stale frame paint first. https://react.dev/reference/react/useState
  if (previous !== active) {
    setPrevious(active);
    setElapsed(false);
  }

  useEffect(() => {
    if (!active) return;

    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return active && elapsed;
};

/**
 * Says that realtime is down, and offers to stop waiting for the backoff.
 *
 * Without this the app degrades in silence: rooms stop updating, typing
 * indicators stop, and nothing on screen says why — the only hint is a status
 * dot in the sidebar footer. Modelled on Rocket.Chat's connection status bar,
 * which pairs the state with a countdown to the next attempt and a button that
 * triggers one immediately.
 *
 * HTTP requests are unaffected while this is up: sending a message still works,
 * it is other people's messages that stop arriving.
 */
export const ConnectionStatusBanner = () => {
  const { t } = useTranslation('common');

  const connection = useRealtime();
  const status = useUiStore((state) => state.connection);
  const retryAt = useUiStore((state) => state.connectionRetryAt);

  const online = useOnline();
  const visible = useSettled(status !== 'connected', GRACE_MS);
  const seconds = useCountdown(retryAt);

  // Waiting out a backoff and trying right now are both `reconnecting`; the
  // deadline is what tells them apart. Only the wait is worth skipping, and
  // only it gets a live button.
  const attempting = status === 'connecting' || (status === 'reconnecting' && retryAt === null);
  // `closed` is terminal — the connection has been retired, and no button
  // press brings it back.
  const retired = status === 'closed';

  if (!visible) return null;

  // A browser that reports no network at all outranks whatever the socket is
  // doing: it is the one part of this the user can actually fix.
  const title = !online
    ? t('connection.banner.offline')
    : attempting
      ? t(status === 'connecting' ? 'connection.connecting' : 'connection.reconnecting')
      : t('connection.banner.lost');

  const detail = !online
    ? t('connection.banner.offlineHint')
    : retryAt !== null
      ? t('connection.banner.retryIn', { count: seconds })
      : t('connection.banner.hint');

  return (
    <div
      // Polite, not `alert`: the connection dropping is worth saying once it
      // has settled, and not worth interrupting whatever is being read.
      role="status"
      aria-live="polite"
      className="bg-warning/10 border-warning/40 text-content flex shrink-0 items-center gap-3 border-b px-4 py-2 text-sm"
    >
      {attempting ? (
        <Spinner className="text-warning size-[18px] shrink-0" />
      ) : (
        <Icons.error size={18} className="text-warning shrink-0" />
      )}

      <p className="min-w-0 flex-1">
        <span className="font-medium">{title}</span>{' '}
        {/* Held out of the live region above: a countdown that re-announced
            itself every second would talk over everything else. */}
        <span aria-live="off" className="text-content-secondary">
          {detail}
        </span>
      </p>

      <Button
        variant="primary"
        size="sm"
        className="shrink-0"
        disabled={attempting || retired}
        onClick={() => connection?.reconnect()}
      >
        {t('action.retry')}
      </Button>
    </div>
  );
};
