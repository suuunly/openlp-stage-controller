import { loadSettings } from './storage';
import type { ItemKind, LiveItem, Project, ServiceItem } from './types';

/**
 * FreeShow's control API (https://freeshow.app/api).
 *
 * It is **action-based, not path-based**: one endpoint, and the verb travels in
 * the payload. Everything goes over the HTTP transport on port 5506 as a plain
 * `GET /?action=…&data=…`, which is deliberate:
 *
 * - a GET with no custom headers is a CORS *simple request*, so it never
 *   triggers a preflight — one less thing to fail on a church LAN;
 * - it is the only form that can be replayed with `mode: 'no-cors'` when the
 *   browser refuses to show us the response (see `sendAction`).
 *
 * ⚠️ The API server is OFF by default (FreeShow → Settings → Connection).
 */

/** Connection details for building action URLs. */
export interface ConnInfo {
  host: string;
  port: string;
}

export const HOST_PLACEHOLDER = '192.168.1.50';
export const DEFAULT_API_PORT = '5506';

function connFromStorage(): ConnInfo {
  const s = loadSettings();
  return { host: s.host, port: s.port };
}

export type ActionId =
  // queries — we need the response body
  | 'get_output'
  | 'get_output_slide_text'
  | 'get_slide'
  | 'get_projects'
  | 'get_project'
  // commands — fire and forget
  | 'next_slide'
  | 'previous_slide'
  | 'index_select_slide'
  | 'name_select_slide'
  | 'id_select_project'
  | 'index_select_project'
  | 'toggle_output'
  | 'start_scripture'
  | 'scripture_next'
  | 'scripture_previous';

/** Actions whose response we actually read. Everything else is fire-and-forget. */
const QUERY_ACTIONS: ReadonlySet<string> = new Set<ActionId>([
  'get_output',
  'get_output_slide_text',
  'get_slide',
  'get_projects',
  'get_project',
]);

export type FaultKind = 'unreachable' | 'http';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: FaultKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Build the action URL. Exported for tests and the Settings diagnostics. */
export function actionUrl(
  action: ActionId,
  data?: Record<string, unknown>,
  conn: ConnInfo = connFromStorage(),
): string {
  const host = conn.host || HOST_PLACEHOLDER;
  const port = conn.port || DEFAULT_API_PORT;
  const params = new URLSearchParams({ action });
  const payload = compact(data);
  if (payload) params.set('data', JSON.stringify(payload));
  return `http://${host}:${port}/?${params.toString()}`;
}

/** Drop undefined values so optional action fields don't serialise as null. */
function compact(
  data?: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!data) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = v;
  return Object.keys(out).length > 0 ? out : null;
}

/* ---------------------------------------------------------------- *
 * Transport
 * ---------------------------------------------------------------- */

let sendOnly = false;

/**
 * True once a command has had to fall back to an opaque `no-cors` request —
 * i.e. FreeShow is answering, but the browser won't let us read it. Control
 * still works; observation doesn't.
 */
export function isSendOnly(): boolean {
  return sendOnly;
}

export function resetTransportState(): void {
  sendOnly = false;
}

/**
 * Every network call in the app goes through here (hard rule, CLAUDE.md §9).
 *
 * A browser reports a CORS rejection and a dead host identically, as a bare
 * `TypeError` — so on failure we retry *commands* with `mode: 'no-cors'`. The
 * request is still sent and executed; only the response is withheld. That
 * keeps PREV/NEXT working even if the CORS question (TASK-00 B1) comes back
 * badly. Queries have nothing to salvage and fail loudly.
 */
export async function sendAction<T = unknown>(
  action: ActionId,
  data?: Record<string, unknown>,
  conn: ConnInfo = connFromStorage(),
): Promise<T> {
  const url = actionUrl(action, data, conn);
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, 'http', res.status);
    sendOnly = false;
    return parseBody(await res.text()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (!QUERY_ACTIONS.has(action)) {
      try {
        await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
        sendOnly = true;
        return undefined as T;
      } catch {
        /* genuinely unreachable — fall through */
      }
    }
    throw new ApiError('Cannot reach FreeShow', 'unreachable');
  }
}

/**
 * Is the host answering at all, ignoring whether we may read the answer?
 * An opaque request resolves for any live server, so this separates
 * "FreeShow is off / wrong IP" from "FreeShow is up but CORS-blocked".
 */
export async function probeReachable(
  conn: ConnInfo = connFromStorage(),
): Promise<boolean> {
  try {
    await fetch(actionUrl('get_output', undefined, conn), {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
    });
    return true;
  } catch {
    return false;
  }
}

export function parseBody(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

/* ---------------------------------------------------------------- *
 * Typed actions
 * ---------------------------------------------------------------- */

export const nextSlide = (): Promise<unknown> => sendAction('next_slide');
export const previousSlide = (): Promise<unknown> => sendAction('previous_slide');

export const selectSlideIndex = (
  index: number,
  showId?: string,
  layoutId?: string,
): Promise<unknown> =>
  sendAction('index_select_slide', { index, showId, layoutId });

export const activateProjectItem = (id: string): Promise<unknown> =>
  sendAction('id_select_project', { id });

export const toggleOutput = (id?: string): Promise<unknown> =>
  sendAction('toggle_output', { id });

export const startScripture = (reference: string, id?: string): Promise<unknown> =>
  sendAction('start_scripture', { reference, id });

export const scriptureNext = (): Promise<unknown> => sendAction('scripture_next');
export const scripturePrevious = (): Promise<unknown> =>
  sendAction('scripture_previous');

/** Connectivity probe used by Settings → Test Connection. */
export const fetchOutput = (conn?: ConnInfo): Promise<unknown> =>
  sendAction('get_output', undefined, conn ?? connFromStorage());

/** The text currently on the screens — the singer/speaker read-along. */
export async function fetchOutputSlideText(): Promise<string> {
  const raw = unwrap(await sendAction('get_output_slide_text'));
  if (typeof raw === 'string') return stripHtml(raw);
  if (Array.isArray(raw)) {
    return raw
      .map((v) => (typeof v === 'string' ? stripHtml(v) : extractSlideText(v)))
      .filter((s) => s.trim())
      .join('\n')
      .trim();
  }
  return extractSlideText(raw);
}

/** The active show's current slide. */
export async function fetchActiveSlide(): Promise<LiveItem | null> {
  return normalizeLiveItem(await sendAction('get_slide', { showId: 'active' }));
}

export async function fetchProjects(): Promise<Project[]> {
  return normalizeProjects(await sendAction('get_projects'));
}

export async function fetchProject(id: string): Promise<Project | null> {
  const list = normalizeProjects(await sendAction('get_project', { id }));
  if (list.length === 0) return null;
  return { ...list[0], id: list[0].id || id };
}

/* ---------------------------------------------------------------- *
 * Diagnostics — the field-test tool for the TASK-00 unknowns
 * ---------------------------------------------------------------- */

export interface DiagnosticCheck {
  action: ActionId;
  label: string;
  ok: boolean;
  detail: string;
}

export interface DiagnosticsReport {
  /** The host answered something, even if opaquely. */
  reachable: boolean;
  /** Reachable, but no response could be read — a CORS rejection. */
  corsBlocked: boolean;
  checks: DiagnosticCheck[];
}

/**
 * Probe the three things TASK-00 Part B needs answered, and report what came
 * back rather than a bare pass/fail — this is meant to be run standing next to
 * the FreeShow PC.
 */
export async function runDiagnostics(
  conn: ConnInfo,
): Promise<DiagnosticsReport> {
  const probes: { action: ActionId; label: string; run: () => Promise<string> }[] =
    [
      {
        action: 'get_output',
        label: 'API server responds',
        run: async () => describe(await sendAction('get_output', undefined, conn)),
      },
      {
        action: 'get_projects',
        label: 'Projects readable',
        run: async () => {
          const projects = normalizeProjects(
            await sendAction('get_projects', undefined, conn),
          );
          const items = projects.reduce((n, p) => n + p.items.length, 0);
          return `${projects.length} project(s), ${items} item(s)`;
        },
      },
      {
        action: 'get_output_slide_text',
        label: 'On-screen text readable',
        run: async () => {
          const raw = unwrap(
            await sendAction('get_output_slide_text', undefined, conn),
          );
          const text =
            typeof raw === 'string' ? stripHtml(raw) : extractSlideText(raw);
          return text ? `"${truncate(text, 40)}"` : 'empty (nothing on screen)';
        },
      },
    ];

  const checks: DiagnosticCheck[] = [];
  for (const probe of probes) {
    try {
      checks.push({
        action: probe.action,
        label: probe.label,
        ok: true,
        detail: await probe.run(),
      });
    } catch (err) {
      checks.push({
        action: probe.action,
        label: probe.label,
        ok: false,
        detail: err instanceof ApiError && err.kind === 'http'
          ? err.message
          : 'no readable response',
      });
    }
  }

  const anyOk = checks.some((c) => c.ok);
  const reachable = anyOk || (await probeReachable(conn));
  return { reachable, corsBlocked: reachable && !anyOk, checks };
}

function describe(raw: unknown): string {
  const v = unwrap(raw);
  if (v === undefined) return 'empty body';
  if (typeof v === 'string') return `"${truncate(v, 40)}"`;
  if (Array.isArray(v)) return `array of ${v.length}`;
  if (v && typeof v === 'object') {
    return `object {${Object.keys(v).slice(0, 4).join(', ')}}`;
  }
  return String(v);
}

function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

/* ---------------------------------------------------------------- *
 * Normalisation — FreeShow's payload shapes are unverified against a live
 * instance (TASK-00). Be defensive at the boundary; views only ever see the
 * clean domain types.
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

/**
 * Peel any `{ action, data }` / `{ results }` envelope the transport wraps the
 * payload in, without eating a legitimate `data` field on the payload itself
 * (hence the strict key check).
 */
export function unwrap(raw: unknown): unknown {
  let v = raw;
  for (let depth = 0; depth < 3; depth++) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) break;
    const r = v as Record<string, unknown>;
    const keys = Object.keys(r);
    const hasPayload = keys.includes('data') || keys.includes('results');
    const onlyEnvelopeKeys = keys.every(
      (k) => k === 'data' || k === 'results' || k === 'action' || k === 'id',
    );
    if (!hasPayload || !onlyEnvelopeKeys) break;
    v = keys.includes('data') ? r.data : r.results;
  }
  return v;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)$/i;
const VIDEO_EXT = /\.(mp4|mov|mkv|webm|avi|m4v)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
const PRESO_EXT = /\.(pptx?|odp|pdf|key)$/i;

/**
 * FreeShow has no `plugin` field. Classify from `type`, then `category`, then
 * the filename. A bare `show` is treated as a song — a church service is
 * mostly songs — which is the one guess here worth re-checking against a live
 * instance (TASK-00 B4).
 */
export function classifyItem(raw: unknown): ItemKind {
  const r = asRecord(raw);
  const type = str(r.type ?? r.itemType).toLowerCase();
  const category = str(r.category ?? r.categoryId).toLowerCase();
  const name = str(r.name ?? r.title ?? r.path ?? r.id);

  if (type === 'section') return 'section';
  if (type === 'image') return 'image';
  if (type === 'video' || type === 'player') return 'video';
  if (type === 'audio') return 'audio';
  if (type === 'pdf' || type === 'ppt' || type === 'powerpoint') {
    return 'presentation';
  }

  if (category.includes('song')) return 'song';
  if (category.includes('present') || category.includes('slide')) {
    return 'presentation';
  }

  if (IMAGE_EXT.test(name)) return 'image';
  if (VIDEO_EXT.test(name)) return 'video';
  if (AUDIO_EXT.test(name)) return 'audio';
  if (PRESO_EXT.test(name)) return 'presentation';

  if (type === 'show' || type === '') return 'song';
  return 'other';
}

/** Strip a directory path and file extension off a filename-ish title. */
function cleanTitle(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? raw;
  return base.replace(/\.[a-z0-9]{2,5}$/i, '') || raw;
}

export function normalizeServiceItem(raw: unknown, i: number): ServiceItem {
  const r = asRecord(raw);
  const rawName = str(r.name ?? r.title ?? r.path ?? r.id ?? `Item ${i + 1}`);
  return {
    id: str(r.id ?? r.showId ?? r.path ?? rawName ?? i),
    title: cleanTitle(rawName) || `Item ${i + 1}`,
    kind: classifyItem(r),
    slides: r.slides != null ? num(r.slides) : undefined,
    notes: r.notes != null ? str(r.notes) : undefined,
  };
}

function normalizeProject(raw: unknown, i: number): Project {
  const r = asRecord(raw);
  const rawItems = Array.isArray(r.shows)
    ? r.shows
    : Array.isArray(r.items)
      ? r.items
      : [];
  return {
    id: str(r.id ?? r.key ?? i),
    name: str(r.name ?? r.title ?? `Project ${i + 1}`),
    items: rawItems.map(normalizeServiceItem),
    active: r.active === true || r.selected === true || r.opened === true,
  };
}

/** Accepts an array of projects, a single project, or an id-keyed map. */
export function normalizeProjects(raw: unknown): Project[] {
  const v = unwrap(raw);
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(normalizeProject);
  if (typeof v !== 'object') return [];

  const r = v as Record<string, unknown>;
  // A single project object rather than a collection.
  if ('shows' in r || 'items' in r || 'name' in r) return [normalizeProject(r, 0)];

  // id-keyed map: { "<id>": { name, shows } }
  return Object.entries(r).map(([id, value], i) =>
    normalizeProject({ id, ...asRecord(value) }, i),
  );
}

/** Convert slide HTML into clean multi-line plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Pull readable text out of a FreeShow slide.
 *
 * FreeShow's show format nests it three deep —
 * `{ items: [ { lines: [ { text: [ { value } ] } ] } ] }` — but the API may
 * also hand back a plain string or an `{ html }`-ish object depending on the
 * action, so every shape falls back to the next.
 */
export function extractSlideText(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return stripHtml(raw);
  if (Array.isArray(raw)) {
    return raw
      .map(extractSlideText)
      .filter((s) => s.trim())
      .join('\n')
      .trim();
  }
  if (typeof raw !== 'object') return '';

  const r = raw as Record<string, unknown>;

  if (Array.isArray(r.items)) {
    const blocks = r.items
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
      .filter((s) => s.trim());
    if (blocks.length > 0) return blocks.join('\n\n').trim();
  }

  for (const key of ['text', 'value', 'html', 'content', 'lines']) {
    const v = r[key];
    if (typeof v === 'string' && v.trim()) return stripHtml(v);
    if (Array.isArray(v)) {
      const nested = extractSlideText(v);
      if (nested) return nested;
    }
  }
  return '';
}

/** Normalise `get_slide` into a {@link LiveItem}. */
export function normalizeLiveItem(raw: unknown): LiveItem | null {
  const v = unwrap(raw);
  if (v == null) return null;

  if (typeof v === 'string') {
    const text = stripHtml(v);
    return text
      ? { id: null, kind: null, name: '', slide: 0, total: 1, text }
      : null;
  }

  // Array-of-slides: find the selected one, or fall back to the first.
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    const slides = v.map(asRecord);
    let current = slides.findIndex((s) => s.selected === true || s.active === true);
    if (current < 0) current = 0;
    const cur = slides[current];
    return {
      id: str(cur.showId ?? cur.show ?? cur.id ?? '') || null,
      kind: cur.type != null ? classifyItem(cur) : null,
      name: str(cur.name ?? cur.title ?? slides[0].name ?? slides[0].title ?? ''),
      slide: current,
      total: slides.length,
      text: extractSlideText(cur),
      tag: cur.group != null ? str(cur.group) : undefined,
    };
  }

  const r = asRecord(v);
  if (Object.keys(r).length === 0) return null;

  // `slide` is an index in some payloads and the slide object in others.
  const slideField = r.slide;
  const slideIsIndex = typeof slideField === 'number';
  const slideSource = slideIsIndex ? r : (slideField ?? r);
  const show = asRecord(r.show);
  const layout = r.layout;

  const total = num(
    r.total ??
      r.slides ??
      r.length ??
      (Array.isArray(layout) ? layout.length : asRecord(layout).length),
    1,
  );

  return {
    id: str(r.showId ?? r.show ?? r.id ?? show.id ?? '') || null,
    kind: r.type != null ? classifyItem(r) : null,
    name: str(r.name ?? r.title ?? show.name ?? ''),
    slide: num(slideIsIndex ? slideField : (r.index ?? r.slideIndex ?? 0)),
    total: total > 0 ? total : 1,
    text: extractSlideText(slideSource),
    tag: r.group != null ? str(r.group) : r.tag != null ? str(r.tag) : undefined,
  };
}

/**
 * Read whether the output is currently showing, if the payload says so at all.
 * Returns null when it doesn't, so the caller keeps its optimistic local state
 * instead of flapping.
 */
export function readOutputActive(raw: unknown): boolean | null {
  const v = unwrap(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  for (const key of ['enabled', 'active', 'visible', 'show']) {
    if (typeof r[key] === 'boolean') return r[key] as boolean;
  }
  if (typeof r.blank === 'boolean') return !r.blank;
  return null;
}
