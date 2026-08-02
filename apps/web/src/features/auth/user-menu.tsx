import { STATUS_TEXT_MAX_LENGTH, type PresenceStatus } from '@open-rocket-chat/client-sdk';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AvatarDialog } from '@/features/auth/avatar-dialog';
import { SELECTABLE_STATUSES } from '@/features/auth/status';
import { useUpdateMyStatus } from '@/features/auth/use-my-status';
import { useLogout, useSession } from '@/features/auth/use-session';
import { showFeatureNotice } from '@/features/server/feature-notice-store';
import {
  canChangeOwnAvatar,
  canChangePresence,
  canChangeStatusMessage,
  useCapabilities,
} from '@/features/server/use-capabilities';
import { useServerConnection } from '@/features/servers/server-scope';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/ui-store';
import { Avatar, STATUS_COLOURS } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { Icons } from '@/ui/icon';
import { Input } from '@/ui/input';

const itemClass =
  'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-sunken data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

/**
 * The status message, edited on its own.
 *
 * Separate from the presence picker because they are separate decisions: a
 * message usually outlives the dot above it, and Rocket.Chat keeps them as two
 * independent fields.
 */
const StatusMessageDialog = ({
  open,
  onOpenChange,
  initialText,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialText: string;
  pending: boolean;
  onSubmit: (text: string) => void;
}) => {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const [text, setText] = useState(initialText);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Reopening starts from whatever the server holds now, so an abandoned
        // edit is not still sitting in the box the next time it is opened.
        if (next) setText(initialText);
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="bg-overlay fixed inset-0 z-40" />
        <Dialog.Content className="bg-panel border-line fixed top-1/2 left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-lg outline-none">
          <Dialog.Title className="text-base font-semibold">{t('status.messageTitle')}</Dialog.Title>
          <Dialog.Description className="text-content-muted mt-1 mb-4 text-sm">
            {t('status.messageDescription')}
          </Dialog.Description>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(text.trim());
            }}
          >
            <Input
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={STATUS_TEXT_MAX_LENGTH}
              placeholder={t('status.messagePlaceholder')}
              aria-label={t('status.messageTitle')}
            />
            <p className="text-content-muted mt-1.5 text-right text-xs">
              {text.length}/{STATUS_TEXT_MAX_LENGTH}
            </p>

            <div className="mt-4 flex justify-end gap-2">
              {/* Clearing is its own button rather than "save an empty box":
                  emptying a field and pressing save reads as a mistake, and
                  this way the destructive option says what it does. */}
              {initialText ? (
                <Button variant="ghost" className="mr-auto" disabled={pending} onClick={() => onSubmit('')}>
                  {t('status.clearMessage')}
                </Button>
              ) : null}

              <Dialog.Close asChild>
                <Button variant="outline" disabled={pending}>
                  {tCommon('action.cancel')}
                </Button>
              </Dialog.Close>

              <Button type="submit" variant="primary" disabled={pending}>
                {tCommon('action.save')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/**
 * The account block at the foot of the sidebar: who you are on this server,
 * and everything that follows from that — presence, status message, signing
 * out.
 *
 * Presence is set per server rather than per session, because that is what
 * Rocket.Chat stores: an account signed in to two servers is a different
 * account on each, and there is no upstream notion of a status spanning both.
 * Signing out, by contrast, is offered for the whole session as well as for
 * this one server, since the rail that disconnects a single server is hidden
 * when only one is connected.
 */
export const UserMenu = () => {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const { user, server } = useServerConnection();
  const { data: session } = useSession();
  const connection = useUiStore((state) => state.connection);
  const logout = useLogout();
  const updateStatus = useUpdateMyStatus();
  const { data: capabilities } = useCapabilities();
  const [messageOpen, setMessageOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  const canChangeAvatar = canChangeOwnAvatar(capabilities);
  const canSetPresence = canChangePresence(capabilities);
  const canSetStatusMessage = canChangeStatusMessage(capabilities);

  const isOnline = connection === 'connected';
  const multiServer = (session?.connections.length ?? 1) > 1;
  const statusText = user.statusText ?? '';
  // A server that reports no presence for its own signed-in user is reporting
  // a gap, not invisibility, so the picker falls back to what it means.
  const currentStatus = user.status ?? 'online';

  const connectionLabel = isOnline
    ? tCommon('connection.connected')
    : connection === 'closed'
      ? tCommon('connection.offline')
      : tCommon('connection.connecting');

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={t('account.menu')}
            className="hover:bg-sunken -mx-1 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors outline-none"
          >
            <Avatar
              name={user.displayName}
              src={user.avatarUrl}
              size="sm"
              // A dot claiming "online" while the socket is down would be a
              // lie: the presence others see is only as current as the
              // connection carrying it.
              status={isOnline ? currentStatus : 'offline'}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.displayName}</p>
              {/* The status message wins the line when there is one — it is
                  the thing the user chose to say. Otherwise the server is
                  named, because the same username can exist on several of them
                  and the rail only shows an initial. */}
              <p className="text-content-muted truncate text-[11px]">
                {statusText || `${server.name} · ${connectionLabel}`}
              </p>
            </div>
            <Icons.chevronDown size={14} className="text-content-muted shrink-0" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={8}
            className="bg-panel border-line z-50 min-w-60 rounded-lg border p-1 shadow-lg"
          >
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium">{user.displayName}</p>
              <p className="text-content-muted truncate text-[11px]">
                @{user.username} · {server.name}
              </p>
            </div>

            {canSetPresence || canSetStatusMessage ? <DropdownMenu.Separator className="bg-line my-1 h-px" /> : null}

            {canSetPresence ? (
              <>
                <DropdownMenu.Label className="text-content-muted px-2 py-1 text-xs font-semibold">
                  {t('status.title')}
                </DropdownMenu.Label>

                <DropdownMenu.RadioGroup
                  value={currentStatus}
                  // Radix reports a selection even when it is the one already in
                  // force, and asking Rocket.Chat to set the status it is already
                  // showing is a round trip nobody asked for.
                  onValueChange={(value) =>
                    value !== currentStatus && updateStatus.mutate({ status: value as PresenceStatus })
                  }
                >
                  {SELECTABLE_STATUSES.map((status) => (
                    <DropdownMenu.RadioItem
                      key={status}
                      value={status}
                      disabled={updateStatus.isPending}
                      className={itemClass}
                    >
                      <span className={cn('size-2.5 shrink-0 rounded-full', STATUS_COLOURS[status])} />
                      <span className="flex-1">{t(`status.${status}`)}</span>
                      <DropdownMenu.ItemIndicator>
                        <Icons.success size={16} className="text-accent" />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </>
            ) : null}

            {canSetPresence && canSetStatusMessage ? <DropdownMenu.Separator className="bg-line my-1 h-px" /> : null}

            {canSetStatusMessage ? (
              <DropdownMenu.Item className={itemClass} onSelect={() => setMessageOpen(true)}>
                <Icons.edit size={16} className="shrink-0" />
                <span className="flex-1 truncate">{statusText || t('status.setMessage')}</span>
              </DropdownMenu.Item>
            ) : null}

            {/* Kept on screen when the server forbids it, and explained on
                press: an entry that quietly vanishes teaches nobody that an
                administrator froze avatars — usually because they come from an
                identity provider instead. */}
            <DropdownMenu.Item
              className={itemClass}
              onSelect={() => (canChangeAvatar ? setAvatarOpen(true) : showFeatureNotice('changeAvatar'))}
            >
              <Icons.upload size={16} className="shrink-0" />
              <span className="flex-1 truncate">{t('avatar.change')}</span>
            </DropdownMenu.Item>

            <DropdownMenu.Separator className="bg-line my-1 h-px" />

            {multiServer ? (
              <DropdownMenu.Item
                className={itemClass}
                disabled={logout.isPending}
                onSelect={() => logout.mutate(server.id)}
              >
                <Icons.signOut size={16} className="shrink-0" />
                {t('action.signOutServer', { name: server.name })}
              </DropdownMenu.Item>
            ) : null}

            <DropdownMenu.Item
              className={cn(itemClass, 'text-danger')}
              disabled={logout.isPending}
              onSelect={() => logout.mutate(undefined)}
            >
              <Icons.signOut size={16} className="shrink-0" />
              {multiServer ? t('action.signOutAll') : t('action.signOut')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <StatusMessageDialog
        open={messageOpen}
        onOpenChange={setMessageOpen}
        initialText={statusText}
        pending={updateStatus.isPending}
        onSubmit={(text) => updateStatus.mutate({ statusText: text }, { onSuccess: () => setMessageOpen(false) })}
      />

      <AvatarDialog open={avatarOpen} onOpenChange={setAvatarOpen} />
    </>
  );
};
