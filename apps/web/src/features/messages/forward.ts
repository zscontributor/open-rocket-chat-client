import type { FileRef, Message } from '@open-rocket-chat/client-sdk';

/**
 * Every upload on the row being forwarded.
 *
 * A row can be an album — one upload of several files posts as several messages
 * — and forwarding it should carry all of them, exactly as deleting it removes
 * all of them.
 */
export const forwardedFiles = (messages: Message[]): FileRef[] => messages.flatMap((message) => message.files);
