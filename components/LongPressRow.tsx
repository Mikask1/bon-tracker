'use client';

import { useRef } from 'react';

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10; // real scroll/drag cancels the long-press

// A row that opens a quick-actions menu on long-press, and navigates on a
// plain tap. No swipe/drag — just distinguishes "held still" from "tap" or
// "started scrolling", the last of which cancels the press entirely so a
// long-press never fires mid-scroll.
export function LongPressRow({
  onTap,
  onLongPress,
  children,
  className,
}: {
  onTap: () => void;
  onLongPress: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const stateRef = useRef<{
    startX: number;
    startY: number;
    timer: ReturnType<typeof setTimeout>;
    fired: boolean;
  } | null>(null);

  function clear() {
    if (stateRef.current) clearTimeout(stateRef.current.timer);
    stateRef.current = null;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const timer = setTimeout(() => {
      if (!stateRef.current) return;
      stateRef.current.fired = true;
      onLongPress();
    }, LONG_PRESS_MS);
    stateRef.current = { startX, startY, timer, fired: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = stateRef.current;
    if (!s || s.fired) return;
    if (
      Math.abs(e.clientX - s.startX) > MOVE_CANCEL_PX ||
      Math.abs(e.clientY - s.startY) > MOVE_CANCEL_PX
    ) {
      clear();
    }
  }

  function onPointerUp() {
    const s = stateRef.current;
    clear();
    if (s && !s.fired) onTap();
  }

  function onPointerCancel() {
    clear();
  }

  return (
    <div
      className={className}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
