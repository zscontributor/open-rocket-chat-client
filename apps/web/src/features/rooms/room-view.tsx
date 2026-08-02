import { GatewayError } from '@open-rocket-chat/client-sdk';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { AttachmentDropZone } from '@/features/messages/attachment-drop-zone';
import { Composer } from '@/features/messages/composer';
import { MessageList } from '@/features/messages/message-list';
import { useRoomSubscription } from '@/features/realtime/realtime-provider';
import { canPostToRoom, useCapabilities } from '@/features/server/use-capabilities';
import { useServerConnection, useServerId } from '@/features/servers/server-scope';
import { roomScopeKey, useUiStore } from '@/stores/ui-store';
import { Icons } from '@/ui/icon';
import { ContextualBar, useContextualBarOverlay } from './contextual-bar/contextual-bar';
import { useContextualBarStore } from './contextual-bar/store';
import { RoomHeader } from './room-header';
import { useMarkRoomRead, useRoom, useRoomMembers } from './use-rooms';

/**
 * Whether the server's answer means "not this account's room to open".
 *
 * A room id in the address bar outlives the room it names: it can be deleted,
 * the account can be removed from it, and — the everyday case — it can simply
 * be left behind by the session before this one, because signing out does not
 * rewrite the URL. Rendering the conversation anyway gives a header with no
 * name, a message list that never arrives and a message box that cannot send;
 * every one of those keeps asking the server for a room it has already refused.
 */
const isMissingRoom = (error: unknown): boolean =>
  error instanceof GatewayError && (error.code === 'not_found' || error.code === 'forbidden');

const TypingIndicator = ({ roomId }: { roomId: string }) => {
  const { t } = useTranslation('messages');
  const serverId = useServerId();
  const typing = useUiStore((state) => state.typing[roomScopeKey(serverId, roomId)]);

  if (!typing || typing.length === 0) return null;

  const label =
    typing.length === 1
      ? t('typing.one', { name: typing[0] })
      : typing.length === 2
        ? t('typing.two', { first: typing[0], second: typing[1] })
        : t('typing.many', { count: typing.length });

  return (
    <p aria-live="polite" className="text-content-muted px-4 pb-1 text-xs italic">
      {label}
    </p>
  );
};

export const RoomView = ({ roomId, onOpenRoom }: { roomId: string; onOpenRoom: (roomId: string) => void }) => {
  const { t } = useTranslation('composer');
  const { t: tRooms } = useTranslation('rooms');
  // The signed-in user comes from the surrounding server scope rather than a
  // prop: with several servers connected, "who am I" is a per-server answer.
  const currentUserId = useServerConnection().user.id;
  const { data: room, error } = useRoom(roomId);
  const { data: capabilities } = useCapabilities();
  const missing = isMissingRoom(error);
  const { data: members } = useRoomMembers(roomId);
  const markRead = useMarkRoomRead();

  const closeBar = useContextualBarStore((state) => state.close);
  const stopEditing = useUiStore((state) => state.stopEditingMessage);

  // On a narrow viewport the contextual bar covers the conversation rather than
  // sitting beside it, and a covered header and message box are pictures rather
  // than controls: `inert` keeps Tab, and the screen reader, inside the panel.
  const barOverlays = useContextualBarOverlay();
  const barOpen = useContextualBarStore((state) => state.stack.length > 0);
  const barCovered = barOverlays && barOpen;
  const canPost = canPostToRoom(capabilities, room);

  useRoomSubscription(roomId);

  // A panel — and an unfinished edit — belongs to the room it was opened from;
  // keeping either across a room switch would show details of a conversation
  // the user has left.
  useEffect(() => {
    closeBar();
    stopEditing();
  }, [roomId, closeBar, stopEditing]);

  // Opening a room is what marks it read, matching every other chat client.
  // Held until the room itself has answered: fired on mount it would also be
  // fired for a room this account cannot open, and the rejection that follows
  // is silent by design — nothing on screen, one more request against a room
  // the server has already refused twice.
  const loaded = Boolean(room);
  useEffect(() => {
    if (!loaded) return;

    markRead.mutate(roomId);
    // `markRead` is a stable mutation object; depending on it would fire a
    // request on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, loaded]);

  if (missing) {
    return (
      <div className="text-content-muted flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <Icons.error size={40} className="opacity-40" />
        <div>
          <p className="text-content text-sm font-medium">{tRooms('placeholder.missing')}</p>
          <p className="mt-1 text-sm">{tRooms('placeholder.missingHint')}</p>
        </div>
      </div>
    );
  }

  return (
    // `relative` so the bar has something to cover on a narrow viewport: the
    // conversation, and not the room list or the connection banner above it.
    <div className="relative flex h-full min-w-0 flex-1">
      <div inert={barCovered} className="flex min-w-0 flex-1 flex-col">
        <RoomHeader room={room} members={members ?? []} onOpenRoom={onOpenRoom} />

        {/* Everything below the header takes a drop, so files can be dragged
            onto the conversation itself rather than aimed at the message box. */}
        <AttachmentDropZone roomId={roomId} disabled={!canPost} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <MessageList roomId={roomId} currentUserId={currentUserId} onOpenRoom={onOpenRoom} />
          <TypingIndicator roomId={roomId} />

          <Composer
            roomId={roomId}
            placeholder={t('placeholder', { room: room?.displayName ?? '' })}
            disabled={!canPost}
          />
        </AttachmentDropZone>
      </div>

      <ContextualBar room={room} roomId={roomId} onOpenRoom={onOpenRoom} />
    </div>
  );
};
