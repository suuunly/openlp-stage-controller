import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SLIDE_HEIGHT, SLIDE_WIDTH, type SlideItem } from '../lib/types';
import styles from './SlidePreview.module.css';

/**
 * A visual preview of a slide.
 *
 * FreeShow will not send a picture of a slide — `get_thumbnail` returns nothing
 * for a show, and there is no other bitmap route. RemoteShow doesn't get one
 * either; it draws slides from their own layout data, and so do we.
 *
 * Items are positioned in FreeShow's 1920x1080 canvas pixels, so the inner
 * canvas is laid out at exactly that size and scaled to fit. That keeps every
 * child in original units — no per-property scaling maths, and font sizes stay
 * proportional for free. A `transform` is used rather than container-query
 * units because iPadOS support for the latter is not worth betting a Sunday on.
 */
export function SlidePreview({
  items,
  className,
  label,
}: {
  items: SlideItem[];
  className?: string;
  /** Accessible description; the preview itself is decorative. */
  label?: string;
}): ReactNode {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / SLIDE_WIDTH);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={box}
      className={`${styles.frame} ${className ?? ''}`}
      role="img"
      aria-label={label ?? 'Slide preview'}
    >
      {/* Hidden until measured, so it never flashes at the wrong size. */}
      <div
        className={styles.canvas}
        style={{
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          transform: `scale(${scale})`,
          visibility: scale > 0 ? 'visible' : 'hidden',
        }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            className={styles.item}
            style={{
              left: item.left,
              top: item.top,
              width: item.width,
              height: item.height,
              background: item.background,
              borderRadius: item.radius,
              padding: item.padding,
              textAlign: item.align,
            }}
          >
            {item.lines.map((line, j) => (
              <p key={j} className={styles.line} style={{ textAlign: line.align }}>
                {line.runs.map((run, k) => (
                  <span
                    key={k}
                    style={{
                      fontSize: run.fontSize,
                      color: run.color,
                      fontWeight: run.bold ? 700 : undefined,
                      fontStyle: run.italic ? 'italic' : undefined,
                    }}
                  >
                    {run.value}
                  </span>
                ))}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
