import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  const { serviceItems, liveItem, activateItem, activeProject, connection, settings } =
    useApp();

  const images = serviceItems.filter((it) => it.kind === 'image');
  const thumbs = useThumbnails(images, connection, settings.imagePreviews);
  const liveId = liveItem?.id ?? null;
  const showing = images.find((it) => it.id === liveId) ?? null;

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
          const live = item.id === liveId;
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.card} ${live ? styles.cardLive : ''}`}
              onClick={() => activateItem(item.id)}
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
              {live && <span className={styles.badge}>✓ NOW SHOWING</span>}
            </button>
          );
        })}
      </div>

      <footer className={styles.status}>
        <span className={styles.statusText}>
          {showing ? `Now showing: ${showing.title}` : 'Nothing from this list is on screen'}
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
  const running = useRef(false);

  useEffect(() => {
    if (!enabled || connection !== 'connected' || running.current) return;
    const queue = images.filter((i) => !asked.current.has(i.id));
    if (queue.length === 0) return;

    let alive = true;
    running.current = true;
    void (async () => {
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
      running.current = false;
    })();

    return () => {
      alive = false;
      running.current = false;
    };
  }, [images, connection, enabled]);

  return thumbs;
}
