/**
 * Geometry for the panes the user can drag: the room list and the message box.
 *
 * Kept free of React and of the DOM so the clamping rules — the part that is
 * easy to get subtly wrong — can be unit tested, and so the store and the drag
 * handle agree on one definition of "how big is allowed".
 */
export interface SizeBounds {
  min: number;
  max: number;
}

/** Room list. `default` matches the original fixed `w-72`. */
export const SIDEBAR_WIDTH = { min: 208, max: 480, default: 288 } as const;

/**
 * Message box. `default` is the ceiling the textarea grows to on its own; a
 * user-chosen height replaces it until they reset the handle.
 */
export const COMPOSER_HEIGHT = { min: 44, max: 400, default: 200 } as const;

/**
 * The contextual bar. `default` matches the original fixed `w-80`, and the
 * ceiling is higher than the room list's because the panels that live here —
 * search results, a file list, a thread — are content rather than navigation.
 */
export const CONTEXTUAL_BAR_WIDTH = { min: 280, max: 640, default: 320 } as const;

/** The strip of connected servers, when there is more than one to show. */
export const SERVER_RAIL_WIDTH = 56;

/**
 * What the room list shrinks to once it collapses — the strip holding the mark
 * and the shortcuts, one tap from bringing the list back.
 *
 * Shared rather than private to the sidebar because the contextual bar has to
 * know it: floating, the panel reaches back across this strip so the only thing
 * left beside it is the server rail.
 */
export const SIDEBAR_RAIL_WIDTH = 64;

/**
 * The room header's fixed furniture, in pixels: the header's own padding (32),
 * the room icon and the gap after it (48), and the toolbox — six 36px targets
 * plus the "More" trigger, with 4px between them (276).
 *
 * None of it gives. The room's name is the only elastic part of that row, so
 * this is the width at which the name is squeezed out of the header entirely,
 * which is what a broken header actually looks like.
 */
const ROOM_HEADER_FURNITURE = 32 + 48 + 276;

/**
 * Never let the room list squeeze the conversation below this.
 *
 * The header is the first thing to break, and it breaks well before the
 * timeline does — hence sizing this from the header rather than from the
 * messages: its furniture, plus enough left over for the room's name to be a
 * name rather than an ellipsis.
 */
const MIN_CONVERSATION_WIDTH = ROOM_HEADER_FURNITURE + 124;

/**
 * The width the panes actually have to share. The server rail is spent before
 * any of them get a say, and leaving it out of the arithmetic is how the room
 * list ends up sized against 56px it was never going to get.
 */
export const layoutWidth = (viewportWidth: number, serverRailWidth: number): number =>
  Math.max(0, viewportWidth - serverRailWidth);

/**
 * Below this the room list and a working conversation cannot share the width:
 * the narrowest allowed list plus the narrowest usable conversation already come
 * to more than there is. Rather than hand the user two cramped panes and a
 * header with no room name in it, the list collapses to its rail and reopens
 * over the conversation on demand.
 */
export const MOBILE_BREAKPOINT = SIDEBAR_WIDTH.min + MIN_CONVERSATION_WIDTH;

/** Takes the width from `layoutWidth`, not the raw viewport. */
export const isMobileViewport = (availableWidth: number): boolean => availableWidth < MOBILE_BREAKPOINT;

/**
 * How the room list responds to the viewport crossing the breakpoint.
 *
 * Only the crossing moves it, never the width on its own: a user who reopens
 * the list on a phone keeps it open through every later resize event, and the
 * on-screen keyboard opening — which fires `resize` — does not shut it.
 *
 * `autoCollapsed` is what makes the move reversible. A list closed by the
 * viewport reopens when the room comes back; one the user closed themselves
 * stays closed, because that was a decision rather than a constraint.
 */
export const sidebarForViewport = (
  state: { sidebarOpen: boolean; sidebarAutoCollapsed: boolean; viewportIsMobile: boolean },
  viewportIsMobile: boolean,
): { sidebarOpen: boolean; sidebarAutoCollapsed: boolean; viewportIsMobile: boolean } | null => {
  if (viewportIsMobile === state.viewportIsMobile) return null;

  if (viewportIsMobile) {
    return { viewportIsMobile, sidebarOpen: false, sidebarAutoCollapsed: state.sidebarOpen };
  }

  return {
    viewportIsMobile,
    sidebarOpen: state.sidebarAutoCollapsed || state.sidebarOpen,
    sidebarAutoCollapsed: false,
  };
};

/** Nor the message box swallow the timeline it belongs to. */
const MAX_COMPOSER_VIEWPORT_SHARE = 0.5;

export const clampSize = (value: number, bounds: SizeBounds): number =>
  Math.min(Math.max(Math.round(value), bounds.min), Math.max(bounds.min, bounds.max));

/**
 * The bounds are viewport-dependent: a width that is comfortable on a desktop
 * leaves nothing for the messages in a narrow window. `min` always wins, so a
 * very small viewport yields a usable — if scrolled — layout rather than a
 * zero-width pane.
 *
 * `availableWidth` comes from `layoutWidth`: the room list competes with the
 * conversation for what the server rail has left, not for the whole window.
 */
export const sidebarBounds = (availableWidth: number): SizeBounds => ({
  min: SIDEBAR_WIDTH.min,
  max: Math.max(SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, availableWidth - MIN_CONVERSATION_WIDTH)),
});

/**
 * The room list and the contextual bar sit on opposite sides of the same
 * conversation, so the bar's ceiling has to account for the list already having
 * taken its share — sizing them independently lets the two of them squeeze the
 * messages to nothing between them.
 */
export const contextualBarBounds = (availableWidth: number, sidebarWidth: number): SizeBounds => ({
  min: CONTEXTUAL_BAR_WIDTH.min,
  max: Math.max(
    CONTEXTUAL_BAR_WIDTH.min,
    Math.min(CONTEXTUAL_BAR_WIDTH.max, availableWidth - sidebarWidth - MIN_CONVERSATION_WIDTH),
  ),
});

/**
 * Whether the contextual bar has to float over the conversation instead of
 * taking width from it.
 *
 * `min` always wins in `clampSize`, so on a narrow viewport the bar takes its
 * 280px regardless — and what is left of the conversation is a header the room's
 * own controls no longer fit in and a message box too narrow to type in.
 * Covering the room for as long as the panel is being read is the better of the
 * two, which is the trade the room list already makes at `MOBILE_BREAKPOINT`.
 *
 * Measured against the header's furniture rather than `MIN_CONVERSATION_WIDTH`,
 * so this holds out longer than that collapse does: a collapsed room list is
 * still a rail one tap from coming back, while a floating panel takes the
 * conversation off screen entirely. It is worth a cramped room name to avoid.
 *
 * The room list is part of the sum because the two sit on opposite sides of the
 * same conversation: a bar that fits beside an open list is a different question
 * from one that fits beside a collapsed one. Pass 0 for a collapsed list, as
 * `contextualBarBounds` is passed.
 */
export const contextualBarOverlays = (availableWidth: number, sidebarWidth: number): boolean =>
  availableWidth - sidebarWidth - CONTEXTUAL_BAR_WIDTH.min < ROOM_HEADER_FURNITURE;

export const composerBounds = (viewportHeight: number): SizeBounds => ({
  min: COMPOSER_HEIGHT.min,
  max: Math.max(
    COMPOSER_HEIGHT.min,
    Math.min(COMPOSER_HEIGHT.max, Math.round(viewportHeight * MAX_COMPOSER_VIEWPORT_SHARE)),
  ),
});

/**
 * Reads a persisted size. Anything unparseable — a hand-edited value, a leftover
 * from an older build — falls back to `null`, which callers read as "use the
 * default", rather than propagating `NaN` into a style attribute.
 */
export const parseStoredSize = (raw: string | null, bounds: SizeBounds): number | null => {
  if (raw === null) return null;

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? clampSize(parsed, bounds) : null;
};
