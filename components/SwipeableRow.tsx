'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface SwipeAction {
  label: string;
  className: string; // background + text color classes for the reveal panel
}

const THRESHOLD = 64; // px of drag before letting go triggers the action
const MAX_DRAG = 96; // px of translation at full resistance
const LOCK_SLOP = 8; // px of movement before committing to horizontal vs vertical

// A row that can be swiped left/right to trigger a quick action, and tapped to
// navigate — without a gesture library. Vertical drags are left alone (the
// list keeps scrolling); only once a drag commits horizontal do we take over
// and suppress the tap.
export function SwipeableRow({
  onTap,
  onSwipeLeft,
  onSwipeRight,
  leftAction,
  rightAction,
  children,
  className,
}: {
  onTap: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftAction?: SwipeAction; // revealed while dragging right
  rightAction?: SwipeAction; // revealed while dragging left
  children: React.ReactNode;
  className?: string;
}) {
  const [dx, setDx] = useState(0);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    locked: 'x' | 'y' | null;
  } | null>(null);

  function resistance(raw: number) {
    if (raw > 0 && !onSwipeRight) return 0;
    if (raw < 0 && !onSwipeLeft) return 0;
    const abs = Math.abs(raw);
    const clamped = abs <= MAX_DRAG ? abs : MAX_DRAG + (abs - MAX_DRAG) * 0.2;
    return Math.sign(raw) * clamped;
  }

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, locked: null };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const rawX = e.clientX - d.startX;
    const rawY = e.clientY - d.startY;
    if (d.locked === null) {
      if (Math.abs(rawX) < LOCK_SLOP && Math.abs(rawY) < LOCK_SLOP) return;
      d.locked = Math.abs(rawX) > Math.abs(rawY) ? 'x' : 'y';
    }
    if (d.locked === 'y') return;
    e.preventDefault();
    setDx(resistance(rawX));
  }

  function endDrag() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.locked === 'y') return; // was a scroll, not a tap
    if (d.locked === null) {
      onTap();
      return;
    }
    if (dx <= -THRESHOLD) onSwipeLeft?.();
    else if (dx >= THRESHOLD) onSwipeRight?.();
    setDx(0);
  }

  function onPointerUp() {
    endDrag();
  }

  function onPointerCancel() {
    dragRef.current = null;
    setDx(0);
  }

  return (
    <div className="relative overflow-hidden">
      {(leftAction || rightAction) && (
        <div aria-hidden className="absolute inset-0 flex">
          {leftAction && (
            <div
              className={cn(
                'flex h-full items-center pl-4 text-sm font-semibold text-white',
                leftAction.className
              )}
              style={{ width: Math.max(dx, 0) }}
            >
              <span className="whitespace-nowrap">{leftAction.label}</span>
            </div>
          )}
          <div className="flex-1" />
          {rightAction && (
            <div
              className={cn(
                'flex h-full items-center justify-end pr-4 text-sm font-semibold text-white',
                rightAction.className
              )}
              style={{ width: Math.max(-dx, 0) }}
            >
              <span className="whitespace-nowrap">{rightAction.label}</span>
            </div>
          )}
        </div>
      )}
      <div
        className={cn('relative bg-background transition-transform', className)}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dx === 0 ? 'transform 150ms ease-out' : 'none',
          touchAction: 'pan-y',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {children}
      </div>
    </div>
  );
}
