import type {
  AddRoomMembersResponse,
  CreateDirectRoomResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  ListCommandsResponse,
  ListCustomEmojiResponse,
  ListMentionedMessagesResponse,
  ListPinnedMessagesResponse,
  ListRoomFilesQuery,
  ListRoomFilesResponse,
  ListRoomMembersQuery,
  ListRoomRolesResponse,
  ListStarredMessagesResponse,
  PruneMessagesRequest,
  PruneMessagesResponse,
  RemoveRoomMemberResponse,
  RoomNotificationPreferences,
  RunCommandRequest,
  RunCommandResponse,
  ServerCapabilities,
  UpdateRoomMemberRequest,
  UpdateRoomMemberResponse,
  UpdateRoomNotificationsRequest,
  UpdateRoomRequest,
  GetUserResponse,
  ListMessagesQuery,
  ListMessagesResponse,
  ListRoomMembersResponse,
  ListRoomsQuery,
  ListRoomsResponse,
  ListThreadsResponse,
  Message,
  RoomSummary,
  SearchMessagesResponse,
  SearchUsersResponse,
  SendMessageRequest,
  ServerListResponse,
  Session,
  SetMyAvatarResponse,
  SetRoomAvatarResponse,
  UpdateMyStatusRequest,
  UpdateMyStatusResponse,
  UpdateRoomStateRequest,
} from '@open-rocket-chat/api-contract';

import { HttpTransport, type TransportOptions, type UploadProgress } from './http.js';
import { RealtimeConnection, type RealtimeOptions } from './realtime.js';

export type ClientOptions = TransportOptions;

/**
 * Typed access to every gateway route, grouped the way a UI actually uses them.
 *
 * There is no token handling here: the session is an `HttpOnly` cookie the
 * browser attaches automatically, which is precisely why this SDK has no
 * `setToken` and no storage.
 */
export class OpenRocketChatClient {
  private readonly http: HttpTransport;

  /** Server-scoped views of this client, kept stable for React identity checks. */
  private readonly scoped = new Map<string, OpenRocketChatClient>();

  constructor(private readonly options: ClientOptions) {
    this.http = new HttpTransport(options);
  }

  /** Which Rocket.Chat server this client acts on; `undefined` means the default. */
  get serverId(): string | undefined {
    return this.options.serverId;
  }

  /**
   * A view of the same session bound to one Rocket.Chat server.
   *
   * Returns `this` for the current server and caches everything else, so
   * calling it during a render does not hand React a new client each pass.
   */
  forServer(serverId: string): OpenRocketChatClient {
    if (serverId === this.options.serverId) return this;

    const existing = this.scoped.get(serverId);
    if (existing) return existing;

    const client = new OpenRocketChatClient({ ...this.options, serverId });
    this.scoped.set(serverId, client);
    return client;
  }

  /**
   * Turns a gateway-relative media path from a message into a loadable URL.
   *
   * The server is carried in the query string because the browser loads these
   * through `<img>`/`<video>`, which cannot set the scoping header.
   */
  mediaUrl(path: string): string {
    const resolved = this.http.resolveUrl(path);
    if (!this.options.serverId) return resolved;

    const url = new URL(resolved, this.options.baseUrl);
    url.searchParams.set('serverId', this.options.serverId);
    return url.toString();
  }

  readonly auth = {
    servers: (): Promise<ServerListResponse> => this.http.request('/auth/servers'),

    /**
     * Signs in to a server. With a session already established this adds the
     * server to it rather than replacing it, which is what makes several
     * Rocket.Chat servers usable side by side.
     */
    login: (input: { user: string; password: string; totpCode?: string; serverId?: string }): Promise<Session> =>
      this.http.request('/auth/login', { method: 'POST', body: input }),

    /**
     * Completes an OAuth sign-in with the credential pair Rocket.Chat left
     * behind after the provider handshake. Adds a server to an existing
     * session in exactly the same way {@link login} does.
     */
    loginWithOAuth: (input: {
      credentialToken: string;
      credentialSecret: string;
      serverId?: string;
    }): Promise<Session> => this.http.request('/auth/login/oauth', { method: 'POST', body: input }),

    session: (): Promise<Session> => this.http.request('/auth/session'),

    /**
     * Signs out of one server, or of every server when `serverId` is omitted.
     * Returns the surviving session, or `undefined` once nothing is left.
     */
    logout: (serverId?: string): Promise<Session | undefined> =>
      this.http.request('/auth/logout', { method: 'POST', body: serverId ? { serverId } : {} }),
  };

  readonly rooms = {
    list: (query: Partial<ListRoomsQuery> = {}): Promise<ListRoomsResponse> =>
      this.http.request('/rooms', {
        query: {
          updatedSince: query.updatedSince,
          openOnly: query.openOnly === undefined ? undefined : String(query.openOnly),
          types: query.types,
        },
      }),

    get: (roomId: string): Promise<RoomSummary> => this.http.request(`/rooms/${encodeURIComponent(roomId)}`),

    members: (roomId: string, query: Partial<ListRoomMembersQuery> = {}): Promise<ListRoomMembersResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/members`, {
        query: {
          offset: query.offset ?? 0,
          limit: query.limit ?? 50,
          q: query.q,
          onlineOnly: query.onlineOnly === undefined ? undefined : String(query.onlineOnly),
        },
      }),

    addMembers: (roomId: string, userIds: string[]): Promise<AddRoomMembersResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/members`, { method: 'POST', body: { userIds } }),

    removeMember: (roomId: string, userId: string): Promise<RemoveRoomMemberResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      }),

    /** Room roles (`owner`, `moderator`, `leader`) and the mute flag for one member. */
    updateMember: (
      roomId: string,
      userId: string,
      changes: UpdateRoomMemberRequest,
    ): Promise<UpdateRoomMemberResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: changes,
      }),

    /** Every role assignment in the room, for badging the member list. */
    roles: (roomId: string): Promise<ListRoomRolesResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/roles`),

    files: (roomId: string, query: Partial<ListRoomFilesQuery> = {}): Promise<ListRoomFilesResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/files`, {
        query: { offset: query.offset ?? 0, limit: query.limit ?? 50, q: query.q, type: query.type },
      }),

    notifications: (roomId: string): Promise<RoomNotificationPreferences> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/notifications`),

    updateNotifications: (
      roomId: string,
      changes: UpdateRoomNotificationsRequest,
    ): Promise<RoomNotificationPreferences> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/notifications`, { method: 'PATCH', body: changes }),

    /** Bulk message deletion. Irreversible. */
    prune: (roomId: string, request: PruneMessagesRequest): Promise<PruneMessagesResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/prune`, { method: 'POST', body: request }),

    createDirect: (username: string): Promise<CreateDirectRoomResponse> =>
      this.http.request('/rooms/direct', { method: 'POST', body: { username } }),

    create: (input: CreateRoomRequest): Promise<CreateRoomResponse> =>
      this.http.request('/rooms', { method: 'POST', body: input }),

    /** Room-wide settings, as opposed to `updateState`, which is per-user. */
    update: (roomId: string, changes: UpdateRoomRequest): Promise<RoomSummary> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}`, { method: 'PATCH', body: changes }),

    leave: (roomId: string): Promise<{ ok: true }> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/leave`, { method: 'POST' }),

    markUnread: (roomId: string): Promise<{ ok: true }> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/unread`, { method: 'POST' }),

    markRead: (roomId: string): Promise<{ ok: true }> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST' }),

    updateState: (roomId: string, changes: UpdateRoomStateRequest): Promise<RoomSummary> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/state`, { method: 'PATCH', body: changes }),

    /**
     * Replaces the room's picture. Answers with the room as it stands
     * afterwards, carrying the avatar URL that addresses the new image — the
     * old one is cached hard, so a caller cannot derive it.
     */
    setAvatar: (roomId: string, image: File): Promise<SetRoomAvatarResponse> => {
      const form = new FormData();
      form.set('image', image, image.name);

      return this.http.request(`/rooms/${encodeURIComponent(roomId)}/avatar`, { method: 'POST', formData: form });
    },

    resetAvatar: (roomId: string): Promise<SetRoomAvatarResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/avatar`, { method: 'DELETE' }),
  };

  readonly messages = {
    list: (roomId: string, query: Partial<ListMessagesQuery> = {}): Promise<ListMessagesResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/messages`, {
        query: {
          before: query.before,
          after: query.after,
          limit: query.limit,
          // Thread pages are addressed by offset; the main timeline ignores it.
          offset: query.offset,
          threadId: query.threadId,
          includeThreadReplies:
            query.includeThreadReplies === undefined ? undefined : String(query.includeThreadReplies),
        },
      }),

    send: (roomId: string, input: SendMessageRequest): Promise<Message> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/messages`, { method: 'POST', body: input }),

    update: (roomId: string, messageId: string, text: string): Promise<Message> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}`, {
        method: 'PATCH',
        body: { text },
      }),

    remove: (roomId: string, messageId: string): Promise<{ ok: true }> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}`, {
        method: 'DELETE',
      }),

    react: (roomId: string, messageId: string, emoji: string, reacted: boolean): Promise<{ ok: true }> =>
      this.http.request(
        `/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
        { method: reacted ? 'PUT' : 'DELETE' },
      ),

    setPinned: (roomId: string, messageId: string, pinned: boolean): Promise<{ ok: true }> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/pin`, {
        method: pinned ? 'POST' : 'DELETE',
      }),

    setStarred: (roomId: string, messageId: string, starred: boolean): Promise<{ ok: true }> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}/star`, {
        method: starred ? 'POST' : 'DELETE',
      }),

    threads: (roomId: string, offset = 0, limit = 50): Promise<ListThreadsResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/threads`, { query: { offset, limit } }),

    pinned: (roomId: string, offset = 0, limit = 50): Promise<ListPinnedMessagesResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/pinned`, { query: { offset, limit } }),

    starred: (roomId: string, offset = 0, limit = 50): Promise<ListStarredMessagesResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/starred`, { query: { offset, limit } }),

    /** Messages in the room that mention the signed-in user. */
    mentions: (roomId: string, offset = 0, limit = 50): Promise<ListMentionedMessagesResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/mentions`, { query: { offset, limit } }),

    search: (roomId: string, q: string, limit = 50): Promise<SearchMessagesResponse> =>
      this.http.request(`/rooms/${encodeURIComponent(roomId)}/messages/search`, { query: { q, limit } }),
  };

  readonly files = {
    /** Uploads one file; the gateway turns it into a message and returns it. */
    upload: (
      roomId: string,
      file: File,
      options: {
        description?: string;
        text?: string;
        threadId?: string;
        signal?: AbortSignal;
        /**
         * Bytes reaching the gateway. Stops short of the whole story on
         * purpose: the gateway then forwards the file to Rocket.Chat, so the
         * last report arrives well before the message exists.
         */
        onProgress?: (progress: UploadProgress) => void;
      } = {},
    ): Promise<Message> => {
      const form = new FormData();
      // Ordering is load-bearing: the gateway relays the file to Rocket.Chat as
      // it arrives rather than holding it, and a multipart part is only
      // readable once everything before it has been consumed. Fields written
      // after the file would not exist yet when the relay begins.
      if (options.description) form.set('description', options.description);
      if (options.text) form.set('text', options.text);
      if (options.threadId) form.set('threadId', options.threadId);
      form.set('file', file, file.name);

      return this.http.request(`/rooms/${encodeURIComponent(roomId)}/files`, {
        method: 'POST',
        formData: form,
        // Uploads are the one call long enough for the user to change their
        // mind mid-flight, so the caller can abandon it.
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.onProgress ? { onUploadProgress: options.onProgress } : {}),
      });
    },
  };

  readonly users = {
    get: (userIdOrUsername: string): Promise<GetUserResponse> =>
      this.http.request(`/users/${encodeURIComponent(userIdOrUsername)}`),

    search: (q: string, limit = 20): Promise<SearchUsersResponse> =>
      this.http.request('/users/search', { query: { q, limit } }),

    /**
     * Sets the signed-in user's presence, status message, or both, and returns
     * the profile as it stands afterwards.
     *
     * Scoped to this client's server: presence is a property of an account on
     * one Rocket.Chat server, so a session connected to several sets it on each
     * separately.
     */
    setMyStatus: (changes: UpdateMyStatusRequest): Promise<UpdateMyStatusResponse> =>
      this.http.request('/users/me/status', { method: 'PATCH', body: changes }),

    /**
     * Replaces the signed-in user's picture on this client's server.
     *
     * Scoped like {@link setMyStatus}: an account signed in to two Rocket.Chat
     * servers has a separate profile on each, and there is no upstream notion
     * of one picture spanning both.
     */
    setMyAvatar: (image: File): Promise<SetMyAvatarResponse> => {
      const form = new FormData();
      form.set('image', image, image.name);

      return this.http.request('/users/me/avatar', { method: 'POST', formData: form });
    },

    /** Goes back to the initials Rocket.Chat generates from the name. */
    resetMyAvatar: (): Promise<SetMyAvatarResponse> => this.http.request('/users/me/avatar', { method: 'DELETE' }),
  };

  readonly server = {
    /** Settings and permissions for the connected Rocket.Chat server. */
    capabilities: (): Promise<ServerCapabilities> => this.http.request('/server/capabilities'),
  };

  readonly emoji = {
    /** Custom emoji uploaded to the connected server. */
    listCustom: (): Promise<ListCustomEmojiResponse> => this.http.request('/emoji/custom'),
  };

  readonly commands = {
    /** Slash commands the connected server offers, for composer autocomplete. */
    list: (): Promise<ListCommandsResponse> => this.http.request('/commands'),

    /**
     * Runs a slash command. Whatever it produces arrives on the room's realtime
     * stream as an ordinary message, so there is nothing to render from here.
     */
    run: (input: RunCommandRequest): Promise<RunCommandResponse> =>
      this.http.request('/commands/run', { method: 'POST', body: input }),
  };

  /**
   * Opens a realtime channel authenticated by the same session cookie.
   *
   * One socket carries every server in the session; commands and events are
   * tagged with the server they belong to, so this is created once at the app
   * level rather than per server.
   */
  createRealtime(options: Omit<RealtimeOptions, 'baseUrl'> = {}): RealtimeConnection {
    return new RealtimeConnection({ ...options, baseUrl: this.options.baseUrl });
  }
}
