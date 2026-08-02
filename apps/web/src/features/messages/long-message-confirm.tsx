import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';

import { Button } from '@/ui/button';

/**
 * Asks before a draft the server would refuse for its length is posted as a
 * text file instead.
 *
 * Rocket.Chat asks the same question, and it is worth asking: the message
 * arrives as an attachment people have to open rather than as text in the
 * timeline, which is not what somebody who pressed send was picturing.
 */
export const LongMessageConfirm = ({
  open,
  onOpenChange,
  limit,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The server's character limit, so the question can say what was exceeded. */
  limit: number;
  pending?: boolean;
  onConfirm: () => void;
}) => {
  const { t } = useTranslation('composer');
  const { t: tCommon } = useTranslation('common');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-overlay fixed inset-0 z-40" />
        <Dialog.Content className="bg-panel border-line fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-lg">
          <Dialog.Title className="text-base font-semibold">{t('longMessage.title')}</Dialog.Title>
          <Dialog.Description className="text-content-muted mt-1.5 text-sm">
            {t('longMessage.detail', { limit })}
          </Dialog.Description>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button size="sm">{tCommon('action.cancel')}</Button>
            </Dialog.Close>
            <Button size="sm" variant="primary" disabled={pending} onClick={onConfirm}>
              {t('longMessage.confirm')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
