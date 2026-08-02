import { describe, expect, it } from 'vitest';

import {
  clampSize,
  composerBounds,
  contextualBarOverlays,
  isMobileViewport,
  layoutWidth,
  parseStoredSize,
  sidebarBounds,
  sidebarForViewport,
  COMPOSER_HEIGHT,
  CONTEXTUAL_BAR_WIDTH,
  MOBILE_BREAKPOINT,
  SERVER_RAIL_WIDTH,
  SIDEBAR_WIDTH,
} from '../resize';

describe('clampSize', () => {
  const bounds = { min: 100, max: 200 };

  it('keeps a value inside the bounds', () => {
    expect(clampSize(150, bounds)).toBe(150);
    expect(clampSize(20, bounds)).toBe(100);
    expect(clampSize(900, bounds)).toBe(200);
  });

  it('rounds to whole pixels', () => {
    expect(clampSize(150.4, bounds)).toBe(150);
    expect(clampSize(150.6, bounds)).toBe(151);
  });

  it('prefers the minimum when the bounds are inverted', () => {
    // Happens on a viewport too narrow to honour both, and a pane at its
    // minimum is still usable where a pane at a negative max is not.
    expect(clampSize(150, { min: 200, max: 100 })).toBe(200);
  });
});

describe('sidebarBounds', () => {
  it('allows the full width on a roomy viewport', () => {
    expect(sidebarBounds(1600).max).toBe(SIDEBAR_WIDTH.max);
  });

  it('leaves the room header enough to lay itself out on a narrow viewport', () => {
    const bounds = sidebarBounds(900);

    expect(bounds.max).toBeLessThan(SIDEBAR_WIDTH.max);
    // The header's own furniture comes to 356; the name needs the rest.
    expect(900 - bounds.max).toBeGreaterThan(356);
  });

  it('never drops the maximum below the minimum', () => {
    expect(sidebarBounds(320).max).toBe(SIDEBAR_WIDTH.min);
  });
});

describe('layoutWidth', () => {
  it('spends the server rail before the panes get a say', () => {
    expect(layoutWidth(1000, SERVER_RAIL_WIDTH)).toBe(1000 - SERVER_RAIL_WIDTH);
  });

  it('is the whole window when there is no rail to show', () => {
    expect(layoutWidth(1000, 0)).toBe(1000);
  });

  it('does not go negative on a window narrower than the rail', () => {
    expect(layoutWidth(20, SERVER_RAIL_WIDTH)).toBe(0);
  });
});

describe('isMobileViewport', () => {
  it('is the width below which the list and the conversation cannot share', () => {
    expect(isMobileViewport(MOBILE_BREAKPOINT - 1)).toBe(true);
    expect(isMobileViewport(MOBILE_BREAKPOINT)).toBe(false);
  });

  it('covers the phones and clears the tablets', () => {
    expect(isMobileViewport(390)).toBe(true);
    expect(isMobileViewport(1024)).toBe(false);
  });

  it('collapses before the room header loses the room name', () => {
    // The reported case: a 604px window with the server rail on screen left the
    // conversation 304px, which is less than the header's furniture alone.
    expect(isMobileViewport(layoutWidth(604, SERVER_RAIL_WIDTH))).toBe(true);
  });

  it('counts the rail against a window that would otherwise just fit', () => {
    const justFits = MOBILE_BREAKPOINT + 20;

    expect(isMobileViewport(layoutWidth(justFits, 0))).toBe(false);
    expect(isMobileViewport(layoutWidth(justFits, SERVER_RAIL_WIDTH))).toBe(true);
  });
});

describe('contextualBarOverlays', () => {
  it('leaves the bar beside the conversation on a desktop', () => {
    expect(contextualBarOverlays(layoutWidth(1440, SERVER_RAIL_WIDTH), SIDEBAR_WIDTH.default)).toBe(false);
  });

  it('floats it on a phone, where the two cannot share the row', () => {
    // The reported case: the panel took its 280px minimum regardless and left
    // the room a sliver too narrow to draw a header in.
    expect(contextualBarOverlays(layoutWidth(390, SERVER_RAIL_WIDTH), 0)).toBe(true);
  });

  it('counts the room list against the width, since the two share a conversation', () => {
    // Wide enough beside a collapsed list, not beside an open one.
    expect(contextualBarOverlays(900, 0)).toBe(false);
    expect(contextualBarOverlays(900, SIDEBAR_WIDTH.default)).toBe(true);
  });

  it('gives way exactly when the header no longer fits beside the panel', () => {
    // 356px is the header's own furniture — its padding, the room icon and the
    // toolbox — which is what the conversation left over has to hold.
    expect(contextualBarOverlays(356 + CONTEXTUAL_BAR_WIDTH.min, 0)).toBe(false);
    expect(contextualBarOverlays(355 + CONTEXTUAL_BAR_WIDTH.min, 0)).toBe(true);
  });

  it('holds out longer than the room list collapse does', () => {
    // The list gives up its width first: it leaves a rail one tap from coming
    // back, where a floating panel takes the conversation off screen entirely.
    expect(contextualBarOverlays(MOBILE_BREAKPOINT, 0)).toBe(false);
  });
});

describe('sidebarForViewport', () => {
  const desktop = { sidebarOpen: true, sidebarAutoCollapsed: false, viewportIsMobile: false };

  it('collapses the list on the way down to a phone', () => {
    expect(sidebarForViewport(desktop, true)).toEqual({
      sidebarOpen: false,
      sidebarAutoCollapsed: true,
      viewportIsMobile: true,
    });
  });

  it('gives it back on the way out', () => {
    const collapsed = { sidebarOpen: false, sidebarAutoCollapsed: true, viewportIsMobile: true };

    expect(sidebarForViewport(collapsed, false)).toEqual({
      sidebarOpen: true,
      sidebarAutoCollapsed: false,
      viewportIsMobile: false,
    });
  });

  it('leaves a list the user closed themselves closed', () => {
    const closed = { sidebarOpen: false, sidebarAutoCollapsed: false, viewportIsMobile: true };

    expect(sidebarForViewport(closed, false)?.sidebarOpen).toBe(false);
  });

  it('does not close a list the user reopened on the phone', () => {
    // Every keyboard opening fires a resize; none of them may shut the drawer.
    const reopened = { sidebarOpen: true, sidebarAutoCollapsed: false, viewportIsMobile: true };

    expect(sidebarForViewport(reopened, true)).toBeNull();
  });

  it('says nothing at all while the viewport stays on one side of the line', () => {
    expect(sidebarForViewport(desktop, false)).toBeNull();
  });
});

describe('composerBounds', () => {
  it('caps at half the viewport so the timeline stays visible', () => {
    expect(composerBounds(600).max).toBe(300);
  });

  it('does not exceed the absolute maximum on a tall viewport', () => {
    expect(composerBounds(2000).max).toBe(COMPOSER_HEIGHT.max);
  });

  it('never drops the maximum below the minimum', () => {
    expect(composerBounds(40).max).toBe(COMPOSER_HEIGHT.min);
  });
});

describe('parseStoredSize', () => {
  const bounds = { min: 100, max: 200 };

  it('reads a stored number back', () => {
    expect(parseStoredSize('150', bounds)).toBe(150);
  });

  it('clamps a stored value that no longer fits', () => {
    expect(parseStoredSize('4000', bounds)).toBe(200);
  });

  it('falls back to the default for missing or corrupt values', () => {
    expect(parseStoredSize(null, bounds)).toBeNull();
    expect(parseStoredSize('', bounds)).toBeNull();
    expect(parseStoredSize('wide', bounds)).toBeNull();
  });
});
