import {
  REALTIME_PATH,
  ServerEventSchema,
  type ClientCommand,
  type ServerEvent,
  type ServerEventType,
} from '@open-rocket-chat/api-contract';

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

export type Unsubscribe = () => void;

type EventHandler<T extends ServerEventType> = (event: Extract<ServerEvent, { type: T }>) => void;

/** What accompanies a status change beyond the status itself. */
export interface RealtimeStatusInfo {
  /**
   * Epoch milliseconds at which the next automatic attempt fires, present only
   * while one is waiting out the backoff. Absent means "no wait to skip" —
   * either an attempt is in flight, or the connection is up.
   */
  retryAt?: number;
}

export interface RealtimeOptions {
  /** Gateway origin; the `/ws` path and protocol are derived from it. */
  baseUrl: string;
  onStatusChange?: (status: RealtimeStatus, info: RealtimeStatusInfo) => void;
  webSocketImpl?: typeof WebSocket;
}

const MIN_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 15_000;

/**
 * The browser side of the gateway's realtime channel.
 *
 * Room subscriptions are tracked here rather than by callers: on reconnect the
 * server has no memory of what this client was watching, so the set has to be
 * replayed. Callers subscribe once and forget about connection lifecycle.
 */
export class RealtimeConnection {
  private socket?: WebSocket;

  private status: RealtimeStatus = 'idle';

  private readonly handlers = new Map<ServerEventType, Set<(event: ServerEvent) => void>>();

  /**
   * Rooms this client wants events for, replayed after every reconnect.
   *
   * Keyed by server *and* room: Rocket.Chat ids are only unique within one
   * server, so two servers can legitimately hand out the same room id.
   */
  private readonly rooms = new Map<string, { serverId: string; roomId: string }>();

  private reconnectAttempts = 0;

  private reconnectTimer?: ReturnType<typeof setTimeout>;

  /** When `reconnectTimer` fires, for a UI that counts down to it. */
  private nextRetryAt?: number;

  /** Set by `disconnect()`; cleared by `connect()`. Suppresses auto-reconnect. */
  private stopped = false;

  /** Set by `close()`. Terminal — the instance cannot be reopened. */
  private disposed = false;

  private readonly webSocketImpl: typeof WebSocket;

  constructor(private readonly options: RealtimeOptions) {
    this.webSocketImpl = options.webSocketImpl ?? globalThis.WebSocket;
  }

  get currentStatus(): RealtimeStatus {
    return this.status;
  }

  /** See `RealtimeStatusInfo.retryAt`. */
  get retryAt(): number | undefined {
    return this.nextRetryAt;
  }

  /**
   * Opens the socket, or reopens it after `disconnect()`.
   *
   * Reopening has to work: React remounts a provider on every StrictMode pass
   * and on any parent remount, and a connection that could only ever be closed
   * once would leave the app silently without realtime after the first.
   */
  connect(): void {
    if (this.disposed || this.socket) return;

    this.stopped = false;
    // An attempt is in flight from here on, so there is no longer a wait to
    // count down to or to skip.
    this.update(this.reconnectAttempts === 0 ? 'connecting' : 'reconnecting');

    const url = new URL(this.options.baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = REALTIME_PATH;

    const socket = new this.webSocketImpl(url.toString());
    this.socket = socket;

    socket.addEventListener('open', () => {
      // Deliberately *not* where the attempt count is reset — see the `message`
      // handler below.
      //
      // Restore watched rooms before the app notices it reconnected, so no
      // event window is missed beyond the outage itself.
      for (const { serverId, roomId } of this.rooms.values()) {
        this.send({ type: 'room.subscribe', serverId, roomId });
      }
    });

    socket.addEventListener('message', (event) => {
      const parsed = ServerEventSchema.safeParse(safeParse(event.data));
      if (!parsed.success) return;

      if (parsed.data.type === 'connection.ready') {
        // The backoff is reset here rather than on `open`, because a completed
        // handshake is not yet a working connection: the gateway accepts the
        // socket first and only then attaches to Rocket.Chat, closing it again
        // if that fails. Resetting on `open` made every such rejection look
        // like a fresh start, pinning the delay at its half-second minimum and
        // reconnecting in a hot loop for as long as the upstream stayed down.
        this.reconnectAttempts = 0;
        this.update('connected');
      }

      this.dispatch(parsed.data);
    });

    socket.addEventListener('close', () => {
      this.socket = undefined;
      if (this.disposed || this.stopped) return;

      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // `close` always follows, and carries the information worth acting on.
    });
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const backoff = Math.min(MIN_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS);
    // Jitter so a gateway restart does not bring every open tab back at once.
    const delay = backoff / 2 + Math.random() * (backoff / 2);
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => this.connect(), delay);
    // Published with the deadline: a status of "reconnecting" alone leaves the
    // UI unable to say whether anything is happening, and at the maximum delay
    // that silence lasts fifteen seconds.
    this.update('reconnecting', Date.now() + delay);
  }

  /**
   * Attempts to reconnect now rather than waiting out the backoff.
   *
   * This is what a Retry button calls: someone who has just fixed their
   * network should not have to sit through the rest of a delay that was sized
   * for a server outage. A socket that is already open or still handshaking is
   * left alone, so an impatient click cannot abort an attempt that was about to
   * succeed.
   */
  reconnect(): void {
    if (this.disposed || this.socket) return;

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    // The attempt count is deliberately kept: if this one also fails, the
    // backoff resumes where it was instead of restarting from half a second
    // and hammering a server that is still down.
    this.connect();
  }

  /** Registers interest in a room on one server. Safe to call repeatedly. */
  subscribeRoom(serverId: string, roomId: string): Unsubscribe {
    const key = watchKey(serverId, roomId);

    if (!this.rooms.has(key)) {
      this.rooms.set(key, { serverId, roomId });
      this.send({ type: 'room.subscribe', serverId, roomId });
    }

    return () => {
      if (!this.rooms.delete(key)) return;
      this.send({ type: 'room.unsubscribe', serverId, roomId });
    };
  }

  setTyping(serverId: string, roomId: string, typing: boolean): void {
    this.send({ type: 'typing.set', serverId, roomId, typing });
  }

  on<T extends ServerEventType>(type: T, handler: EventHandler<T>): Unsubscribe {
    let bucket = this.handlers.get(type);
    if (!bucket) {
      bucket = new Set();
      this.handlers.set(type, bucket);
    }

    const wrapped = handler as (event: ServerEvent) => void;
    bucket.add(wrapped);

    return () => {
      bucket.delete(wrapped);
    };
  }

  /**
   * Closes the socket but keeps the instance usable.
   *
   * Watched rooms are retained so a later `connect()` restores them; only the
   * transport goes away.
   */
  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.reconnectAttempts = 0;
    this.socket?.close();
    this.socket = undefined;
    this.update('idle');
  }

  /** Permanent teardown. The instance cannot be reopened afterwards. */
  close(): void {
    this.disposed = true;
    this.disconnect();
    this.rooms.clear();
    this.handlers.clear();
    this.update('closed');
  }

  private send(command: ClientCommand): void {
    // Dropping a command while offline is correct: `rooms` is replayed on
    // reconnect, and a stale typing notification is not worth queueing.
    if (this.socket?.readyState !== 1) return;
    this.socket.send(JSON.stringify(command));
  }

  private dispatch(event: ServerEvent): void {
    for (const handler of [...(this.handlers.get(event.type) ?? [])]) {
      handler(event);
    }
  }

  /**
   * Records where the connection stands and tells the subscriber, if anything
   * moved.
   *
   * `retryAt` is part of the comparison rather than the status alone: waiting
   * out a backoff and attempting a reconnect are both `reconnecting`, and a UI
   * that shows a countdown has to be told when one becomes the other.
   */
  private update(status: RealtimeStatus, retryAt?: number): void {
    if (this.status === status && this.nextRetryAt === retryAt) return;

    this.status = status;
    this.nextRetryAt = retryAt;
    this.options.onStatusChange?.(status, retryAt === undefined ? {} : { retryAt });
  }
}

/** `\u0000` cannot appear in a Rocket.Chat id, so the two parts never collide. */
const watchKey = (serverId: string, roomId: string): string => `${serverId}\u0000${roomId}`;

const safeParse = (data: unknown): unknown => {
  try {
    return JSON.parse(String(data));
  } catch {
    return undefined;
  }
};
