import type { RoomSummary } from '@open-rocket-chat/client-sdk';
import { format } from 'date-fns';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MessageBody } from '@/features/messages/message-body';
import { canEditRoom, canViewMembers, useCapabilities } from '@/features/server/use-capabilities';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { Icons } from '@/ui/icon';
import { LeaveRoomConfirm } from '../../leave-room-confirm';
import { useLeaveRoom } from '../../use-room-actions';
import { useToggleFavorite } from '../../use-rooms';
import { PanelBody, PanelField, QuickAction } from '../panel';
import { useContextualBarStore } from '../store';

/** A room flag worth stating, shown only when it is set. */
const Trait = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <span className="bg-sunken text-content-secondary inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium">
    {icon}
    {label}
  </span>
);

export const RoomInfoPanel = ({ room, roomId }: { room: RoomSummary | undefined; roomId: string }) => {
  const { t } = useTranslation('rooms');

  const push = useContextualBarStore((state) => state.push);
  const close = useContextualBarStore((state) => state.close);

  const { data: capabilities } = useCapabilities();
  const toggleFavorite = useToggleFavorite();
  const leave = useLeaveRoom();

  const [confirmingLeave, setConfirmingLeave] = useState(false);

  if (!room) return null;

  const isDirect = room.type === 'direct';
  const peer = isDirect ? room.directMembers[0] : undefined;
  const canEdit = canEditRoom(capabilities, room) && !isDirect;

  return (
    <>
      <PanelBody>
        <div className="px-4 pt-4">
          {peer ? (
            <Avatar name={peer.displayName} src={peer.avatarUrl} size="xl" status={peer.status} />
          ) : room.avatarUrl ? (
            <Avatar name={room.displayName} src={room.avatarUrl} size="xl" />
          ) : (
            <span className="bg-accent text-accent-content flex size-14 items-center justify-center rounded-xl">
              {room.type === 'channel' ? <Icons.channel size={28} /> : <Icons.private size={28} />}
            </span>
          )}

          {/* The star trails the name directly instead of being pushed to the
              panel's right edge, where a long name would leave it stranded far
              from what it marks. */}
          <div className="mt-3 flex items-start gap-1.5">
            <h3 className="min-w-0 text-lg font-semibold break-words">{room.displayName}</h3>
            {room.favorite ? <Icons.star size={16} weight="fill" className="text-warning mt-1.5 shrink-0" /> : null}
          </div>

          <p className="text-content-muted mt-1 flex items-center gap-1.5 text-xs">
            {isDirect ? (
              <Icons.direct size={13} />
            ) : room.type === 'channel' ? (
              <Icons.channel size={13} />
            ) : (
              <Icons.private size={13} />
            )}
            {t(`type.${room.type}`)}
            {room.name && !isDirect ? <span className="truncate">· {room.name}</span> : null}
          </p>

          {room.readOnly || room.broadcast || room.encrypted || room.archived ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {room.archived ? <Trait icon={<Icons.archive size={12} />} label={t('edit.archived')} /> : null}
              {room.readOnly ? <Trait icon={<Icons.preview size={12} />} label={t('create.readOnly')} /> : null}
              {room.broadcast ? <Trait icon={<Icons.broadcast size={12} />} label={t('create.broadcast')} /> : null}
              {room.encrypted ? <Trait icon={<Icons.private size={12} />} label={t('create.encrypted')} /> : null}
            </div>
          ) : null}
        </div>

        {/* These drill in rather than replace: arriving at Members from Room Info
            is a step into it, so the bar's back button has to lead back out. The
            favorite tile is the exception — it acts on the room in place and
            never leaves the panel. */}
        <div className="mt-4 flex gap-1 px-3">
          <QuickAction
            label={room.favorite ? t('quick.unfavorite') : t('quick.favorite')}
            active={room.favorite}
            icon={<Icons.star size={20} weight={room.favorite ? 'fill' : 'light'} />}
            onClick={() => toggleFavorite.mutate({ roomId, favorite: !room.favorite })}
          />
          {canViewMembers(capabilities, room) ? (
            <QuickAction
              label={t('quick.members')}
              icon={<Icons.members size={20} />}
              onClick={() => push({ id: 'members' })}
            />
          ) : null}
          <QuickAction
            label={t('quick.files')}
            icon={<Icons.attach size={20} />}
            onClick={() => push({ id: 'files' })}
          />
          <QuickAction
            label={t('quick.notifications')}
            icon={<Icons.notifications size={20} />}
            onClick={() => push({ id: 'notifications' })}
          />
        </div>

        <dl className="border-line mt-4 border-t pt-2">
          {/* Both are written in the same markdown a message is, so both are
              rendered by the same parser. `whitespace-normal` undoes the field's
              `pre-line`: the parser already decides what a line break means, and
              leaving both on would double every one of them. */}
          {room.topic ? (
            <PanelField label={t('create.topic')}>
              <MessageBody text={room.topic} className="whitespace-normal" />
            </PanelField>
          ) : null}
          {room.announcement ? (
            <PanelField label={t('edit.announcement')}>
              <MessageBody
                text={room.announcement}
                className="bg-accent-subtle text-accent rounded-lg px-3 py-2 whitespace-normal"
              />
            </PanelField>
          ) : null}
          {room.description ? <PanelField label={t('create.description')}>{room.description}</PanelField> : null}

          {!isDirect ? (
            <>
              <PanelField label={t('info.members')}>
                <span className="tabular-nums">{room.membersCount}</span>
              </PanelField>
              <PanelField label={t('info.messages')}>
                <span className="tabular-nums">{room.messagesCount}</span>
              </PanelField>
              {room.owner ? (
                <PanelField label={t('info.owner')}>
                  <span className="flex items-center gap-2">
                    <Avatar name={room.owner.displayName} src={room.owner.avatarUrl} size="xs" />
                    <button
                      type="button"
                      onClick={() => push({ id: 'user-info', userId: room.owner!.id })}
                      className="hover:underline"
                    >
                      {room.owner.displayName}
                    </button>
                  </span>
                </PanelField>
              ) : null}
            </>
          ) : null}

          {room.createdAt ? (
            <PanelField label={t('info.createdAt')}>{format(new Date(room.createdAt), 'd MMMM yyyy')}</PanelField>
          ) : null}
        </dl>

        {canEdit ? (
          <div className="border-line mt-2 border-t px-4 py-3">
            <Button size="md" className="w-full" onClick={() => push({ id: 'room-edit' })}>
              <Icons.edit size={16} />
              {t('menu.edit')}
            </Button>
          </div>
        ) : null}
      </PanelBody>

      {/* Leaving is destructive and not undoable without an invitation back, so
          it is a deliberate button rather than a tile in the row of one-tap
          actions. Pinned to the panel's foot, where the bar's other terminal
          action already lives, so it stays reachable without scrolling past a
          long topic — and stays out of the details it would otherwise sit in
          the middle of. */}
      {!isDirect ? (
        <footer className="border-line shrink-0 border-t px-4 py-3">
          <Button variant="danger" size="md" className="w-full" onClick={() => setConfirmingLeave(true)}>
            <Icons.leave size={16} />
            {t('action.leave')}
          </Button>
        </footer>
      ) : null}

      <LeaveRoomConfirm
        open={confirmingLeave}
        onOpenChange={setConfirmingLeave}
        roomName={room.displayName}
        pending={leave.isPending}
        onConfirm={() =>
          leave.mutate(roomId, {
            onSuccess: () => {
              setConfirmingLeave(false);
              // The room is gone from under the bar; leaving it open would show
              // a panel about a conversation that is no longer in the sidebar.
              close();
            },
          })
        }
      />
    </>
  );
};
