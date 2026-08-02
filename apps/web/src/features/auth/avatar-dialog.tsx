import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';

import { AvatarField } from '@/features/avatars/avatar-field';
import { useUpdateMyAvatar } from '@/features/avatars/use-avatar';
import { useServerConnection } from '@/features/servers/server-scope';
import { Button } from '@/ui/button';

/**
 * The signed-in user's picture, on its own.
 *
 * A dialog rather than a row in the account menu because picking a file opens a
 * second window over the first, and a menu closes the moment focus leaves it —
 * taking the pending upload's error message with it.
 *
 * Scoped to the active server, like presence: an account signed in to two
 * Rocket.Chat servers has a separate profile on each, and Rocket.Chat has no
 * notion of one picture spanning both.
 */
export const AvatarDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');

  const { user, server } = useServerConnection();
  const updateAvatar = useUpdateMyAvatar();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-overlay fixed inset-0 z-40" />
        <Dialog.Content className="bg-panel border-line fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-lg outline-none">
          <Dialog.Title className="text-base font-semibold">{t('avatar.title')}</Dialog.Title>
          <Dialog.Description className="text-content-muted mt-1 mb-4 text-sm">
            {t('avatar.description', { name: server.name })}
          </Dialog.Description>

          <AvatarField
            name={user.displayName}
            src={user.avatarUrl}
            pending={updateAvatar.isPending}
            error={updateAvatar.error}
            onSelect={(image) => updateAvatar.mutate(image)}
            onRemove={() => updateAvatar.mutate(null)}
          />

          {/* No save button: each change is applied as it is made, so the only
              thing left to do here is stop. */}
          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={updateAvatar.isPending}>
                {tCommon('action.close')}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
