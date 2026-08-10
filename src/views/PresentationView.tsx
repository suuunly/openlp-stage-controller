import { useCallback, useEffect, type ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { useTapGuard } from '../hooks/useTapGuard';
import { useSwipe } from '../hooks/useSwipe';
import { AppHeader } from '../components/AppHeader';
import { Icon } from '../components/Icon';
import styles from './PresentationView.module.css';

const NEXT_KEYS = ['ArrowRight', ' ', 'Enter', 'PageDown'];
const PREV_KEYS = ['ArrowLeft', 'PageUp'];

/**
 * Presentation view.
 *
 * Speaker notes come from `get_show`'s per-slide `notes` — they are not in the
 * published API, which is why TASK-07 recorded them as impossible. Thumbnails
 * remain unavailable, so the current slide is shown as text.
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  }, [next, prev]);

  const swipe = useSwipe(next, prev);

  const decks = serviceItems.filter((it) => it.kind === 'presentation');
  const liveId = liveItem?.id ?? null;
  const current = decks.find((d) => d.id === liveId) ?? null;
  const slideText = outputText.trim() || liveItem?.text.trim() || '';
  const counter =
    liveItem && liveItem.total > 0
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

      {decks.length > 1 && (
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
        ) : slideText ? (
          <p className={styles.slide} style={{ fontSize: 'var(--reading-size)' }}>
            {slideText}
          </p>
        ) : (
          <p className={styles.placeholder}>Nothing on the screens yet</p>
        )}
      </div>

      <p className={styles.notes}>
        {liveItem?.notes?.trim()
          ? liveItem.notes
          : 'No notes for this slide'}
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
