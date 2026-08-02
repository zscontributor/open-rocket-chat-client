import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Recording a voice message.
 *
 * The recording is not sent when it stops: it is handed back as a `File` and
 * staged in the attachment tray like any other upload, so it can be listened
 * back to — and thrown away — before anyone else hears it.
 */

/** A recording longer than this is a phone call; the browser stops it for us. */
export const MAX_RECORDING_SECONDS = 5 * 60;

/**
 * In preference order. Opus in WebM is what Chrome and Firefox produce and what
 * Rocket.Chat's own voice messages use; Safari only offers MP4/AAC.
 */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'] as const;

const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  // `.m4a` rather than `.mp4`, so servers and players treat it as audio.
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
};

const extensionFor = (mimeType: string): string => EXTENSIONS[mimeType.split(';')[0] ?? ''] ?? 'webm';

/** False in browsers without `MediaRecorder`, and on any insecure origin. */
export const voiceRecordingSupported = (): boolean =>
  typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';

const pickMimeType = (): string | undefined =>
  MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? undefined;

export type VoiceRecordingStatus = 'idle' | 'starting' | 'recording';

/** Distinguished so the message can say what to do about it. */
export type VoiceRecordingError = 'denied' | 'unsupported' | 'failed';

export interface UseVoiceRecordingResult {
  status: VoiceRecordingStatus;
  /** Elapsed whole seconds, for the timer next to the controls. */
  seconds: number;
  error: VoiceRecordingError | null;
  supported: boolean;
  start: () => Promise<void>;
  /** Ends the recording and hands the file to `onComplete`. */
  stop: () => void;
  /** Ends it and throws the audio away. */
  cancel: () => void;
}

export const useVoiceRecording = ({ onComplete }: { onComplete: (file: File) => void }): UseVoiceRecordingResult => {
  const [status, setStatus] = useState<VoiceRecordingStatus>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<VoiceRecordingError | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  /** Cleared by `cancel`, so the `stop` handler knows to discard the audio. */
  const keep = useRef(true);
  const ticker = useRef<ReturnType<typeof setInterval>>(undefined);
  /**
   * Bumped whenever a recording is abandoned, so a microphone request that is
   * still in flight knows its result is no longer wanted.
   *
   * Without it, backing out while the browser's permission prompt is up leaves
   * the composer showing "starting" with nothing able to end it — the recorder
   * that `cancel` would stop does not exist yet.
   */
  const attempt = useRef(0);

  // Held in a ref so starting a recording does not depend on the identity of a
  // callback the composer re-creates on every keystroke.
  const complete = useRef(onComplete);
  useEffect(() => {
    complete.current = onComplete;
  });

  const clearTicker = () => {
    clearInterval(ticker.current);
    ticker.current = undefined;
  };

  /** Gives up on a request for the microphone that has not been answered yet. */
  const abandon = useCallback(() => {
    attempt.current += 1;
    clearInterval(ticker.current);
    ticker.current = undefined;
    setStatus('idle');
    setSeconds(0);
  }, []);

  const stop = useCallback(() => {
    keep.current = true;
    if (recorder.current) recorder.current.stop();
    else abandon();
  }, [abandon]);

  const cancel = useCallback(() => {
    keep.current = false;
    if (recorder.current) recorder.current.stop();
    else abandon();
  }, [abandon]);

  // A recording left running after the composer unmounts would hold the
  // microphone open — and the tab's recording indicator with it.
  useEffect(
    () => () => {
      keep.current = false;
      attempt.current += 1;
      recorder.current?.stop();
      clearInterval(ticker.current);
    },
    [],
  );

  const start = useCallback(async () => {
    if (recorder.current || status !== 'idle') return;

    if (!voiceRecordingSupported()) {
      setError('unsupported');
      return;
    }

    setError(null);
    setStatus('starting');

    const ticket = attempt.current;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (permissionError) {
      // Only report it if this is still the recording the user is waiting on.
      if (ticket !== attempt.current) return;
      setStatus('idle');
      // Everything else — no microphone attached, a device already in use — is
      // reported as a plain failure, because the user's next step differs.
      const name = permissionError instanceof DOMException ? permissionError.name : '';
      setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed');
      return;
    }

    // Backed out while the prompt was up: release the microphone and leave the
    // composer as the user left it.
    if (ticket !== attempt.current) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    const mimeType = pickMimeType();

    let instance: MediaRecorder;
    try {
      instance = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    } catch {
      for (const track of stream.getTracks()) track.stop();
      setStatus('idle');
      setError('unsupported');
      return;
    }

    chunks.current = [];
    keep.current = true;

    instance.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    });

    instance.addEventListener('stop', () => {
      // Releasing the tracks is what actually turns the microphone off; stopping
      // the recorder alone leaves the browser's recording indicator lit.
      for (const track of stream.getTracks()) track.stop();

      const collected = chunks.current;
      chunks.current = [];
      recorder.current = null;
      clearTicker();
      setStatus('idle');
      setSeconds(0);

      if (!keep.current || collected.length === 0) return;

      const type = instance.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(collected, { type });
      if (blob.size === 0) return;

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      complete.current(new File([blob], `voice-message-${stamp}.${extensionFor(type)}`, { type }));
    });

    instance.addEventListener('error', () => {
      keep.current = false;
      setError('failed');
      instance.stop();
    });

    recorder.current = instance;
    instance.start();
    setStatus('recording');
    setSeconds(0);

    ticker.current = setInterval(() => {
      setSeconds((elapsed) => {
        const next = elapsed + 1;
        // Keeps the recording, rather than dropping five minutes of audio for
        // having run over.
        if (next >= MAX_RECORDING_SECONDS) stop();
        return next;
      });
    }, 1_000);
  }, [status, stop]);

  return {
    status,
    seconds,
    error,
    supported: voiceRecordingSupported(),
    start,
    stop,
    cancel,
  };
};

/** `95` -> `1:35`, the format every voice-note UI uses. */
export const formatRecordingTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};
