import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { useTapGuard } from '../hooks/useTapGuard';
import { formatReference, parseReference, wireReference } from '../lib/api';
import { AppHeader } from '../components/AppHeader';
import { Icon } from '../components/Icon';
import type { BibleBook } from '../lib/types';
import styles from './BibleView.module.css';

const HISTORY_KEY = 'verse_history';
const HISTORY_MAX = 5;

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

type Step = 'book' | 'chapter' | 'verse';

/**
 * Bible Verse view — Book ▸ Chapter ▸ Verse, with the verse read on the device
 * *before* it goes on the screens.
 *
 * This is the design as originally drawn. It was written off as unbuildable
 * because the published API has no way to enumerate scripture; RemoteShow's
 * `GET_SCRIPTURE` returns the whole tree, verse text included, so both the
 * cascading picker and the preview are real (see CLAUDE.md §8, §10.7).
 */
export function BibleView(): ReactNode {
  const {
    bibles,
    bible,
    loadBible,
    liveItem,
    connection,
    showScripture,
    verseNext,
    versePrev,
  } = useApp();

  const [reference, setReference] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(loadHistory);

  const [step, setStep] = useState<Step>('book');
  const [bookIndex, setBookIndex] = useState<number | null>(null);
  const [chapterIndex, setChapterIndex] = useState<number | null>(null);
  /** The verse being read on this device — not necessarily what's on screen. */
  const [preview, setPreview] = useState<
    { ref: string; wire: string; text: string } | null
  >(null);
  const [badReference, setBadReference] = useState(false);

  // Prefer a locally installed bible (Elim's Faroese "Victor"); the online ones
  // need a round-trip per book and are a fallback, not the default.
  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (bible || bibles.length === 0) return;
    const preferred = bibles.find((b) => !b.online) ?? bibles[0];
    if (preferred && requested.current !== preferred.id) {
      requested.current = preferred.id;
      loadBible(preferred.id);
    }
  }, [bible, bibles, loadBible]);

  const books = bible?.books ?? [];
  const book = bookIndex != null ? books[bookIndex] : undefined;
  const chapter = chapterIndex != null ? book?.chapters[chapterIndex] : undefined;

  /**
   * `display` is what a human reads; `wire` is FreeShow's numeric
   * `book.chapter.verse`. Sending the human form shows the right *book* and
   * silently ignores chapter and verse, so the wire form is not optional.
   */
  const show = useCallback(
    (display: string, wire: string) => {
      if (!display.trim() || !wire) return;
      setBadReference(false);
      setShown(display.trim());
      setHistory((prev) => {
        const next = pushHistory(prev, display.trim());
        sessionStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        return next;
      });
      showScripture(wire, bible?.id);
    },
    [showScripture, bible?.id],
  );

  /** Show whatever is currently in the reference field or the picker. */
  const showCurrent = useCallback(() => {
    if (preview) {
      show(preview.ref, preview.wire);
      return;
    }
    const parsed = parseReference(reference, bible);
    if (!parsed) {
      setBadReference(true);
      return;
    }
    show(parsed.display, parsed.wire);
  }, [preview, reference, bible, show]);

  const guard = useTapGuard();
  const next = useCallback(() => guard('next', verseNext), [guard, verseNext]);
  const prev = useCallback(() => guard('prev', versePrev), [guard, versePrev]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
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

  function cycleBible() {
    if (bibles.length < 2) return;
    const i = bibles.findIndex((b) => b.id === bible?.id);
    const nextBible = bibles[(i + 1) % bibles.length];
    requested.current = nextBible.id;
    setBookIndex(null);
    setChapterIndex(null);
    setStep('book');
    setPreview(null);
    loadBible(nextBible.id);
  }

  function pickBook(i: number) {
    setBookIndex(i);
    setChapterIndex(null);
    setStep('chapter');
  }

  function pickChapter(i: number) {
    setChapterIndex(i);
    setStep('verse');
  }

  function pickVerse(verseNumber: number, text: string) {
    if (!book || !chapter) return;
    const ref = formatReference(book.name, chapter.number, verseNumber);
    setReference(ref);
    setBadReference(false);
    setPreview({ ref, wire: wireReference(book.number, chapter.number, verseNumber), text });
  }

  /**
   * The reading pane shows the verse being previewed until it is put on screen,
   * then whatever FreeShow reports — so it stays right when PREV/NEXT are used.
   */
  const liveRef = liveItem?.scriptureRef;
  const liveText = liveRef ? liveItem?.text ?? '' : '';
  // Once scripture is live, mirror the screens and label them with FreeShow's
  // own reference — so a mismatch shows up rather than being papered over.
  const onScreen = Boolean(shown && liveRef && liveText);
  const displayed = onScreen ? { ref: liveRef ?? '', text: liveText } : preview;

  const crumbs = useMemo(() => {
    const parts: { label: string; onClick: () => void }[] = [];
    if (book) parts.push({ label: book.name, onClick: () => setStep('chapter') });
    if (chapter) parts.push({ label: String(chapter.number), onClick: () => setStep('verse') });
    return parts;
  }, [book, chapter]);

  return (
    <section className={styles.view}>
      <AppHeader
        icon="menu_book"
        title="Bible Verses"
        subtitle={bible ? bible.name : 'Loading bibles…'}
        right={
          bibles.length > 1 ? (
            <button type="button" className={styles.bibleCycle} onClick={cycleBible}>
              <span>{bible?.name ?? 'Bible'}</span>
              <Icon name="unfold_more" size={18} />
            </button>
          ) : undefined
        }
      />

      <div className={styles.split}>
        <div className={styles.pane}>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              showCurrent();
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
              onChange={(e) => {
                setReference(e.target.value);
                setPreview(null);
                setBadReference(false);
              }}
            />
          </form>

          {(step !== 'book' || bookIndex != null) && (
            <div className={styles.crumbs}>
              <button
                type="button"
                className={styles.crumb}
                onClick={() => {
                  setStep('book');
                  setBookIndex(null);
                  setChapterIndex(null);
                }}
              >
                Books
              </button>
              {crumbs.map((c) => (
                <button key={c.label} type="button" className={styles.crumb} onClick={c.onClick}>
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <div className={styles.picker}>
            {books.length === 0 && (
              <p className={styles.pickerEmpty}>
                {connection === 'connected'
                  ? 'Loading the bible…'
                  : 'Connect to FreeShow to browse'}
              </p>
            )}

            {books.length > 0 && step === 'book' && (
              <ul className={styles.bookList}>
                {books.map((b, i) => (
                  <li key={`${b.key}-${i}`}>
                    <button type="button" className={styles.bookBtn} onClick={() => pickBook(i)}>
                      {b.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {step === 'chapter' && book && <NumberGrid book={book} onPick={pickChapter} />}

            {step === 'verse' && chapter && (
              <div className={styles.numGrid}>
                {chapter.verses.map((v) => (
                  <button
                    key={v.number}
                    type="button"
                    className={`${styles.numBtn} ${
                      preview?.ref === formatReference(book?.name ?? '', chapter.number, v.number)
                        ? styles.numBtnOn
                        : ''
                    }`}
                    onClick={() => pickVerse(v.number, v.text)}
                  >
                    {v.number}
                  </button>
                ))}
              </div>
            )}
          </div>

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
                      setPreview(null);
                      const parsed = parseReference(ref, bible);
                      if (parsed) show(parsed.display, parsed.wire);
                      else setBadReference(true);
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
            <span className={styles.refLabel}>
              {displayed?.ref ?? reference ?? 'Pick a verse'}
            </span>
            {displayed && (
              <span className={onScreen ? styles.onScreen : styles.previewBadge}>
                {onScreen ? 'ON SCREEN' : 'PREVIEW'}
              </span>
            )}
          </div>

          <div className={styles.verseWrap}>
            {badReference ? (
              <p className={styles.error}>
                Couldn’t find that reference — check the book name
              </p>
            ) : displayed ? (
              <p className={styles.verse} style={{ fontSize: 'var(--reading-size)' }}>
                {displayed.text}
              </p>
            ) : (
              <p className={styles.empty}>
                Choose a book, chapter and verse — you can read it here before it goes on
                the screens
              </p>
            )}
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.showBtn}
              disabled={!reference.trim()}
              onClick={showCurrent}
            >
              SHOW ON SCREEN
            </button>
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

function NumberGrid({
  book,
  onPick,
}: {
  book: BibleBook;
  onPick: (index: number) => void;
}): ReactNode {
  if (book.chapters.length === 0) {
    return <p className={styles.pickerEmpty}>No chapters in this book</p>;
  }
  return (
    <div className={styles.numGrid}>
      {book.chapters.map((c, i) => (
        <button key={c.number} type="button" className={styles.numBtn} onClick={() => onPick(i)}>
          {c.number}
        </button>
      ))}
    </div>
  );
}
