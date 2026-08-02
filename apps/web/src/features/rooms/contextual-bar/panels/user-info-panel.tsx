import type { RoomMemberRole, RoomSummary } from '@open-rocket-chat/client-sdk';
import { format } from 'date-fns';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { showFeatureNotice } from '@/features/server/feature-notice-store';
import {
  canMuteMember,
  canRemoveMember,
  canSetRoomRole,
  displayNameOf,
  useCapabilities,
} from '@/features/server/use-capabilities';
import { useServerConnection } from '@/features/servers/server-scope';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { Icons, Spinner } from '@/ui/icon';
import { useCreateDirectRoom } from '../../use-room-actions';
import { useCanOpenDirectMessage } from '../../use-rooms';
import { PanelBody, PanelField, QuickAction } from '../panel';
import { useContextualBarStore } from '../store';
import { useRemoveRoomMember, useUpdateRoomMember } from '../use-member-actions';
import { useRoomRoles, useUserProfile } from '../use-panels';

const ROLE_ICON: Record<RoomMemberRole, keyof typeof Icons> = {
  owner: 'roleOwner',
  moderator: 'roleModerator',
  leader: 'roleLeader',
};

/**
 * A member's profile, and what may be done to them in this room.
 *
 * Every action is gated twice, the way Rocket.Chat gates them: on the caller's
 * permission, and on the room being one where the action means anything — there
 * is no owner to promote in a direct message, and nobody to remove from one.
 */
export const UserInfoPanel = ({
  userId,
  room,
  roomId,
  onOpenRoom,
}: {
  userId: string;
  room: RoomSummary | undefined;
  roomId: string;
  onOpenRoom: (roomId: string) => void;
}) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');

  const close = useContextualBarStore((state) => state.close);
  const back = useContextualBarStore((state) => state.back);

  const connection = useServerConnection();
  const { data: capabilities } = useCapabilities();
  const { data: profile, isPending, error } = useUserProfile(userId);
  const { data: roles } = useRoomRoles(roomId);

  const updateMember = useUpdateRoomMember(roomId);
  const removeMember = useRemoveRoomMember(roomId);
  const createDirect = useCreateDirectRoom();
  const canOpenDirect = useCanOpenDirectMessage(profile?.username);

  const [confirmingRemove, setConfirmingRemove] = useState(false);

  if (isPending) {
    return (
      <PanelBody>
        <p className="text-content-muted flex items-center justify-center gap-2 py-10 text-sm">
          <Spinner className="size-4" /> {tCommon('state.loading')}
        </p>
      </PanelBody>
    );
  }

  if (error || !profile) {
    return (
      <PanelBody>
        <p role="alert" className="text-danger px-4 py-10 text-center text-sm">
          {describeError(error)}
        </p>
      </PanelBody>
    );
  }

  const isSelf = profile.id === connection.user.id;
  const membership = roles?.byUserId.get(profile.id) ?? roles?.byUsername.get(profile.username);
  const heldRoles = membership?.roles ?? [];
  const isMuted = membership?.muted ?? false;
  const name = displayNameOf(capabilities, profile);

  const toggleRole = (role: RoomMemberRole) =>
    updateMember.mutate({ userId: profile.id, changes: { [role]: !heldRoles.includes(role) } });

  return (
    <PanelBody>
      <div className="flex flex-col items-center px-4 pt-5 text-center">
        <Avatar name={name} src={profile.avatarUrl} size="xl" status={profile.status} />

        <h3 className="mt-3 text-lg font-semibold break-words">{name}</h3>
        <p className="text-content-muted text-xs">@{profile.username}</p>

        {profile.statusText ? <p className="text-content-secondary mt-1.5 text-sm">{profile.statusText}</p> : null}

        {heldRoles.length > 0 ? (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {heldRoles.map((role) => {
              const RoleIcon = Icons[ROLE_ICON[role]];
              return (
                <span
                  key={role}
                  className="bg-accent-subtle text-accent inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium"
                >
                  <RoleIcon size={12} />
                  {t(`members.role.${role}`)}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>

      {!isSelf ? (
        <div className="mt-4 flex gap-1 px-3">
          <QuickAction
            label={t('userInfo.message')}
            icon={<Icons.direct size={20} />}
            onClick={() => {
              // Kept visible when the server withholds `create-d`: pressing it
              // explains that, which a vanished button cannot.
              if (canOpenDirect === false) {
                showFeatureNotice('createDirect');
                return;
              }

              createDirect.mutate(profile.username, {
                onSuccess: (created) => {
                  onOpenRoom(created.id);
                  close();
                },
              });
            }}
          />
          {canMuteMember(capabilities, room) ? (
            <QuickAction
              label={isMuted ? t('userInfo.unmute') : t('userInfo.mute')}
              active={isMuted}
              icon={<Icons.muteMember size={20} />}
              onClick={() => updateMember.mutate({ userId: profile.id, changes: { muted: !isMuted } })}
            />
          ) : null}
          {canRemoveMember(capabilities, room) ? (
            <QuickAction
              label={t('userInfo.remove')}
              icon={<Icons.removeMember size={20} />}
              danger
              onClick={() => setConfirmingRemove(true)}
            />
          ) : null}
        </div>
      ) : null}

      <dl className="border-line mt-4 border-t pt-2">
        {profile.bio ? <PanelField label={t('userInfo.bio')}>{profile.bio}</PanelField> : null}
        {profile.email ? <PanelField label={t('userInfo.email')}>{profile.email}</PanelField> : null}
        {profile.timezone ? <PanelField label={t('userInfo.timezone')}>{profile.timezone}</PanelField> : null}
        {profile.roles.length > 0 ? (
          <PanelField label={t('userInfo.serverRoles')}>{profile.roles.join(', ')}</PanelField>
        ) : null}
        {profile.createdAt ? (
          <PanelField label={t('userInfo.joinedAt')}>{format(new Date(profile.createdAt), 'd MMMM yyyy')}</PanelField>
        ) : null}
      </dl>

      {!isSelf ? (
        <div className="border-line mt-2 space-y-1 border-t px-3 py-3">
          {(['owner', 'moderator', 'leader'] as const)
            .filter((role) => canSetRoomRole(capabilities, room, role))
            .map((role) => {
              const RoleIcon = Icons[ROLE_ICON[role]];
              const held = heldRoles.includes(role);

              return (
                <button
                  key={role}
                  type="button"
                  disabled={updateMember.isPending}
                  onClick={() => toggleRole(role)}
                  className="hover:bg-sunken flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors disabled:opacity-60"
                >
                  <RoleIcon size={16} className={held ? 'text-accent' : 'text-content-muted'} />
                  <span className="flex-1">{held ? t(`members.remove.${role}`) : t(`members.set.${role}`)}</span>
                  {held ? <Icons.success size={15} className="text-accent" /> : null}
                </button>
              );
            })}
        </div>
      ) : null}

      {confirmingRemove ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('userInfo.removeConfirm.title', { name })}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label={tCommon('action.cancel')}
            className="bg-overlay absolute inset-0"
            onClick={() => setConfirmingRemove(false)}
          />
          <div className="bg-panel border-line relative w-full max-w-sm rounded-xl border p-5 shadow-lg">
            <h2 className="text-base font-semibold">{t('userInfo.removeConfirm.title', { name })}</h2>
            <p className="text-content-muted mt-1.5 text-sm">
              {t('userInfo.removeConfirm.detail', { room: room?.displayName ?? '' })}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" onClick={() => setConfirmingRemove(false)}>
                {tCommon('action.cancel')}
              </Button>
              <Button
                size="sm"
                variant="primary"
                className={cn('bg-danger hover:bg-danger/90')}
                disabled={removeMember.isPending}
                onClick={() =>
                  removeMember.mutate(profile.id, {
                    onSuccess: () => {
                      setConfirmingRemove(false);
                      // Back to the member list, which no longer contains them.
                      back();
                    },
                  })
                }
              >
                {t('userInfo.remove')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PanelBody>
  );
};
