import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';

import { Button } from '@/ui/button';
import { Icons } from '@/ui/icon';
import { useFeatureNoticeStore, type UnavailableReason } from './feature-notice-store';

/**
 * Whether the refusal comes from a permission the account lacks or from a
 * feature switched off for the whole server. The two need different advice: one
 * is asked for, the other has to be turned on.
 */
const SOURCE: Record<UnavailableReason, 'permission' | 'setting'> = {
  createRoom: 'permission',
  createChannel: 'permission',
  createPrivate: 'permission',
  createDirect: 'permission',
  setReadOnly: 'permission',
  encryption: 'setting',
  changeRoomType: 'permission',
  changeAvatar: 'setting',
};

/**
 * Explains a control the server will not honour.
 *
 * Mounted once beside the other global dialogs, and driven by a store rather
 * than props: the controls that raise it are spread across the sidebar, the
 * room drawer and the contextual bar, and none of them owns the others.
 */
export const FeatureNoticeDialog = () => {
  const { t } = useTranslation('common');

  const reason = useFeatureNoticeStore((state) => state.reason);
  const dismiss = useFeatureNoticeStore((state) => state.dismiss);

  return (
    <Dialog.Root open={reason !== null} onOpenChange={(next) => !next && dismiss()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="bg-panel border-line fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-lg">
          <div className="flex items-start gap-3">
            <span className="text-content-muted mt-0.5 shrink-0">
              <Icons.info size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold">{t('unavailable.title')}</Dialog.Title>
              <Dialog.Description className="text-content-secondary mt-1.5 text-sm">
                {/* `reason` is null only while the dialog is closed, and Radix
                    keeps the content mounted long enough to animate out. */}
                {reason ? t(`unavailable.reason.${reason}`) : null}
              </Dialog.Description>
              {reason ? (
                <p className="text-content-muted mt-3 text-xs">{t(`unavailable.${SOURCE[reason]}Hint`)}</p>
              ) : null}
            </div>
          </div>

          <Button variant="primary" size="md" className="mt-5 w-full" onClick={dismiss}>
            {t('action.close')}
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
