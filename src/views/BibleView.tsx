import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { useTapGuard } from '../hooks/useTapGuard';
import { AppHeader } from '../components/AppHeader';
import { Icon } from '../components/Icon';
import styles from './BibleView.module.css';

const HISTORY_KEY = 'verse_history';
const HISTORY_MAX = 5;
/** How long to wait for the screens to change before calling a reference bad. */
const RESOLVE_TIMEOUT = 3000;

const NEXT_KEYS = ['ArrowRight', ' ', 'Enter', 'PageDown'];
const PREV_KEYS = ['ArrowLeft', 'Backspace', 'PageUp'];

export function loadHistory(): string[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Most recent first, de-duplicated, capped. */
export function pushHistory(history: string[], reference: string): string[] {
  return [reference, ...history.filter((h) => h !== reference)].slice(0, HISTORY_MAX);
}

/**
 * Bible Verse view.
 *
 * FreeShow exposes no action for *browsing* bibles/books/chapters, so the
 * cascading pickers in the original design have nothing to populate from
 * (TASK-05, picker strategy A). What it does expose is `start_scripture` with a
 * plain reference string, and `scripture_next`/`scripture_previous` — which
 * also means chapter-boundary wrapping is FreeShow's problem, not ours.
 *
 * The reading pane therefore shows what is **on the screens now**, read back
 * via `get_output_slide_text`, rather than a preview of what a reference would
 * resolve to. Previewing before showing needs the verse text client-side, i.e.
 * a bundled `.fsb` — see TASK-05 option B.
 */
export function BibleView(): ReactNode {
  const { outputText, connection, showScripture, verseNext, versePrev } = useApp();

  const [reference, setReference] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [notFound, setNotFound] = useState(false);

  const outputRef = useRef(outputText);
  useEffect(() => {
    outputRef.current = outputText;
  }, [outputText]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const canReadBack = connection === 'connected';

  const show = useCallback(
    (raw: string) => {
      const clean = raw.trim();
      if (!clean) return;

      const before = outputRef.current.trim();
      setShown(clean);
      setNotFound(false);
      setHistory((prev) => {
        const next = pushHistory(prev, clean);
        sessionStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        return next;
      });
      showScripture(clean);

      if (timerRef.current) clearTimeout(timerRef.current);
      // Without a read-back channel we cannot tell a bad reference from a
      // blocked response, so don't claim the reference was wrong.
      if (!canReadBack) return;
      timerRef.current = setTimeout(() => {
        if (outputRef.current.trim() === before) setNotFound(true);
      }, RESOLVE_TIMEOUT);
    },
    [canReadBack, showScripture],
  );

  const guard = useTapGuard();
  const next = useCallback(() => guard('next', verseNext), [guard, verseNext]);
  const prev = useCallback(() => guard('prev', versePrev), [guard, versePrev]);

  // Keyboard / foot-pedal — ignored while the reference field has focus so
  // typing "Jóh 3:16" doesn't advance the verse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT') return;
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

  // Only mirror the screens once a verse has been shown from here. The pane
  // reads back whatever is on the output, which before that is the song the
  // band is on — under a "Bible Verses" heading that is just confusing.
  const verse = shown ? outputText.trim() : '';

  return (
    <section className={styles.view}>
      <AppHeader
        icon="menu_book"
        title="Bible Verses"
        subtitle="Type a reference, then put it on the screens"
      />

      <div className={styles.split}>
        <div className={styles.pane}>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              show(reference);
            }}
          >
            <label className={styles.fieldLabel} htmlFor="verse-ref">
              Reference
            </label>
            <input
              id="verse-ref"
              className={styles.input}
              type="text"
              placeholder="Jóh 3:16"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <button type="submit" className={styles.showBtn} disabled={!reference.trim()}>
              SHOW ON SCREEN
            </button>
          </form>

          {history.length > 0 && (
            <div className={styles.historyWrap}>
              <div className={styles.historyLabel}>
                <Icon name="history" size={16} />
                <span>Recently shown</span>
              </div>
              <div className={styles.chips}>
                {history.map((ref) => (
                  <button
                    key={ref}
                    type="button"
                    className={`${styles.chip} ${ref === shown ? styles.chipOn : ''}`}
                    onClick={() => {
                      setReference(ref);
                      show(ref);
                    }}
                  >
                    {ref}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.reading}>
          <div className={styles.readingHead}>
            <span className={styles.refLabel}>{shown ?? 'Nothing shown yet'}</span>
            {shown && <span className={styles.onScreen}>ON SCREEN</span>}
          </div>

          <div className={styles.verseWrap}>
            {notFound ? (
              <p className={styles.error}>
                Couldn’t find that reference — check the book name
              </p>
            ) : verse ? (
              <p className={styles.verse} style={{ fontSize: 'var(--reading-size)' }}>
                {verse}
              </p>
            ) : (
              <p className={styles.empty}>
                {!canReadBack
                  ? 'Live text unavailable — verses are still sent to the screens'
                  : shown
                    ? 'Waiting for the screens…'
                    : 'Type a reference and tap SHOW ON SCREEN — the verse appears here'}
              </p>
            )}
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
        </div>
      </div>
    </section>
  );
}
