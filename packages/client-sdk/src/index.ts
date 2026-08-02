export { OpenRocketChatClient } from './client.js';
export type { ClientOptions } from './client.js';

export { HttpTransport } from './http.js';
export type { HttpOptions, TransportOptions, UploadProgress } from './http.js';

export { RealtimeConnection } from './realtime.js';
export type { RealtimeOptions, RealtimeStatus, RealtimeStatusInfo, Unsubscribe } from './realtime.js';

export { GatewayError, NetworkError } from './errors.js';

// Re-exported so applications depend on one package rather than two.
export type * from '@open-rocket-chat/api-contract';

// The contract's limits, for forms that have to enforce them before sending.
export { STATUS_TEXT_MAX_LENGTH } from '@open-rocket-chat/api-contract';

// What an avatar may be, so a picker can reject a file before uploading it.
export { AVATAR_ACCEPT, isAvatarMediaType } from '@open-rocket-chat/api-contract';
