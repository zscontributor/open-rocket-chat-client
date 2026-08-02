import { describe, expect, it } from 'vitest';

import { hasModifier, sendsOnEnter } from '../keys';

const press = (held: Partial<{ meta: boolean; ctrl: boolean; shift: boolean }> = {}) => ({
  metaKey: held.meta ?? false,
  ctrlKey: held.ctrl ?? false,
  shiftKey: held.shift ?? false,
});

describe('hasModifier', () => {
  it('accepts either platform modifier', () => {
    expect(hasModifier(press({ meta: true }))).toBe(true);
    expect(hasModifier(press({ ctrl: true }))).toBe(true);
    expect(hasModifier(press())).toBe(false);
  });
});

describe('sendsOnEnter', () => {
  describe('with "Enter to send" on', () => {
    it('sends on a bare Enter', () => {
      expect(sendsOnEnter(press(), true)).toBe(true);
    });

    it('holds back for Shift, which opens a new line', () => {
      expect(sendsOnEnter(press({ shift: true }), true)).toBe(false);
    });

    it('still sends on the modifier chord', () => {
      // Flipping the switch must not take away a chord someone already uses.
      expect(sendsOnEnter(press({ meta: true }), true)).toBe(true);
      expect(sendsOnEnter(press({ ctrl: true }), true)).toBe(true);
    });
  });

  describe('with "Enter to send" off', () => {
    it('lets a bare Enter through as a new line', () => {
      expect(sendsOnEnter(press(), false)).toBe(false);
    });

    it('sends on the modifier chord instead', () => {
      expect(sendsOnEnter(press({ meta: true }), false)).toBe(true);
      expect(sendsOnEnter(press({ ctrl: true }), false)).toBe(true);
    });

    it('leaves Shift + Enter a new line', () => {
      expect(sendsOnEnter(press({ shift: true }), false)).toBe(false);
    });
  });
});
