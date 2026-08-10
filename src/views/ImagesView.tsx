import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { fetchThumbnail } from '../lib/api';
import { downscaleDataUrl } from '../lib/downscale';
import { AppHeader } from '../components/AppHeader';
import { Icon } from '../components/Icon';
import styles from './ImagesView.module.css';

/**
 * Images view.
 *
 * `API:get_thumbnail` is undocumented and misnamed: it returns the
 * **full-resolution** image as base64 and honours no size hint — measured at 4,
 * 4, 45, 33 and 10 MB for five images. So each one is fetched once, shrunk
 * immediately, and the big string dropped; only a ~400px preview is kept.
 *
 * The transfer cost is real and unavoidable, which is why previews are a
 * setting. Default on, because a grid of identical icons is close to useless
 * for choosing an image — but switchable when the network is poor.
 */
export function ImagesView(): ReactNode {
  const { serviceItems, activeProject, connection, settings, showMedia } = useApp();

  // Memoised by id: `serviceItems.filter(...)` is a fresh array every render,
  // and an unstable dependency restarted the thumbnail loop on each arrival —
  // which is why only every other image ended up with a picture.
  const images = useMemo(
    () => serviceItems.filter((it) => it.kind === 'image'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serviceItems.map((it) => `${it.kind}:${it.id}`).join('|')],
  );
  const thumbs = useThumbnails(images, connection, settings.imagePreviews);

  // Images aren't shows, so FreeShow's output never points back at one. The
  // badge tracks what this device last sent, and says so.
  const [lastSent, setLastSent] = useState<string | null>(null);
  const showing = images.find((it) => it.id === lastSent) ?? null;

  return (
    <section className={styles.view}>
      <AppHeader
        icon="image"
        title="Images"
        subtitle={activeProject?.name ?? 'Tap an image to put it on the screens'}
      />

      <div className={styles.grid}>
        {images.length === 0 && (
          <div className={styles.empty}>
            <Icon name="image" size={40} />
            <p className={styles.emptyTitle}>No images in this service</p>
            <p className={styles.emptyDesc}>
              Ask the tech team to add some to the FreeShow project.
            </p>
          </div>
        )}

        {images.map((item) => {
          const live = item.id === lastSent;
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.card} ${live ? styles.cardLive : ''}`}
              onClick={() => {
                showMedia(item.path ?? item.id);
                setLastSent(item.id);
              }}
              aria-current={live}
            >
              <span className={styles.thumb}>
                {thumbs[item.id] ? (
                  <img className={styles.thumbImg} src={thumbs[item.id]} alt="" />
                ) : (
                  <Icon name="image" size={34} />
                )}
              </span>
              <span className={styles.label}>{item.title}</span>
              {live && <span className={styles.badge}>✓ SENT</span>}
            </button>
          );
        })}
      </div>

      <footer className={styles.status}>
        <span className={styles.statusText}>
          {showing ? `Last sent: ${showing.title}` : 'Tap an image to put it on the screens'}
        </span>
        <span className={styles.note}>
          {settings.imagePreviews
            ? 'Previews are downscaled on this device'
            : 'Previews off — switch on in Settings'}
        </span>
      </footer>
    </section>
  );
}


/**
 * Lazily pull each image's thumbnail, **one at a time**.
 *
 * Replies are correlated by channel name, and every thumbnail comes back on the
 * same `API:get_thumbnail` channel — so firing them in parallel makes the
 * replies race, and only the first image gets a picture. One in flight at a
 * time is both correct and fast enough for a service's worth of images.
 *
 * Each image is asked for once; an empty reply is remembered too, so a missing
 * thumbnail doesn't retry forever.
 */
function useThumbnails(
  images: { id: string; path?: string }[],
  connection: string,
  enabled: boolean,
): Record<string, string> {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  /**
   * A token, not a boolean: cleanup used to clear a flag it might not own,
   * while the loop was still parked on an `await`. A dependency change then
   * started a second loop, and two in-flight `get_thumbnail` requests race —
   * replies correlate FIFO per channel with no request id, so one image's
   * base64 lands on another's waiter.
   */
  const running = useRef<object | null>(null);

  useEffect(() => {
    if (!enabled || connection !== 'connected' || running.current) return;
    const queue = images.filter((i) => !asked.current.has(i.id));
    if (queue.length === 0) return;

    let alive = true;
    const token = {};
    running.current = token;
    void (async () => {
      try {
        for (const image of queue) {
          if (!alive) break;
          asked.current.add(image.id);
          const path = image.path ?? image.id;
          if (!path) continue;
          const full = await fetchThumbnail(path);
          if (!alive) break;
          // Shrink before storing; the full-size string is not kept.
          const small = await downscaleDataUrl(full);
          if (!alive) break;
          if (small) setThumbs((prev) => ({ ...prev, [image.id]: small }));
        }
      } finally {
        if (running.current === token) running.current = null;
      }
    })();

    // Don't release a slot this effect may no longer own.
    return () => {
      alive = false;
    };
  }, [images, connection, enabled]);

  return thumbs;
}
