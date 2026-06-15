import { useCallback, useRef, type TouchEvent } from 'react';

interface SwipeHandlers {
  onTouchStart: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
}

/** Horizontal swipe → onLeft (swipe left = next) / onRight (swipe right = prev). */
export function useSwipe(
  onLeft: () => void,
  onRight: () => void,
  threshold = 50,
): SwipeHandlers {
  const startX = useRef(0);
  const onTouchStart = useCallback((e: TouchEvent) => {
    startX.current = e.changedTouches[0].clientX;
  }, []);
  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current;
      if (dx < -threshold) onLeft();
      else if (dx > threshold) onRight();
    },
    [onLeft, onRight, threshold],
  );
  return { onTouchStart, onTouchEnd };
}
