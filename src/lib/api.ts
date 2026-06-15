import { loadSettings } from './storage';
import type { LiveItem, ServiceItem } from './types';

/** Connection details for building API/WS URLs. */
export interface ConnInfo {
  host: string;
  port: string;
  username?: string;
  password?: string;
}

function connFromStorage(): ConnInfo {
  const s = loadSettings();
  return {
    host: s.host,
    port: s.port,
    username: s.username,
    password: s.password,
  };
}

export function apiUrl(path: string, conn: ConnInfo = connFromStorage()): string {
  const host = conn.host || '192.168.1.50';
  const port = conn.port || '4316';
  return `http://${host}:${port}${path}`;
}

export function wsUrl(conn: ConnInfo = connFromStorage()): string {
  const host = conn.host || '192.168.1.50';
  const port = conn.port || '4316';
  return `ws://${host}:${port}/ws`;
}

function authHeader(conn: ConnInfo): Record<string, string> {
  if (conn.username && conn.password) {
    return { Authorization: 'Basic ' + btoa(`${conn.username}:${conn.password}`) };
  }
  return {};
}

/**
 * Shared API helper — every network call goes through here.
 * Reads the connection from localStorage unless an explicit `conn` is given
 * (Settings' "Test Connection" passes the in-progress, unsaved form values).
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  conn: ConnInfo = connFromStorage(),
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeader(conn),
    ...(options.headers as Record<string, string> | undefined),
  };
  const res = await fetch(apiUrl(path, conn), { ...options, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Some endpoints return empty bodies (204 / POST acks).
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const post = (path: string, body?: unknown) =>
  apiFetch(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/* ---------------------------------------------------------------- *
 * Typed actions (thin wrappers over the OpenLP v2 REST API)
 * ---------------------------------------------------------------- */

/** Connectivity probe used by Settings → Test Connection. */
export function fetchState(conn?: ConnInfo): Promise<unknown> {
  return apiFetch('/api/v2/core/state', {}, conn ?? connFromStorage());
}

export async function fetchServiceItems(): Promise<ServiceItem[]> {
  const raw = await apiFetch<unknown>('/api/v2/service/items');
  const arr = unwrap(raw);
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeServiceItem);
}

export async function fetchLiveItem(): Promise<LiveItem | null> {
  const raw = await apiFetch<unknown>('/api/v2/controller/live-item');
  return normalizeLiveItem(raw);
}

export const nextItem = () => post('/api/v2/controller/next-item');
export const previousItem = () => post('/api/v2/controller/previous-item');
export const showItem = (id: string) => post('/api/v2/service/show', { id });
export const showSlide = (id: string, slide: number) =>
  post('/api/v2/controller/show', { id, slide });
export const setBlank = (display: 'blank' | 'theme' | 'desktop' | 'show') =>
  post('/api/v2/controller/blank', { display });

/* ---------------------------------------------------------------- *
 * Normalisation — OpenLP's shapes vary by version; be defensive.
 * ---------------------------------------------------------------- */

/** Unwrap the common `{ results: ... }` envelope. */
function unwrap(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'results' in raw) {
    return (raw as { results: unknown }).results;
  }
  return raw;
}

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

function normalizeServiceItem(raw: unknown, i: number): ServiceItem {
  const r = asRecord(raw);
  return {
    id: str(r.id ?? r.uuid ?? i),
    title: str(r.title ?? r.name ?? `Item ${i + 1}`),
    plugin: str(r.plugin ?? r.type ?? '').toLowerCase(),
    selected: Boolean(r.selected),
    slides: r.slides != null ? num(r.slides) : undefined,
    notes: r.notes != null ? str(r.notes) : undefined,
  };
}

/** Convert OpenLP slide HTML into clean multi-line plain text. */
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
 * Normalise GET /controller/live-item into a {@link LiveItem}.
 * Handles both the object shape (`{ name, slide, total, html }`) and the
 * array-of-slides shape (each slide has `selected`, `html`/`text`, `title`).
 */
export function normalizeLiveItem(raw: unknown): LiveItem | null {
  const results = unwrap(raw);
  if (results == null) return null;

  // Array-of-slides shape
  if (Array.isArray(results)) {
    if (results.length === 0) return null;
    const slides = results.map(asRecord);
    let current = slides.findIndex((s) => Boolean(s.selected));
    if (current < 0) current = 0;
    const cur = slides[current];
    const html = str(cur.html ?? cur.text ?? cur.chords ?? '');
    return {
      id: str(cur.item ?? cur.id ?? '') || null,
      plugin: str(cur.plugin ?? '') || null,
      name: str(cur.title ?? slides[0].title ?? ''),
      slide: current,
      total: slides.length,
      text: stripHtml(html),
      tag: cur.tag != null ? str(cur.tag) : undefined,
    };
  }

  // Object shape
  const r = asRecord(results);
  if (Object.keys(r).length === 0) return null;
  const html = str(r.html ?? r.text ?? '');
  return {
    id: str(r.item ?? r.id ?? '') || null,
    plugin: str(r.plugin ?? '') || null,
    name: str(r.name ?? r.title ?? ''),
    slide: num(r.slide),
    total: num(r.total, 1),
    text: stripHtml(html),
    tag: r.tag != null ? str(r.tag) : undefined,
  };
}
