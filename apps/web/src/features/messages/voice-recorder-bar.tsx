import { useTranslation } from 'react-i18next';

import { Icons } from '@/ui/icon';
import { formatRecordingTime, MAX_RECORDING_SECONDS } from './use-voice-recording';

/**
 * The composer's toolbar while a voice message is being recorded.
 *
 * It replaces the toolbar rather than sitting above it: half the buttons there
 * would do nothing useful mid-recording, and a row that stays put keeps the box
 * from jumping as the recording starts.
 */
export const VoiceRecorderBar = ({
  seconds,
  starting,
  onCancel,
  onStop,
}: {
  seconds: number;
  /** Waiting on the microphone permission prompt. */
  starting?: boolean;
  onCancel: () => void;
  onStop: () => void;
}) => {
  const { t } = useTranslation('composer');

  const remaining = MAX_RECORDING_SECONDS - seconds;

  return (
    <div className="flex items-center gap-2 px-2 pb-2" role="group" aria-label={t('voice.recording')}>
      {/* The pulse is the only thing that says this is live, so it is the one
          piece of motion here — and it respects `prefers-reduced-motion`. */}
      <span aria-hidden className="bg-danger size-2.5 shrink-0 rounded-full motion-safe:animate-pulse" />

      {/* Announced politely so the timer does not interrupt what is being said. */}
      <span aria-live="polite" className="text-content text-sm font-medium tabular-nums">
        {starting ? t('voice.starting') : formatRecordingTime(seconds)}
      </span>

      <span className="text-content-muted min-w-0 flex-1 truncate text-xs">
        {remaining <= 30 && !starting ? t('voice.remaining', { seconds: remaining }) : t('voice.hint')}
      </span>

      <button
        type="button"
        aria-label={t('voice.cancel')}
        title={t('voice.cancel')}
        onClick={onCancel}
        className="text-content-muted hover:bg-sunken hover:text-danger flex size-8 items-center justify-center rounded-md transition-colors"
      >
        <Icons.delete size={18} />
      </button>

      <button
        type="button"
        aria-label={t('voice.stop')}
        title={t('voice.stop')}
        disabled={starting}
        onClick={onStop}
        className="bg-accent text-accent-content hover:bg-accent-hover flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors disabled:opacity-40"
      >
        <Icons.stop size={18} />
      </button>
    </div>
  );
};
