import { useCallback, type ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { useTapGuard } from '../hooks/useTapGuard';
import { useSwipe } from '../hooks/useSwipe';
import { useNavKeys } from '../hooks/useNavKeys';
import { AppHeader } from '../components/AppHeader';
import { SlidePreview } from '../components/SlidePreview';
import { Icon } from '../components/Icon';
import styles from './PresentationView.module.css';

/**
 * Presentation view.
 *
 * Speaker notes come from `get_show`'s per-slide `notes` — they are not in the
 * published API, which is why TASK-07 recorded them as impossible.
 *
 * The slide itself is *drawn*, not fetched: FreeShow has no slide bitmap, so
 * `SlidePreview` renders it from its own layout data. Text remains the fallback
 * when a slide carries no usable geometry.
 */
export function PresentationView(): ReactNode {
  const {
    serviceItems,
    liveItem,
    outputText,
    activeProject,
    activateItem,
    goNext,
    goPrev,
  } = useApp();

  const guard = useTapGuard();
  const next = useCallback(() => guard('next', goNext), [guard, goNext]);
  const prev = useCallback(() => guard('prev', goPrev), [guard, goPrev]);

  useNavKeys(next, prev);

  const swipe = useSwipe(next, prev);

  // A project can list the same show twice; duplicate React keys and duplicate
  // chips both follow from taking the list at face value.
  const decks = serviceItems.filter(
    (it, i, all) => it.kind === 'presentation' && all.findIndex((o) => o.id === it.id) === i,
  );
  const liveId = liveItem?.id ?? null;
  const current = decks.find((d) => d.id === liveId) ?? null;

  /**
   * Only mirror the output when what's live is actually one of these decks.
   * Otherwise a song or a bible verse renders here as though it were the
   * current presentation — which on stage is worse than showing nothing.
   */
  const live = current !== null;
  const slideText = live ? outputText.trim() || liveItem?.text.trim() || '' : '';
  const counter =
    live && liveItem && liveItem.total > 0
      ? `${liveItem.slide + 1} / ${liveItem.total}`
      : null;

  return (
    <section className={styles.view}>
      <AppHeader
        icon="slideshow"
        title={current?.title ?? 'Presentation'}
        subtitle={activeProject?.name ?? 'Slides on the big screens'}
        right={
          counter ? <span className={styles.counter}>{counter}</span> : undefined
        }
      />

      {decks.length > 0 && (
        <div className={styles.picker} role="group" aria-label="Choose a presentation">
          {decks.map((deck) => (
            <button
              key={deck.id}
              type="button"
              className={`${styles.chip} ${deck.id === liveId ? styles.chipOn : ''}`}
              onClick={() => activateItem(deck.id)}
            >
              {deck.title}
            </button>
          ))}
        </div>
      )}

      <div className={styles.stage} {...swipe}>
        {decks.length === 0 ? (
          <div className={styles.empty}>
            <Icon name="slideshow" size={40} />
            <p className={styles.emptyTitle}>No presentations in this service</p>
            <p className={styles.emptyDesc}>
              Ask the tech team to add one to the FreeShow project.
            </p>
          </div>
        ) : live && liveItem && liveItem.items.length > 0 ? (
          <div className={styles.preview}>
            <SlidePreview items={liveItem.items} label={`Slide ${liveItem.slide + 1}`} />
            {liveItem.nextItems.length > 0 && (
              <div className={styles.nextWrap}>
                <span className={styles.nextLabel}>Next</span>
                <SlidePreview
                  items={liveItem.nextItems}
                  className={styles.nextPreview}
                  label="Next slide"
                />
              </div>
            )}
          </div>
        ) : slideText ? (
          <p className={styles.slide} style={{ fontSize: 'var(--reading-size)' }}>
            {slideText}
          </p>
        ) : (
          <p className={styles.placeholder}>
            {liveItem
              ? 'Something else is on the screens — tap a presentation to take over'
              : 'Nothing on the screens yet'}
          </p>
        )}
      </div>

      <p className={styles.notes}>
        {live && liveItem?.notes?.trim() ? liveItem.notes : 'No notes for this slide'}
      </p>

      <footer className={styles.nav}>
        <button type="button" className={styles.navPrev} onClick={prev}>
          <Icon name="chevron_left" size={28} />
          <span>PREV</span>
        </button>
        <button type="button" className={styles.navNext} onClick={next}>
          <span>NEXT</span>
          <Icon name="chevron_right" size={30} />
        </button>
      </footer>

      <div className={styles.hint}>
        <Icon name="keyboard" size={16} />
        <span>Arrow keys, space or a clicker also advance slides</span>
      </div>
    </section>
  );
}
