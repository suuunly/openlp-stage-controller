import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { useTapGuard } from '../hooks/useTapGuard';
import { useSwipe } from '../hooks/useSwipe';
import { useNavKeys } from '../hooks/useNavKeys';
import { AppHeader } from '../components/AppHeader';
import { SlidePreview } from '../components/SlidePreview';
import { Icon } from '../components/Icon';
import styles from './PresentationView.module.css';

/**
 * Presentation view — a presenter console.
 *
 * Two states: a grid to choose a deck, then PowerPoint's presenter layout —
 * the live slide large on the left, the next one and the speaker's notes down
 * the right.
 *
 * Notes come from `get_show`'s per-slide `notes`, which the published API
 * doesn't mention, and the slides are *drawn* by `SlidePreview` because
 * FreeShow has no slide bitmap to send. Text remains the fallback when a slide
 * carries no usable geometry.
 */
export function PresentationView(): ReactNode {
  const { serviceItems, liveItem, activeProject, activateItem, goNext, goPrev } = useApp();

  const guard = useTapGuard();
  const next = useCallback(() => guard('next', goNext), [guard, goNext]);
  const prev = useCallback(() => guard('prev', goPrev), [guard, goPrev]);
  const swipe = useSwipe(next, prev);

  // A project can list the same show twice; duplicate cards and duplicate React
  // keys both follow from taking the list at face value.
  const decks = serviceItems.filter(
    (it, i, all) => it.kind === 'presentation' && all.findIndex((o) => o.id === it.id) === i,
  );
  const liveId = liveItem?.id ?? null;
  const current = decks.find((d) => d.id === liveId) ?? null;

  /**
   * Only mirror the output when what's live is one of these decks — otherwise a
   * song or bible verse renders here as though it were the current
   * presentation, which on stage is worse than showing nothing.
   */
  const live = current !== null;

  // The grid shows until a deck is live, and whenever the user asks for it back.
  const [browsing, setBrowsing] = useState(false);
  useEffect(() => {
    if (live) setBrowsing(false);
  }, [live]);
  const showGrid = browsing || !live;

  /**
   * Navigation is disarmed unless one of these decks is live.
   *
   * `next_slide` advances whatever the operator has live, not just this view's
   * content. A speaker opening this before their slot sees a picker; tapping
   * NEXT there would jump the congregation's song a verse. The pedal is
   * disarmed with the buttons — the key listener is on `window`.
   */
  useNavKeys(next, prev, live);

  const counter =
    live && liveItem && liveItem.total > 0
      ? `${liveItem.slide + 1} / ${liveItem.total}`
      : null;
  const slideText = live ? (liveItem?.text.trim() ?? '') : '';

  return (
    <section className={styles.view}>
      <AppHeader
        icon="slideshow"
        title={current && !showGrid ? current.title : 'Presentation'}
        subtitle={activeProject?.name ?? 'Slides on the big screens'}
        right={
          <div className={styles.headerRight}>
            {counter && !showGrid && <span className={styles.counter}>{counter}</span>}
            {decks.length > 1 && !showGrid && (
              <button
                type="button"
                className={styles.change}
                onClick={() => setBrowsing(true)}
              >
                <Icon name="unfold_more" size={18} />
                <span>Change</span>
              </button>
            )}
          </div>
        }
      />

      {showGrid ? (
        <div className={styles.grid}>
          {decks.length === 0 ? (
            <div className={styles.empty}>
              <Icon name="slideshow" size={40} />
              <p className={styles.emptyTitle}>No presentations in this service</p>
              <p className={styles.emptyDesc}>
                Ask the tech team to add one to the FreeShow project.
              </p>
            </div>
          ) : (
            decks.map((deck) => (
              <button
                key={deck.id}
                type="button"
                className={`${styles.card} ${deck.id === liveId ? styles.cardLive : ''}`}
                onClick={() => {
                  activateItem(deck.id);
                  setBrowsing(false);
                }}
              >
                <span className={styles.cardIcon}>
                  <Icon name="slideshow" size={30} />
                </span>
                <span className={styles.cardLabel}>{deck.title}</span>
                {deck.id === liveId && <span className={styles.badge}>✓ LIVE</span>}
              </button>
            ))
          )}
        </div>
      ) : (
        <div className={styles.console} {...swipe}>
          <div className={styles.main}>
            {liveItem && liveItem.items.length > 0 ? (
              <SlidePreview
                items={liveItem.items}
                label={`Slide ${liveItem.slide + 1}`}
                className={styles.fit}
              />
            ) : (
              <p className={styles.slide} style={{ fontSize: 'var(--reading-size)' }}>
                {slideText || 'Nothing on the screens yet'}
              </p>
            )}
          </div>

          <aside className={styles.side}>
            <div className={styles.nextBlock}>
              <span className={styles.sideLabel}>Next</span>
              {liveItem && liveItem.nextItems.length > 0 ? (
                <SlidePreview items={liveItem.nextItems} label="Next slide" />
              ) : (
                <p className={styles.sideEmpty}>
                  {liveItem?.nextText || 'End of the presentation'}
                </p>
              )}
            </div>

            <div className={styles.notesBlock}>
              <span className={styles.sideLabel}>Notes</span>
              <p className={styles.notes}>
                {liveItem?.notes?.trim() || 'No notes for this slide'}
              </p>
            </div>
          </aside>
        </div>
      )}

      <footer className={styles.nav}>
        <button
          type="button"
          className={styles.navPrev}
          onClick={prev}
          disabled={!live}
        >
          <Icon name="chevron_left" size={28} />
          <span>PREV</span>
        </button>
        <button
          type="button"
          className={styles.navNext}
          onClick={next}
          disabled={!live}
        >
          <span>NEXT</span>
          <Icon name="chevron_right" size={30} />
        </button>
      </footer>

      <div className={styles.hint}>
        <Icon name="keyboard" size={16} />
        <span>
          {live
            ? 'Arrow keys, space or a clicker also advance slides'
            : 'Pick a presentation first — nav stays off so it can’t move someone else’s song'}
        </span>
      </div>
    </section>
  );
}
