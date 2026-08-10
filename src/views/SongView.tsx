import { useCallback, useEffect, type ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { useTapGuard } from '../hooks/useTapGuard';
import { useSwipe } from '../hooks/useSwipe';
import { Icon } from '../components/Icon';
import styles from './SongView.module.css';

const NEXT_KEYS = ['ArrowRight', ' ', 'Enter', 'PageDown'];
const PREV_KEYS = ['ArrowLeft', 'Backspace', 'PageUp'];

export function SongView(): ReactNode {
  const {
    navigate,
    serviceItems,
    shows,
    liveItem,
    outputText,
    settings,
    goNext,
    goPrev,
    activateItem,
    jumpToSlide,
  } = useApp();

  const guard = useTapGuard();
  const next = useCallback(() => guard('next', goNext), [guard, goNext]);
  const prev = useCallback(() => guard('prev', goPrev), [guard, goPrev]);

  // Keyboard / foot-pedal support (scoped: this view only mounts when active).
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

  const songs = serviceItems.filter((it) => it.kind === 'song');
  // A song tagged "Presentations" in FreeShow lands in the other view. Saying
  // so beats an empty screen that looks like a broken connection.
  const misfiled = serviceItems.filter((it) => it.kind === 'presentation').length;
  const liveId = liveItem?.id ?? null;
  const isLive = (id: string) => liveId !== null && id === liveId;

  // `get_output_slide_text` is purpose-built for the read-along; fall back to
  // the live slide's own text when the screens are blank or it's unreadable.
  const readAlong = outputText || liveItem?.text || '';
  const currentLine = readAlong.replace(/\s*\n+\s*/g, ' ').trim();

  return (
    <section className={styles.view}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate('home')}
          aria-label="Back to home"
        >
          <Icon name="arrow_back" size={26} />
        </button>
        <div className={styles.titleWrap}>
          <Icon name="queue_music" size={28} className={styles.titleIcon} />
          <div>
            <div className={styles.title}>Songs in this service</div>
            <div className={styles.subtitle}>Tap a song to make it live · tap a number to jump</div>
          </div>
        </div>
      </header>

      <div className={styles.list} {...swipe}>
        {songs.length === 0 && (
          <div className={styles.empty}>
            <Icon name="queue_music" size={40} />
            <p className={styles.emptyTitle}>No songs in this service</p>
            <p className={styles.emptyDesc}>
              {misfiled > 0
                ? `${misfiled} item${misfiled === 1 ? ' is' : 's are'} tagged “Presentations” in FreeShow — set their category to Songs to see them here.`
                : 'Ask the tech team to add songs to the service.'}
            </p>
          </div>
        )}

        {songs.map((song, i) => {
          const live = isLive(song.id);
          // Slide counts come from the show definition, so they are known for
          // songs that aren't live yet — the pills work before you tap.
          const total = shows.get(song.id)?.slides.length ?? (live ? liveItem?.total ?? 0 : 0);
          const slide = live && liveItem ? liveItem.slide : 0;
          return (
            <div
              key={song.id}
              className={`${styles.card} ${live ? styles.cardLive : ''}`}
              onClick={live ? undefined : () => activateItem(song.id)}
              role={live ? undefined : 'button'}
              tabIndex={live ? undefined : 0}
              onKeyDown={
                live
                  ? undefined
                  : (e) => {
                      if (e.key === 'Enter') activateItem(song.id);
                    }
              }
            >
              <div className={styles.cardTop}>
                <div className={`${styles.num} ${live ? styles.numLive : ''}`}>{i + 1}</div>
                <div className={styles.cardMeta}>
                  <div className={styles.songTitle}>{song.title}</div>
                  {song.notes && <div className={styles.songAuthor}>{song.notes}</div>}
                </div>
                {total > 0 && (
                  <div className={`${styles.count} ${live ? styles.countLive : ''}`}>
                    {live ? `Slide ${slide + 1} / ${total}` : `${total} slides`}
                  </div>
                )}
              </div>

              {live && total > 0 && (
                <div className={styles.liveBody}>
                  <div className={styles.pills}>
                    {Array.from({ length: total }, (_, n) => (
                      <button
                        key={n}
                        type="button"
                        className={`${styles.pill} ${n === slide ? styles.pillOn : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          jumpToSlide(liveId ?? song.id, n);
                        }}
                        aria-label={`Slide ${n + 1}`}
                        aria-current={n === slide}
                      >
                        {n + 1}
                      </button>
                    ))}
                  </div>
                  {settings.nextPreview && currentLine && (
                    <div className={styles.currentLine}>{currentLine}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
        <span>Arrow keys, space or foot pedal also advance slides</span>
      </div>
    </section>
  );
}
