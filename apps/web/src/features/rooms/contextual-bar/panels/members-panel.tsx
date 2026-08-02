import type { RoomMemberRole, RoomSummary, UserSummary } from '@open-rocket-chat/client-sdk';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { canAddMembers, displayNameOf, useCapabilities } from '@/features/server/use-capabilities';
import { useServerConnection } from '@/features/servers/server-scope';
import { cn } from '@/lib/cn';
import { Avatar } from '@/ui/avatar';
import { Icons } from '@/ui/icon';
import { LoadMore, PanelBody, PanelSearch, PanelState, PanelToolbar } from '../panel';
import { useContextualBarStore } from '../store';
import { useDebounced, useRoomMemberPage, useRoomRoles } from '../use-panels';

const ROLE_ICON: Record<RoomMemberRole, keyof typeof Icons> = {
  owner: 'roleOwner',
  moderator: 'roleModerator',
  leader: 'roleLeader',
};

/**
 * The highest role a member holds, if any.
 *
 * Only one is shown: Rocket.Chat ranks them owner → leader → moderator, and a
 * row wide enough for three badges is a row with no room left for a name.
 */
const topRole = (roles: RoomMemberRole[]): RoomMemberRole | undefined =>
  (['owner', 'leader', 'moderator'] as const).find((role) => roles.includes(role));

export const MembersPanel = ({ room, roomId }: { room: RoomSummary | undefined; roomId: string }) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');

  const push = useContextualBarStore((state) => state.push);
  const connection = useServerConnection();
  const { data: capabilities } = useCapabilities();

  const [query, setQuery] = useState('');
  // Rocket.Chat opens on the people who are around, because in a large channel
  // the full roll is mostly people who are not.
  const [onlineOnly, setOnlineOnly] = useState(true);
  const debouncedQuery = useDebounced(query);

  const members = useRoomMemberPage(roomId, { q: debouncedQuery, onlineOnly });
  const { data: roles } = useRoomRoles(roomId);

  const items = members.data?.members ?? [];
  const total = members.data?.total ?? 0;

  return (
    <>
      <PanelToolbar>
        <PanelSearch
          value={query}
          onChange={setQuery}
          label={t('members.search')}
          placeholder={t('members.searchPlaceholder')}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="bg-sunken flex rounded-lg p-0.5">
            {(
              [
                { value: true, label: t('members.filterOnline') },
                { value: false, label: t('members.filterAll') },
              ] as const
            ).map((option) => (
              <button
                key={String(option.value)}
                type="button"
                aria-pressed={onlineOnly === option.value}
                onClick={() => setOnlineOnly(option.value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  onlineOnly === option.value
                    ? 'bg-panel text-content shadow-sm'
                    : 'text-content-muted hover:text-content',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* The bare key, not `memberCount_other`: naming a plural form
              directly skips i18next's plural selection and reads "1 members".
              The key is `memberCount` rather than `members` because this
              namespace already has a `members` object for the panel's own
              strings, and a key cannot be both. */}
          {members.isSuccess ? (
            <span className="text-content-muted text-xs tabular-nums">{t('memberCount', { count: total })}</span>
          ) : null}
        </div>

        {canAddMembers(capabilities, room) ? (
          <button
            type="button"
            onClick={() => push({ id: 'add-members' })}
            className="text-accent flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-xs font-medium hover:underline"
          >
            <Icons.addMembers size={16} />
            {t('action.addMembers')}
          </button>
        ) : null}
      </PanelToolbar>

      <PanelBody>
        <PanelState
          loading={members.isPending}
          error={members.error}
          empty={items.length === 0}
          emptyIcon={<Icons.members size={32} />}
          emptyLabel={debouncedQuery ? t('members.noMatches', { query: debouncedQuery }) : t('members.empty')}
        >
          <ul>
            {items.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                roles={roles?.byUserId.get(member.id)?.roles ?? []}
                muted={roles?.byUserId.get(member.id)?.muted ?? roles?.byUsername.get(member.username)?.muted ?? false}
                isSelf={member.id === connection.user.id}
                name={displayNameOf(capabilities, member)}
                youLabel={t('info.you')}
                mutedLabel={t('members.muted')}
                presenceLabel={member.status ? tCommon(`presence.${member.status}`) : undefined}
                onOpen={() => push({ id: 'user-info', userId: member.id })}
              />
            ))}
          </ul>

          {members.hasNextPage ? (
            <LoadMore onClick={() => void members.fetchNextPage()} loading={members.isFetchingNextPage} />
          ) : null}
        </PanelState>
      </PanelBody>
    </>
  );
};

const MemberRow = ({
  member,
  roles,
  muted,
  isSelf,
  name,
  youLabel,
  mutedLabel,
  presenceLabel,
  onOpen,
}: {
  member: UserSummary;
  roles: RoomMemberRole[];
  muted: boolean;
  isSelf: boolean;
  name: string;
  youLabel: string;
  mutedLabel: string;
  presenceLabel: string | undefined;
  onOpen: () => void;
}) => {
  const role = topRole(roles);
  const RoleIcon = role ? Icons[ROLE_ICON[role]] : null;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="hover:bg-sunken flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors"
      >
        <Avatar name={name} src={member.avatarUrl} size="sm" status={member.status} />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{name}</span>
            {isSelf ? (
              <span className="bg-sunken text-content-muted shrink-0 rounded px-1.5 py-0.5 text-[10px]">
                {youLabel}
              </span>
            ) : null}
            {muted ? (
              <span title={mutedLabel} className="shrink-0">
                <Icons.muteMember size={13} className="text-content-muted" />
                <span className="sr-only">{mutedLabel}</span>
              </span>
            ) : null}
          </span>
          {presenceLabel ? <span className="text-content-muted block text-[11px]">{presenceLabel}</span> : null}
        </span>

        {RoleIcon ? <RoleIcon size={15} className="text-content-muted shrink-0" /> : null}
      </button>
    </li>
  );
};
