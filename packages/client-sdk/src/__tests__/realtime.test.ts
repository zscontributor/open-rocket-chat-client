import { describe, expect, it, vi } from 'vitest';

import { GatewayError } from '../errors.js';
import { RealtimeConnection } from '../realtime.js';

type Listener = (event: unknown) => void;

/** A scriptable stand-in for the browser `WebSocket`. */
class FakeSocket {
  static instances: FakeSocket[] = [];

  readyState = 0;

  readonly sent: string[] = [];

  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    let bucket = this.listeners.get(type);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(type, bucket);
    }
    bucket.add(listener);
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = 3;
    this.emit('close', {});
  }

  // --- test controls -------------------------------------------------------

  open(): void {
    this.readyState = 1;
    this.emit('open', {});
  }

  receive(event: unknown): void {
    this.emit('message', { data: JSON.stringify(event) });
  }

  commands(): any[] {
    return this.sent.map((payload) => JSON.parse(payload));
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const fakeWebSocket = FakeSocket as unknown as typeof WebSocket;

/** Mirrors `MIN_RECONNECT_DELAY_MS` in the module under test. */
const MIN_RECONNECT_DELAY_MS = 500;

const newConnection = (onStatusChange?: (status: string, info: { retryAt?: number }) => void) => {
  FakeSocket.instances = [];
  return new RealtimeConnection({
    baseUrl: 'http://gateway.test',
    webSocketImpl: fakeWebSocket,
    ...(onStatusChange ? { onStatusChange } : {}),
  });
};

const ready = (socket: FakeSocket) => {
  socket.open();
  socket.receive({ type: 'connection.ready', protocolVersion: 1, userId: 'u1', serverId: 'default' });
};

describe('RealtimeConnection', () => {
  it('derives the WebSocket URL from the gateway origin', () => {
    const connection = newConnection();
    connection.connect();

    expect(FakeSocket.instances[0]?.url).toBe('ws://gateway.test/ws');
    connection.close();
  });

  it('reports connected once the gateway says it is ready', () => {
    const statuses: string[] = [];
    const connection = newConnection((status) => statuses.push(status));

    connection.connect();
    ready(FakeSocket.instances[0]!);

    expect(statuses).toEqual(['connecting', 'connected']);
    connection.close();
  });

  it('reopens after disconnect', () => {
    // React remounts a provider on every StrictMode pass; a connection that
    // could only be closed once would leave the app silently without realtime.
    const connection = newConnection();

    connection.connect();
    ready(FakeSocket.instances[0]!);
    connection.disconnect();

    connection.connect();
    expect(FakeSocket.instances).toHaveLength(2);

    ready(FakeSocket.instances[1]!);
    expect(connection.currentStatus).toBe('connected');
    connection.close();
  });

  it('stays shut after close', () => {
    const connection = newConnection();
    connection.connect();
    ready(FakeSocket.instances[0]!);

    connection.close();
    connection.connect();

    expect(FakeSocket.instances).toHaveLength(1);
    expect(connection.currentStatus).toBe('closed');
  });

  it('does not reconnect after a deliberate disconnect', async () => {
    const connection = newConnection();
    connection.connect();
    ready(FakeSocket.instances[0]!);

    connection.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(FakeSocket.instances).toHaveLength(1);
    connection.close();
  });

  it('reconnects and restores watched rooms after an unexpected drop', async () => {
    const connection = newConnection();
    connection.connect();

    const first = FakeSocket.instances[0]!;
    ready(first);
    connection.subscribeRoom('acme', 'room-1');
    connection.subscribeRoom('contoso', 'room-2');

    // Server-side drop, as opposed to `disconnect()`.
    first.readyState = 3;
    first.close();

    await vi.waitFor(() => expect(FakeSocket.instances.length).toBe(2), { timeout: 2_000 });

    const second = FakeSocket.instances[1]!;
    second.open();

    const subscribed = second
      .commands()
      .filter((command) => command.type === 'room.subscribe')
      .map((command) => `${command.serverId}/${command.roomId}`);

    expect(subscribed).toEqual(['acme/room-1', 'contoso/room-2']);
    connection.close();
  });

  it('keeps backing off when the socket opens but never goes ready', async () => {
    // The gateway completes the handshake before it attaches to Rocket.Chat,
    // and closes the socket again if that attach fails. Treating `open` as
    // success pinned the delay at its half-second minimum, so an unreachable
    // upstream produced an unbounded stream of reconnects rather than a backoff.
    vi.useFakeTimers();

    try {
      const connection = newConnection();
      connection.connect();

      const delays: number[] = [];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const socket = FakeSocket.instances.at(-1)!;
        socket.open();
        socket.readyState = 3;
        socket.close();

        const delay = connection.retryAt! - Date.now();
        delays.push(delay);
        await vi.advanceTimersByTimeAsync(Math.ceil(delay) + 1);
      }

      expect(FakeSocket.instances).toHaveLength(5);
      expect(delays.at(-1)).toBeGreaterThan(delays[0]! * 4);

      connection.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets the backoff once the gateway says it is ready', async () => {
    vi.useFakeTimers();

    try {
      const connection = newConnection();
      connection.connect();

      const first = FakeSocket.instances[0]!;
      first.open();
      first.readyState = 3;
      first.close();

      const beforeRecovery = connection.retryAt! - Date.now();
      await vi.advanceTimersByTimeAsync(Math.ceil(beforeRecovery) + 1);

      // A connection that actually worked earns a fresh budget, so the next
      // unrelated outage is not punished for the previous one.
      const second = FakeSocket.instances[1]!;
      ready(second);
      second.readyState = 3;
      second.close();

      expect(connection.retryAt! - Date.now()).toBeLessThan(MIN_RECONNECT_DELAY_MS);

      connection.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('publishes when the next automatic attempt is due', () => {
    // Without the deadline a client can say "reconnecting" but not whether
    // anything is about to happen, and at the maximum backoff that silence
    // lasts fifteen seconds.
    const changes: { status: string; retryAt?: number }[] = [];
    const connection = newConnection((status, info) => changes.push({ status, ...info }));

    connection.connect();
    const first = FakeSocket.instances[0]!;
    ready(first);

    first.readyState = 3;
    first.close();

    const waiting = changes.at(-1)!;
    expect(waiting.status).toBe('reconnecting');
    expect(waiting.retryAt).toBeGreaterThan(Date.now());
    expect(connection.retryAt).toBe(waiting.retryAt);

    connection.close();
  });

  it('retries at once when asked, instead of waiting out the backoff', async () => {
    const changes: { status: string; retryAt?: number }[] = [];
    const connection = newConnection((status, info) => changes.push({ status, ...info }));

    connection.connect();
    const first = FakeSocket.instances[0]!;
    ready(first);

    first.readyState = 3;
    first.close();
    expect(connection.retryAt).toBeDefined();

    connection.reconnect();

    // Opened immediately rather than when the timer would have fired, and the
    // deadline is withdrawn so nothing counts down to an attempt already made.
    expect(FakeSocket.instances).toHaveLength(2);
    expect(connection.retryAt).toBeUndefined();
    expect(changes.at(-1)).toEqual({ status: 'reconnecting' });

    // The cancelled timer must not fire on top of the attempt it replaced.
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(FakeSocket.instances).toHaveLength(2);

    connection.close();
  });

  it('leaves an attempt already in flight alone', () => {
    // A second click while the socket is opening would tear down a connection
    // that was about to succeed.
    const connection = newConnection();
    connection.connect();

    connection.reconnect();

    expect(FakeSocket.instances).toHaveLength(1);
    connection.close();
  });

  it('dispatches events only to handlers for that type', () => {
    const connection = newConnection();
    connection.connect();
    const socket = FakeSocket.instances[0]!;
    ready(socket);

    const created: unknown[] = [];
    const deleted: unknown[] = [];
    connection.on('message.created', (event) => created.push(event));
    connection.on('message.deleted', (event) => deleted.push(event));

    socket.receive({
      type: 'message.deleted',
      serverId: 'acme',
      roomId: 'room-1',
      messageId: 'm1',
    });

    expect(created).toHaveLength(0);
    expect(deleted).toHaveLength(1);
    connection.close();
  });

  it('drops events that do not match the contract', () => {
    const connection = newConnection();
    connection.connect();
    const socket = FakeSocket.instances[0]!;
    ready(socket);

    const seen: unknown[] = [];
    connection.on('message.deleted', (event) => seen.push(event));

    // A gateway on a newer protocol could send something we cannot model;
    // ignoring it beats crashing the timeline.
    socket.receive({ type: 'message.deleted', serverId: 'acme', roomId: 'room-1' });
    socket.receive('not json at all');

    expect(seen).toHaveLength(0);
    connection.close();
  });

  it('subscribes once per room and unsubscribes on the last release', () => {
    const connection = newConnection();
    connection.connect();
    const socket = FakeSocket.instances[0]!;
    ready(socket);

    const release = connection.subscribeRoom('acme', 'room-1');
    connection.subscribeRoom('acme', 'room-1');

    expect(socket.commands().filter((command) => command.type === 'room.subscribe')).toHaveLength(1);

    release();
    expect(socket.commands().filter((command) => command.type === 'room.unsubscribe')).toHaveLength(1);
    connection.close();
  });

  it('keeps identical room ids on different servers apart', () => {
    const connection = newConnection();
    connection.connect();
    const socket = FakeSocket.instances[0]!;
    ready(socket);

    // Rocket.Chat ids are unique per server, so this collision is expected in
    // any real multi-server session.
    const releaseAcme = connection.subscribeRoom('acme', 'shared-id');
    connection.subscribeRoom('contoso', 'shared-id');

    expect(socket.commands().filter((command) => command.type === 'room.subscribe')).toHaveLength(2);

    releaseAcme();

    // Releasing one must not silence the other server's room.
    const unsubscribed = socket.commands().filter((command) => command.type === 'room.unsubscribe');
    expect(unsubscribed).toHaveLength(1);
    expect(unsubscribed[0]?.serverId).toBe('acme');
    connection.close();
  });

  it('discards commands sent while offline rather than queueing them', () => {
    const connection = newConnection();
    connection.connect();

    // Still handshaking: typing is not worth replaying once connected.
    connection.setTyping('acme', 'room-1', true);

    expect(FakeSocket.instances[0]?.sent).toHaveLength(0);
    connection.close();
  });
});

describe('GatewayError', () => {
  it('carries the gateway error code', () => {
    const error = GatewayError.fromResponse(401, {
      error: { code: 'totp_required', message: 'A two-factor authentication code is required' },
    });

    expect(error.code).toBe('totp_required');
    expect(error.needsTwoFactor).toBe(true);
    expect(error.isUnauthenticated).toBe(false);
  });

  it('falls back when the body is not the contract error shape', () => {
    const error = GatewayError.fromResponse(502, '<html>bad gateway</html>');

    expect(error.code).toBe('internal_error');
    expect(error.status).toBe(502);
  });
});
