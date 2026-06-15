import { useCallback, useRef } from 'react';

/**
 * Direction-keyed debounce guard (from the design spec's iPad touch fix).
 * iOS Safari can fire a tap handler twice (touch + synthesized click), making
 * NEXT jump +2. This collapses two fires of the *same* action within
 * `windowMs`, while never blocking a direction change (NEXT→PREV) or a
 * deliberate, spaced repeat.
 */
export function useTapGuard(windowMs = 300): (key: string, fn: () => void) => void {
  const last = useRef<{ key: string; t: number }>({ key: '', t: 0 });
  return useCallback(
    (key: string, fn: () => void) => {
      const now = Date.now();
      if (last.current.key === key && now - last.current.t < windowMs) return;
      last.current = { key, t: now };
      fn();
    },
    [windowMs],
  );
}
