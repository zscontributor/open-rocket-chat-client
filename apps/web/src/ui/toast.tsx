import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import { useToastStore, type Toast, type ToastPlacement } from '@/stores/toast-store';
import { Icons } from '@/ui/icon';

const TONE_STYLE: Record<Toast['tone'], { icon: keyof typeof Icons; accent: string }> = {
  error: { icon: 'error', accent: 'text-danger' },
  success: { icon: 'success', accent: 'text-success' },
};

const ToastRow = ({ toast }: { toast: Toast }) => {
  const { t } = useTranslation('common');
  const dismiss = useToastStore((state) => state.dismiss);

  // Reading a sentence takes longer than the timer allows for some people, and
  // a notice that vanishes mid-sentence is worse than none. Pointing at it or
  // tabbing into it holds it; leaving restarts the full duration rather than
  // resuming, which is the forgiving direction to round in.
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held || toast.durationMs <= 0) return;

    const timer = setTimeout(() => dismiss(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [dismiss, held, toast.durationMs, toast.id]);

  const tone = TONE_STYLE[toast.tone];
  const ToneIcon = Icons[tone.icon];

  return (
    <div
      // `alert` interrupts a screen reader, which is right for a failure the
      // user is waiting on and wrong for a confirmation of what they just did.
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
      className={cn(
        'bg-panel border-line pointer-events-auto flex w-[min(24rem,calc(100vw-2rem))] items-start gap-2.5 rounded-xl border p-3 shadow-lg',
        // Slides in from whichever edge it is anchored to.
        toast.placement === 'bottom-right'
          ? 'motion-safe:animate-[toast-in-right_150ms_ease-out]'
          : 'motion-safe:animate-[toast-in_150ms_ease-out]',
      )}
    >
      <ToneIcon size={18} className={cn('mt-px shrink-0', tone.accent)} />

      <div className="min-w-0 flex-1">
        {toast.title ? <p className="text-sm font-medium break-words">{toast.title}</p> : null}
        <p className={cn('text-sm break-words', toast.title ? 'text-content-secondary mt-0.5' : '')}>{toast.message}</p>
      </div>

      <button
        type="button"
        aria-label={t('action.close')}
        onClick={() => dismiss(toast.id)}
        className="text-content-muted hover:bg-sunken hover:text-content -m-1 shrink-0 rounded-md p-1 transition-colors"
      >
        <Icons.close size={16} />
      </button>
    </div>
  );
};

/**
 * The app's one place for things the server said that no panel owns.
 *
 * Most failures belong beside the control that caused them — a form renders its
 * own error next to the submit button. But a rejected reaction, a room the
 * server refuses to create from a user card, or a mute that does not take have
 * nowhere to put a message, and before this they failed in silence.
 *
 * Bottom-left by default, not bottom-right: the composer's send button and the
 * message actions live on the right, and a notice that lands on top of them
 * blocks the retry it is asking for. A toast can still ask for the right
 * corner — sign-in does, since it happens before there is any composer to
 * cover.
 */
const Stack = ({ placement, toasts }: { placement: ToastPlacement; toasts: Toast[] }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      // Pointer events are re-enabled per toast so the gaps between them do not
      // swallow clicks meant for the room underneath.
      className={cn(
        'pointer-events-none fixed bottom-4 z-[60] flex flex-col gap-2',
        placement === 'bottom-right' ? 'right-4 items-end' : 'left-4',
      )}
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
    </div>
  );
};

export const Toaster = () => {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <>
      <Stack placement="bottom-left" toasts={toasts.filter((toast) => toast.placement === 'bottom-left')} />
      <Stack placement="bottom-right" toasts={toasts.filter((toast) => toast.placement === 'bottom-right')} />
    </>
  );
};
