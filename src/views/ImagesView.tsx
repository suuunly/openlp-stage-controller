import type { ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { AppHeader } from '../components/AppHeader';
import { Icon } from '../components/Icon';
import styles from './ImagesView.module.css';

/**
 * Images view.
 *
 * The design called for a thumbnail grid, but FreeShow's API exposes no
 * thumbnail action (TASK-06). Rather than a grid of identical placeholder
 * icons, this degrades to large titled cards — same tap target, same active
 * badge, no pretence of a preview that isn't there.
 */
export function ImagesView(): ReactNode {
  const { serviceItems, liveItem, activateItem, activeProject } = useApp();

  const images = serviceItems.filter((it) => it.kind === 'image');
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
                <Icon name="image" size={34} />
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
        <span className={styles.note}>FreeShow’s API provides no thumbnails</span>
      </footer>
    </section>
  );
}
