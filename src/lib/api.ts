import { FreeShowSocket, socketUrl } from './socket';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from './types';
import type {
  Bible,
  BibleBook,
  BibleChapter,
  BibleInfo,
  BibleVerse,
  ConnectionStatus,
  ItemKind,
  LiveItem,
  Project,
  ServiceItem,
  ShowDetail,
  Slide,
  SlideItem,
  SlideLine,
  SlideTextRun,
} from './types';

/**
 * The one place the app talks to FreeShow (hard rule, CLAUDE.md §9).
 *
 * Owns a single RemoteShow socket. Views never touch this directly — they read
 * from `AppContext`, which owns the connection lifecycle.
 */

export interface ConnInfo {
  host: string;
  port: string;
  password: string;
}

export const HOST_PLACEHOLDER = '192.168.1.50';
export const DEFAULT_PORT = '5510';

let socket: FreeShowSocket | null = null;

export interface ConnectCallbacks {
  onStatus: (status: ConnectionStatus) => void;
  onMessage: (channel: string, data: unknown) => void;
}

export function connect(conn: ConnInfo, cb: ConnectCallbacks): void {
  disconnect();
  socket = new FreeShowSocket(
    socketUrl(conn.host || HOST_PLACEHOLDER, conn.port || DEFAULT_PORT),
    conn.password,
    cb,
  );
  socket.start();
}

export function disconnect(): void {
  socket?.stop();
  socket = null;
}

export function isConnected(): boolean {
  return socket?.isReady ?? false;
}

/* ---------------------------------------------------------------- *
 * Commands
 * ---------------------------------------------------------------- */

function fire(fn: (s: FreeShowSocket) => void): void {
  if (!socket?.isReady) return;
  try {
    fn(socket);
  } catch {
    /* the socket dropped between the check and the send */
  }
}

export const nextSlide = (): void => fire((s) => s.api('next_slide'));
export const previousSlide = (): void => fire((s) => s.api('previous_slide'));

export const selectSlide = (showId: string, index: number): void =>
  fire((s) => s.api('index_select_slide', { showId, index }));

/**
 * Put a different show on screen.
 *
 * `index_select_slide` alone does nothing for a show FreeShow doesn't already
 * have open — the `SHOW` message is what opens it. This two-step is the whole
 * reason the app uses RemoteShow's protocol rather than the public API.
 */
export const selectShow = (showId: string, index = 0): void =>
  fire((s) => {
    s.send('SHOW', showId);
    s.api('index_select_slide', { showId, index });
  });

/**
 * Put a media file on screen.
 *
 * Two things about this are non-obvious:
 *
 * 1. Images are **not** shows. `id_select_project` makes FreeShow complain
 *    "Received trigger to start slide, but no show active"; media goes through
 *    `play_media` with the file path and its type.
 * 2. It lands on the **background** layer, so whatever slide text was live
 *    stays on top of it — an image shown after a song appears as a backdrop
 *    with the lyrics still over it. Clearing the slide layer first is what
 *    makes it read as a photo.
 */
export const playMedia = (path: string, type: 'image' | 'video' = 'image'): void =>
  fire((s) => {
    s.api('clear_slide');
    s.api('play_media', { path, data: { type } });
  });

export const clearOutput = (): void => fire((s) => s.api('clear_all'));
export const clearSlide = (): void => fire((s) => s.api('clear_slide'));

export const startScripture = (reference: string, id?: string): void =>
  fire((s) => s.api('start_scripture', id ? { reference, id } : { reference }));

export const scriptureNext = (): void => fire((s) => s.api('scripture_next'));
export const scripturePrevious = (): void =>
  fire((s) => s.api('scripture_previous'));

/** Ask for a show's full definition; the reply arrives on the `SHOW` channel. */
export const requestShow = (showId: string): void =>
  fire((s) => s.send('SHOW', showId));

/** Ask for a bible, or a narrower slice of one. */
export const requestScripture = (
  id: string,
  book?: { key: string; index: number },
  chapter?: { key: string; index: number },
): void =>
  fire((s) =>
    s.send('GET_SCRIPTURE', {
      id,
      ...(book ? { bookKey: book.key, bookIndex: book.index } : {}),
      ...(chapter ? { chapterKey: chapter.key, chapterIndex: chapter.index } : {}),
    }),
  );

/** Media thumbnail as a data URL, or '' when FreeShow has none. */
export async function fetchThumbnail(path: string): Promise<string> {
  if (!socket?.isReady || !path) return '';
  try {
    const res = await socket.requestApi<{ thumbnail?: unknown }>(
      'get_thumbnail',
      { path },
      4000,
    );
    return str(asRecord(res).thumbnail);
  } catch {
    return '';
  }
}

/* ---------------------------------------------------------------- *
 * Normalisation
 *
 * Shapes verified live on 2026-08-10 — see the Usable fragment *FreeShow
 * RemoteShow protocol (port 5510) — VERIFIED LIVE*. Still defensive: this is a
 * private protocol and may drift between FreeShow releases.
 * ---------------------------------------------------------------- */

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : v == null ? fallback : String(v);
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Strip a directory path and file extension off a filename-ish title. */
export function cleanTitle(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? raw;
  return base.replace(/\.[a-z0-9]{2,5}$/i, '') || raw;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)$/i;
const VIDEO_EXT = /\.(mp4|mov|mkv|webm|avi|m4v)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
const PRESO_EXT = /\.(pptx?|odp|pdf|key)$/i;

/** Metadata from the `SHOWS` channel: `{ name, category }` per show id. */
export type ShowIndex = Map<string, { name: string; category: string | null }>;

/**
 * Classify a project item. FreeShow's own `category` is authoritative where it
 * exists — that is what the Songs/Presentations tabs use — then the item type,
 * then the filename.
 *
 * An uncategorised show falls back to `song`: a service is mostly songs, and a
 * show that appears in no view at all is worse than one in the wrong view.
 */
export function classifyItem(
  item: Record<string, unknown>,
  show?: { category: string | null },
): ItemKind {
  const type = str(item.type).toLowerCase();
  if (type === 'section') return 'section';
  if (type === 'image') return 'image';
  if (type === 'video' || type === 'player') return 'video';
  if (type === 'audio') return 'audio';
  if (type === 'pdf' || type === 'ppt' || type === 'powerpoint') {
    return 'presentation';
  }

  const category = (show?.category ?? '').toLowerCase();
  if (category.includes('song')) return 'song';
  if (category.includes('present') || category.includes('slide')) {
    return 'presentation';
  }

  const name = str(item.name ?? item.path ?? item.id);
  if (IMAGE_EXT.test(name)) return 'image';
  if (VIDEO_EXT.test(name)) return 'video';
  if (AUDIO_EXT.test(name)) return 'audio';
  if (PRESO_EXT.test(name)) return 'presentation';

  return 'song';
}

/** `SHOWS` → an id-keyed index of names and categories. */
export function normalizeShowIndex(raw: unknown): ShowIndex {
  const index: ShowIndex = new Map();
  for (const [id, value] of Object.entries(asRecord(raw))) {
    const show = asRecord(value);
    index.set(id, {
      name: str(show.name, id),
      category: show.category == null ? null : str(show.category),
    });
  }
  return index;
}

/**
 * `PROJECTS` → domain projects. Project entries are bare `{id, index}`, so
 * names and categories have to come from the `SHOWS` index.
 */
export function normalizeProjects(raw: unknown, shows: ShowIndex): Project[] {
  const list = Array.isArray(raw)
    ? raw
    : Object.entries(asRecord(raw)).map(([id, v]) => ({ id, ...asRecord(v) }));

  return list.map((value, i) => {
    const project = asRecord(value);
    const entries = Array.isArray(project.shows) ? project.shows : [];
    return {
      id: str(project.id, String(i)),
      name: str(project.name ?? project.title, `Project ${i + 1}`),
      items: entries.map((entry, j) => normalizeServiceItem(entry, j, shows)),
    };
  });
}

export function normalizeServiceItem(
  raw: unknown,
  i: number,
  shows: ShowIndex,
): ServiceItem {
  const item = asRecord(raw);
  const id = str(item.id, String(i));
  const show = shows.get(id);
  const rawName = str(item.name ?? show?.name ?? item.path ?? id);
  return {
    id,
    title: cleanTitle(rawName) || `Item ${i + 1}`,
    kind: classifyItem(item, show),
    path: item.path != null ? str(item.path) : undefined,
    notes: item.notes != null ? str(item.notes) : undefined,
  };
}

/** Pull plain text out of a slide's `items ▸ lines ▸ text ▸ value` nesting. */
export function extractSlideText(raw: unknown): string {
  const slide = asRecord(raw);
  const items = Array.isArray(slide.items)
    ? slide.items
    : Array.isArray(slide.tempItems)
      ? slide.tempItems
      : [];

  return items
    .map((item) => {
      const lines = asRecord(item).lines;
      if (!Array.isArray(lines)) return '';
      return lines
        .map((line) => {
          const parts = asRecord(line).text;
          if (!Array.isArray(parts)) return '';
          return parts.map((p) => str(asRecord(p).value)).join('');
        })
        .filter((s) => s.trim())
        .join('\n');
    })
    .filter((s) => s.trim())
    .join('\n\n')
    .trim();
}

/* ---------------------------------------------------------------- *
 * Slide geometry — for rendering a visual preview
 *
 * FreeShow never sends a picture of a slide (`get_thumbnail` returns nothing
 * for a show), so a preview has to be drawn from the slide's own layout, the
 * way RemoteShow does it. Items are positioned against a 1920x1080 canvas.
 * ---------------------------------------------------------------- */

/** Parse `"top: 30px;left: 30px;…"` into a plain map. Unknown keys are kept
 *  here and filtered by the callers, so nothing raw reaches the DOM. */
export function parseStyle(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of str(raw).split(';')) {
    const at = rule.indexOf(':');
    if (at < 0) continue;
    const key = rule.slice(0, at).trim().toLowerCase();
    const value = rule.slice(at + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

function px(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Only colours we can vouch for: no `url()`, no expressions. */
function safeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,/%]+\)|hsla?\([\d\s.,/%deg]+\)|[a-z]+)$/i.test(v)
    ? v
    : undefined;
}

function readAlign(value: string | undefined): 'left' | 'center' | 'right' | undefined {
  const v = (value ?? '').toLowerCase();
  if (v.includes('center')) return 'center';
  if (v.includes('right')) return 'right';
  if (v.includes('left')) return 'left';
  return undefined;
}

function normalizeTextRun(raw: unknown): SlideTextRun {
  const part = asRecord(raw);
  const style = parseStyle(part.style);
  const weight = style['font-weight'] ?? '';
  return {
    value: str(part.value),
    fontSize: style['font-size'] ? px(style['font-size']) : undefined,
    color: safeColor(style.color),
    bold: weight === 'bold' || px(weight) >= 600,
    italic: (style['font-style'] ?? '').includes('italic'),
  };
}

function normalizeLine(raw: unknown): SlideLine {
  const line = asRecord(raw);
  const parts = Array.isArray(line.text) ? line.text : [];
  return {
    align: readAlign(parseStyle(line.align)['text-align'] ?? str(line.align)),
    runs: parts.map(normalizeTextRun).filter((r) => r.value !== ''),
  };
}

/** Positioned boxes for one slide, safe to render. */
export function normalizeSlideItems(raw: unknown): SlideItem[] {
  const slide = asRecord(raw);
  const items = Array.isArray(slide.items)
    ? slide.items
    : Array.isArray(slide.tempItems)
      ? slide.tempItems
      : [];

  return items
    .map((entry): SlideItem => {
      const item = asRecord(entry);
      const style = parseStyle(item.style);
      const lines = Array.isArray(item.lines) ? item.lines : [];
      return {
        left: px(style.left),
        top: px(style.top),
        width: px(style.width, SLIDE_WIDTH),
        height: px(style.height, SLIDE_HEIGHT),
        background: safeColor(style['background-color']),
        radius: style['border-radius'] ? px(style['border-radius']) : undefined,
        padding: style.padding ? px(style.padding) : undefined,
        align: readAlign(str(item.align)),
        lines: lines.map(normalizeLine).filter((l) => l.runs.length > 0),
      };
    })
    .filter((item) => item.lines.length > 0);
}

/**
 * `SHOW` → a show with its slides flattened.
 *
 * The layout lists parent slides; each parent may have `children`. What the
 * operator sees, and what `OUT_DATA.slide.index` counts, is parents and
 * children interleaved in order — so that is what we build.
 */
export function flattenShow(raw: unknown, id: string): ShowDetail | null {
  const show = asRecord(raw);
  if (Object.keys(show).length === 0) return null;

  const slideMap = asRecord(show.slides);
  const layouts = asRecord(show.layouts);
  const activeLayout = str(asRecord(show.settings).activeLayout);
  const layout = asRecord(layouts[activeLayout] ?? Object.values(layouts)[0]);
  const order = Array.isArray(layout.slides) ? layout.slides : [];

  const slides: Slide[] = [];
  const push = (slideId: string) => {
    const slide = asRecord(slideMap[slideId]);
    if (Object.keys(slide).length === 0) return;
    slides.push({
      id: slideId,
      index: slides.length,
      group: str(slide.group),
      text: extractSlideText(slide),
      notes: str(slide.notes),
      items: normalizeSlideItems(slide),
    });
    const children = slide.children;
    if (Array.isArray(children)) {
      for (const child of children) push(str(child));
    }
  };

  for (const entry of order) push(str(asRecord(entry).id));

  const category = show.category == null ? null : str(show.category);
  return {
    id,
    name: str(show.name, id),
    category,
    kind: classifyItem({ id }, { category }),
    slides,
  };
}

/** `OUT_DATA` → where the output currently is. */
export interface OutputPosition {
  showId: string | null;
  layoutId: string | null;
  index: number;
  /** True when scripture (or other temporary content) is live, not a show. */
  temporary: boolean;
}

export function normalizeOutput(raw: unknown): OutputPosition {
  const slide = asRecord(asRecord(raw).slide);
  const id = str(slide.id);
  return {
    showId: id && id !== 'temp' ? id : null,
    layoutId: slide.layout != null ? str(slide.layout) : null,
    index: num(slide.index),
    temporary: id === 'temp',
  };
}

/**
 * Build the view-facing {@link LiveItem} from the output position plus the
 * show it points at. Scripture is handled separately because FreeShow inlines
 * it into the output rather than pointing at a show.
 */
export function buildLiveItem(
  position: OutputPosition,
  show: ShowDetail | null,
): LiveItem | null {
  if (position.temporary || !position.showId) return null;
  if (!show || show.id !== position.showId) {
    // Position known, show not loaded yet — report what we can.
    return {
      id: position.showId,
      kind: null,
      name: '',
      slide: position.index,
      total: position.index + 1,
      text: '',
      nextText: '',
      notes: '',
      items: [],
      nextItems: [],
    };
  }
  const current = show.slides[position.index];
  const next = show.slides[position.index + 1];
  return {
    id: show.id,
    kind: show.kind,
    name: show.name,
    slide: position.index,
    total: show.slides.length,
    text: current?.text ?? '',
    nextText: next?.text ?? '',
    notes: current?.notes ?? '',
    group: current?.group || undefined,
    items: current?.items ?? [],
    nextItems: next?.items ?? [],
  };
}

/**
 * Scripture output. FreeShow inlines the verse into `OUT`/`OUT_DATA` as
 * `tempItems`, with the reference and verse text in `customDynamicValues`.
 */
export function buildScriptureItem(raw: unknown): LiveItem | null {
  const slide = asRecord(asRecord(raw).slide);
  if (str(slide.id) !== 'temp') return null;
  const dynamic = asRecord(slide.customDynamicValues);
  const nextSlides = Array.isArray(slide.nextSlides) ? slide.nextSlides : [];
  return {
    id: null,
    kind: null,
    name: str(dynamic.scripture_name),
    slide: 0,
    total: 1,
    text: extractSlideText(slide),
    nextText: extractSlideText({ items: nextSlides[0] ?? [] }),
    notes: '',
    items: normalizeSlideItems(slide),
    nextItems: normalizeSlideItems({ items: nextSlides[0] ?? [] }),
    scriptureRef: str(dynamic.scripture_reference_full) || undefined,
  };
}

/* ---------------------------------------------------------------- *
 * Scripture
 * ---------------------------------------------------------------- */

/** `SCRIPTURE` → the installed bibles. */
export function normalizeBibles(raw: unknown): BibleInfo[] {
  return Object.entries(asRecord(raw)).map(([id, value]) => {
    const bible = asRecord(value);
    return {
      id,
      name: str(bible.name, id),
      online: bible.api === true,
    };
  });
}

/** `GET_SCRIPTURE` → one bible, as deep as FreeShow filled it in. */
export function normalizeBible(raw: unknown): Bible | null {
  const payload = asRecord(raw);
  const bible = asRecord(payload.bible);
  if (Object.keys(bible).length === 0) return null;
  const metadata = asRecord(bible.metadata);
  const books = Array.isArray(bible.books) ? bible.books : [];

  return {
    id: str(payload.id),
    name: str(bible.name ?? metadata.title),
    language: metadata.language != null ? str(metadata.language) : undefined,
    books: books.map(normalizeBook),
  };
}

function normalizeBook(raw: unknown, i: number): BibleBook {
  const book = asRecord(raw);
  const chapters = Array.isArray(book.chapters) ? book.chapters : [];
  return {
    number: num(book.number, i + 1),
    name: str(book.name, `Book ${i + 1}`),
    key: str(book.id ?? book.key),
    chapters: chapters.map(normalizeChapter),
  };
}

function normalizeChapter(raw: unknown, i: number): BibleChapter {
  const chapter = asRecord(raw);
  const verses = Array.isArray(chapter.verses) ? chapter.verses : [];
  return {
    number: num(chapter.number, i + 1),
    verses: verses.map(normalizeVerse),
  };
}

function normalizeVerse(raw: unknown, i: number): BibleVerse {
  const verse = asRecord(raw);
  return {
    number: num(verse.number, i + 1),
    text: str(verse.text),
  };
}

/** Human-readable reference for the UI: `"Jóhannes 3:16"`. */
export function formatReference(
  book: string,
  chapter: number,
  verse?: number,
): string {
  const base = `${book} ${chapter}`;
  return verse ? `${base}:${verse}` : base;
}

/**
 * What `start_scripture` actually wants — and it is not what the name suggests.
 *
 * The reference is **numeric and dot-separated**, `book.chapter.verse`, sent
 * alongside the bible `id`. A human reference like `"1 Mósebók 1:3"` is
 * accepted but only the book name is honoured: FreeShow silently shows verse
 * 1:1. Confirmed by reading what RemoteShow itself sends.
 */
export function wireReference(
  bookNumber: number,
  chapter: number,
  verse: number,
): string {
  return `${bookNumber}.${chapter}.${verse}`;
}

/**
 * Resolve a typed reference (`"Jóh 3:16"`) against the loaded bible, so the
 * free-text field can produce the numeric form too. Returns null when the book
 * can't be matched, which is what drives the "check the book name" error.
 */
export function parseReference(
  input: string,
  bible: Bible | null,
): { wire: string; display: string } | null {
  if (!bible) return null;
  const match = input.trim().match(/^(.+?)\s+(\d+)(?:[:.](\d+))?$/);
  if (!match) return null;

  const [, rawBook, rawChapter, rawVerse] = match;
  const needle = rawBook.trim().toLowerCase();
  const book =
    bible.books.find((b) => b.name.toLowerCase() === needle) ??
    bible.books.find((b) => b.name.toLowerCase().startsWith(needle)) ??
    bible.books.find((b) => b.key.toLowerCase() === needle);
  if (!book) return null;

  const chapter = parseInt(rawChapter, 10);
  const verse = rawVerse ? parseInt(rawVerse, 10) : 1;
  return {
    wire: wireReference(book.number, chapter, verse),
    display: formatReference(book.name, chapter, verse),
  };
}
