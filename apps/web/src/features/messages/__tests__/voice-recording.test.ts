import { describe, expect, it } from 'vitest';

import { formatRecordingTime, MAX_RECORDING_SECONDS } from '../use-voice-recording';

describe('formatRecordingTime', () => {
  it('pads the seconds, so the timer does not jump width as it counts', () => {
    expect(formatRecordingTime(0)).toBe('0:00');
    expect(formatRecordingTime(9)).toBe('0:09');
    expect(formatRecordingTime(95)).toBe('1:35');
  });

  it('carries past an hour rather than wrapping', () => {
    expect(formatRecordingTime(3_600)).toBe('60:00');
  });

  it('formats the cap the recorder stops at', () => {
    expect(formatRecordingTime(MAX_RECORDING_SECONDS)).toBe('5:00');
  });
});
