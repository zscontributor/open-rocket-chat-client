import { describe, expect, it } from 'vitest';

import { formatVolume, shouldPlaySound } from '../sound';

describe('formatVolume', () => {
  it('maps the preference range onto what an audio element takes', () => {
    expect(formatVolume(100)).toBe(1);
    expect(formatVolume(50)).toBe(0.5);
    expect(formatVolume(0)).toBe(0);
  });

  it('clamps anything outside the range rather than throwing at assignment', () => {
    expect(formatVolume(200)).toBe(1);
    expect(formatVolume(-10)).toBe(0);
  });
});

describe('shouldPlaySound', () => {
  it('stays silent for a room set to none', () => {
    expect(shouldPlaySound('none')).toBe(false);
  });

  it('plays for a room with no preference of its own', () => {
    expect(shouldPlaySound(null)).toBe(true);
    expect(shouldPlaySound(undefined)).toBe(true);
  });

  it('plays the one sound it has for a custom choice it cannot honour', () => {
    // The server allows uploaded sounds; this client ships a single file. The
    // room still asked to be heard, so it is heard.
    expect(shouldPlaySound('chime')).toBe(true);
  });
});
