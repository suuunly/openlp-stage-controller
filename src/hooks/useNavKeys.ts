import { useEffect } from 'react';

/**
 * The slide-navigation key bindings from CLAUDE.md §7, in one place.
 *
 * These were copy-pasted into three views and had already drifted — the
 * Presentation view was missing `Backspace`, so a pedal mapped to it worked in
 * Songs and Bible and did nothing there. That reads as a broken pedal
 * mid-service, not a missing array entry.
 */
export const NEXT_KEYS = ['ArrowRight', ' ', 'Enter', 'PageDown'];
export const PREV_KEYS = ['ArrowLeft', 'Backspace', 'PageUp'];

/** Keys a browser turns into a `click` on a focused button. */
const ACTIVATION_KEYS = ['Enter', ' '];

function closestMatch(target: EventTarget | null, selector: string): boolean {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(target.closest(selector));
}

/** Somewhere the user is typing — no navigation key should be stolen. */
function isTextEntry(target: EventTarget | null): boolean {
  return closestMatch(target, 'input, textarea, select, [contenteditable]');
}

/**
 * A focused control that Enter/Space would activate.
 *
 * Browsers synthesise a `click` from those keys, so a global listener treating
 * them as "next" fires twice: the control's own action *and* a slide advance.
 * Focusing a song card and pressing Enter used to send
 * `SHOW → index_select_slide {index: 0} → next_slide`, putting the song live on
 * slide 2 in front of the congregation.
 *
 * Only those two keys are withheld. Arrows and PageUp/PageDown don't activate a
 * button, so a foot pedal keeps working no matter what happens to have focus —
 * which is the whole point of the HID-first rule (CLAUDE.md §7).
 */
function isActivatable(target: EventTarget | null): boolean {
  return closestMatch(target, 'button, [role="button"], a[href], summary');
}

/**
 * Bind next/prev to the keyboard and any HID device pretending to be one.
 *
 * `enabled` disarms the pedal along with the on-screen buttons. Disabling the
 * buttons alone is not enough: the listener is on `window`, so a foot pedal
 * would keep advancing whatever is live.
 */
export function useNavKeys(next: () => void, prev: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTextEntry(e.target)) return;
      if (ACTIVATION_KEYS.includes(e.key) && isActivatable(e.target)) return;
      if (NEXT_KEYS.includes(e.key)) {
        e.preventDefault();
        next();
      } else if (PREV_KEYS.includes(e.key)) {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, enabled]);
}
