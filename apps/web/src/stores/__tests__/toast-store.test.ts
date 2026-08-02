import { beforeEach, describe, expect, it } from 'vitest';

import { showToast, useToastStore } from '../toast-store';

const toasts = () => useToastStore.getState().toasts;

beforeEach(() => {
  useToastStore.getState().clear();
});

describe('toast store', () => {
  it('gives every notice its own duration by tone', () => {
    showToast({ tone: 'error', message: 'refused' });
    showToast({ tone: 'success', message: 'done' });

    const [failure, confirmation] = toasts();
    expect(failure?.durationMs).toBeGreaterThan(confirmation?.durationMs ?? 0);
  });

  it('honours an explicit duration, including one that never expires', () => {
    showToast({ tone: 'error', message: 'stays', durationMs: 0 });

    expect(toasts()[0]?.durationMs).toBe(0);
  });

  /**
   * Ten reactions rejected by one revoked permission is ten identical
   * failures; stacking them would bury the screen in copies of one sentence.
   */
  it('collapses a repeated notice onto the one already showing', () => {
    const first = showToast({ tone: 'error', message: 'no permission' });
    const second = showToast({ tone: 'error', message: 'no permission' });

    expect(second).toBe(first);
    expect(toasts()).toHaveLength(1);
  });

  it('treats a different title as a different notice', () => {
    showToast({ tone: 'error', message: 'no permission' });
    showToast({ tone: 'error', message: 'no permission', title: 'Leaving the room' });

    expect(toasts()).toHaveLength(2);
  });

  it('drops the oldest rather than covering the composer', () => {
    for (const message of ['one', 'two', 'three', 'four']) showToast({ tone: 'error', message });

    expect(toasts().map((toast) => toast.message)).toEqual(['two', 'three', 'four']);
  });

  it('anchors to the bottom left unless a notice asks otherwise', () => {
    showToast({ tone: 'success', message: 'done' });
    showToast({ tone: 'success', message: 'signed in', placement: 'bottom-right' });

    expect(toasts().map((toast) => toast.placement)).toEqual(['bottom-left', 'bottom-right']);
  });

  /** Two corners means two stacks, so one cannot stand in for the other. */
  it('keeps the same sentence in both corners apart', () => {
    const left = showToast({ tone: 'error', message: 'refused' });
    const right = showToast({ tone: 'error', message: 'refused', placement: 'bottom-right' });

    expect(right).not.toBe(left);
    expect(toasts()).toHaveLength(2);
  });

  it('dismisses by id and leaves the rest alone', () => {
    const id = showToast({ tone: 'error', message: 'one' });
    showToast({ tone: 'error', message: 'two' });

    useToastStore.getState().dismiss(id);

    expect(toasts().map((toast) => toast.message)).toEqual(['two']);
  });
});
