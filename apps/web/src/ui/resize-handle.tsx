import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';

import { cn } from '@/lib/cn';
import { Icons } from '@/ui/icon';

/** Arrow keys nudge; Shift moves in the strides a mouse drag makes easy. */
const STEP = 16;
const STEP_LARGE = 64;

/**
 * While a drag is in flight the cursor must not flicker back to a text caret as
 * the pointer crosses whatever lies underneath, and nothing must select.
 */
const setDragCursor = (cursor: 'col-resize' | 'row-resize' | null) => {
  document.body.style.cursor = cursor ?? '';
  document.body.style.userSelect = cursor ? 'none' : '';
};

interface ResizeHandleProps {
  /** `x` sits between columns and drags sideways; `y` sits between rows. */
  axis: 'x' | 'y';
  /**
   * Set when the pane grows as the pointer moves *against* the axis — true for
   * the message box, whose handle is on its top edge.
   */
  invert?: boolean;
  /** Current size, for assistive technology and as the drag origin. */
  value: number;
  min: number;
  max: number;
  label: string;
  onResize: (size: number) => void;
  /** Double-click and Enter restore the default; omit to disable both. */
  onReset?: () => void;
  /**
   * Raised on press and release. A pane that animates its size has to stop
   * doing so while it is being dragged, or it trails behind the pointer.
   */
  onDragChange?: (dragging: boolean) => void;
  className?: string;
}

/**
 * A draggable divider.
 *
 * Reported as a `separator` with a value, which is what screen readers announce
 * for a resizable split, and it is focusable so the size can be changed without
 * a pointer at all.
 */
export const ResizeHandle = ({
  axis,
  invert = false,
  value,
  min,
  max,
  label,
  onResize,
  onReset,
  onDragChange,
  className,
}: ResizeHandleProps) => {
  // The drag origin, captured on press. Deriving each move from it rather than
  // from the previous one keeps the pane pinned to the pointer even when a
  // clamp swallows part of the movement.
  const drag = useRef<{ origin: number; start: number } | null>(null);

  // Unmounting mid-drag — collapsing the sidebar with the keyboard, say — would
  // otherwise leave the whole page stuck with a resize cursor.
  useEffect(() => () => setDragCursor(null), []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { origin: axis === 'x' ? event.clientX : event.clientY, start: value };
    setDragCursor(axis === 'x' ? 'col-resize' : 'row-resize');
    onDragChange?.(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active) return;

    const delta = (axis === 'x' ? event.clientX : event.clientY) - active.origin;
    onResize(active.start + (invert ? -delta : delta));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;

    drag.current = null;
    setDragCursor(null);
    onDragChange?.(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const towardsEnd = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    const towardsStart = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const step = event.shiftKey ? STEP_LARGE : STEP;

    if (event.key === towardsEnd || event.key === towardsStart) {
      event.preventDefault();
      const delta = (event.key === towardsEnd ? step : -step) * (invert ? -1 : 1);
      onResize(value + delta);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      onResize(min);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      onResize(max);
      return;
    }

    if (onReset && event.key === 'Enter') {
      event.preventDefault();
      onReset();
    }
  };

  return (
    /*
     * The focusable-separator half of WAI-ARIA's window splitter pattern: a
     * separator that carries a value and takes focus. jsx-a11y only models the
     * decorative kind, and a button — its suggestion — would be announced as a
     * command with no size, so the two rules are turned off here rather than
     * the pattern being bent to suit them.
     */
    /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cn(
        'group/resize absolute z-10 touch-none',
        // The grab area is deliberately wider than the line it draws: a 1px
        // target is a well-known source of missed drags.
        axis === 'x' ? 'top-0 h-full w-2 cursor-col-resize' : 'left-0 h-2 w-full cursor-row-resize',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'bg-accent absolute rounded-full opacity-0 transition-opacity',
          'group-hover/resize:opacity-60 group-focus-visible/resize:opacity-100',
          axis === 'x'
            ? 'top-0 left-1/2 h-full w-0.5 -translate-x-1/2'
            : 'top-1/2 left-0 h-0.5 w-full -translate-y-1/2',
        )}
      />

      {/*
       * The grip. Hidden at rest so the divider stays out of the way, and
       * revealed the moment the pointer is near enough to use it — or when the
       * separator takes focus, so keyboard users see the same mark. It
       * overflows the hit area on purpose: the pointer events it receives
       * bubble up to the separator, so the visible mark is grabbable too.
       */}
      <span
        aria-hidden
        className={cn(
          'border-line bg-raised text-accent absolute flex items-center justify-center',
          'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          'rounded-full border opacity-0 shadow-sm transition-opacity',
          'group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100',
          axis === 'x' ? 'h-9 w-3.5' : 'h-3.5 w-9',
        )}
      >
        {axis === 'x' ? <Icons.gripVertical size={12} /> : <Icons.gripHorizontal size={12} />}
      </span>
    </div>
    /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  );
};
