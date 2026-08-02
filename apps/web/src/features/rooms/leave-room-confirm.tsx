import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';

import { Button } from '@/ui/button';

/**
 * Asks before leaving a room, since it is not undoable without an invitation
 * back.
 *
 * On Radix's dialog rather than a hand-rolled overlay so it renders through a
 * portal on `document.body`. The triggers for this live inside transformed
 * ancestors — the sidebar's hover actions are positioned with a
 * `-translate-y-1/2` — and a transform makes that element the containing block
 * for `position: fixed` descendants, which collapsed an in-place overlay to the
 * size of the little action strip instead of the viewport. The portal also
 * brings the modal behaviour the hand-rolled version lacked: focus trapping,
 * Escape to dismiss, and focus returned to the trigger on close.
 */
export const LeaveRoomConfirm = ({
  open,
  onOpenChange,
  roomName,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomName: string;
  pending?: boolean;
  onConfirm: () => void;
}) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-overlay fixed inset-0 z-40" />
        <Dialog.Content className="bg-panel border-line fixed top-1/2 left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-lg">
          <Dialog.Title className="text-base font-semibold">{t('leaveConfirm.title', { name: roomName })}</Dialog.Title>
          <Dialog.Description className="text-content-muted mt-1.5 text-sm">
            {t('leaveConfirm.detail')}
          </Dialog.Description>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button size="sm">{tCommon('action.cancel')}</Button>
            </Dialog.Close>
            <Button
              size="sm"
              variant="primary"
              className="bg-danger hover:bg-danger/90"
              disabled={pending}
              onClick={onConfirm}
            >
              {t('leaveConfirm.confirm')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
