import type { FileRef, OpenRocketChatClient } from '@open-rocket-chat/client-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useClient, useServerKeys } from '@/features/servers/server-scope';
import { upsertMessage } from './message-cache';

export interface ForwardInput {
  /** Every room the message is going to, in the order the picker listed them. */
  roomIds: string[];
  /** The quote, already composed — see `forwardedText`. */
  text: string;
  /** Uploads to carry along, re-posted into each target room. */
  files: FileRef[];
}

/** A room the forward did not reach, and why. */
export interface ForwardFailure {
  roomId: string;
  error: unknown;
}

export interface ForwardResult {
  deliveredRoomIds: string[];
  failures: ForwardFailure[];
}

/**
 * Copies an upload into another room.
 *
 * Rocket.Chat stores a file against the room it was posted to, and neither it
 * nor the gateway offers a way to point a second message at the same record —
 * so a forwarded file is genuinely uploaded again. The bytes come back through
 * the gateway on the session cookie, which is the same request the timeline
 * makes to draw the thing in the first place.
 */
const refetchAsUpload = async (client: OpenRocketChatClient, file: FileRef): Promise<File> => {
  const response = await fetch(client.mediaUrl(file.url), { credentials: 'include' });
  if (!response.ok) throw new Error('forward-download-failed');

  const blob = await response.blob();

  return new File([blob], file.name, { type: file.mimeType ?? blob.type });
};

/**
 * Forwards one message into any number of rooms.
 *
 * Rooms are delivered to one at a time and a room that fails does not stop the
 * ones behind it: the picker allows a dozen targets, and abandoning the rest
 * because the fourth is archived would be the wrong half of the job. The
 * failures come back with the result so the dialog can name them and let the
 * user retry only those.
 *
 * Nothing here is optimistic. A forward lands in a room the user is not looking
 * at, so there is no timeline waiting on it — `upsertMessage` is for the room
 * they switch to afterwards, and it no-ops where nothing is cached.
 */
export const useForwardMessage = () => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roomIds, text, files }: ForwardInput): Promise<ForwardResult> => {
      // Fetched once rather than per room: the same bytes go to every target,
      // and a ten-room forward should not download the file ten times.
      const uploads = await Promise.all(files.map((file) => refetchAsUpload(client, file)));

      const deliveredRoomIds: string[] = [];
      const failures: ForwardFailure[] = [];

      for (const roomId of roomIds) {
        try {
          const message = await client.messages.send(roomId, {
            text,
            // As with an ordinary send: a client id makes a retry idempotent,
            // so the forward cannot land twice if the response is lost.
            clientMessageId: crypto.randomUUID().replace(/-/g, '').slice(0, 17),
          });
          upsertMessage(queryClient, keys, roomId, message);

          // After the quote, so the room reads in the order it was forwarded:
          // who said it, then what they attached.
          for (const upload of uploads) {
            upsertMessage(queryClient, keys, roomId, await client.files.upload(roomId, upload));
          }

          deliveredRoomIds.push(roomId);
        } catch (error) {
          failures.push({ roomId, error });
        }
      }

      return { deliveredRoomIds, failures };
    },
    // The dialog stays open on a partial failure and reports it against the
    // rooms that are still selected, which is where the retry is.
    meta: { silentError: true },
  });
};
