/** Shared domain types for the Elim Stage Controller (FreeShow backend). */

export type ViewId =
  | 'settings'
  | 'home'
  | 'songs'
  | 'bible'
  | 'images'
  | 'presentation';

export type FontSize = 'small' | 'medium' | 'large';

/** Per-device configuration, persisted to localStorage. */
export interface Settings {
  host: string;
  /** FreeShow's HTTP/REST API port (Settings → Connection). Default 5506. */
  port: string;
  fontSize: FontSize;
  /** Which view opens on launch once configured. */
  defaultRole: ViewId;
  /** Song view: show the current on-screen line under the live song card. */
  nextPreview: boolean;
}

/**
 * What a project item actually is. FreeShow has no `plugin` field the way
 * OpenLP did, so this is derived from the item's `type` / `category` / file
 * extension — see `classifyItem()` in `api.ts`.
 */
export type ItemKind =
  | 'song'
  | 'image'
  | 'video'
  | 'audio'
  | 'presentation'
  | 'section'
  | 'other';

/** One item inside a FreeShow project (the equivalent of a service item). */
export interface ServiceItem {
  id: string;
  title: string;
  kind: ItemKind;
  /** Slide count, when the payload provides it. */
  slides?: number;
  notes?: string;
}

/** A FreeShow project — the closest thing to OpenLP's "service". */
export interface Project {
  id: string;
  name: string;
  items: ServiceItem[];
  /** True when FreeShow flags this project as the opened one. */
  active?: boolean;
}

/** Normalised view of whatever FreeShow currently has live. */
export interface LiveItem {
  id: string | null;
  kind: ItemKind | null;
  name: string;
  /** 0-based index of the current slide. */
  slide: number;
  /** Total slides in the live item. */
  total: number;
  /** Plain text of the current slide. */
  text: string;
  tag?: string;
}

/**
 * `send-only` means FreeShow is reachable but its responses are blocked —
 * in practice a CORS rejection. Commands still land (fired opaquely); nothing
 * can be read back. See `sendAction()` in `api.ts`.
 */
export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'send-only'
  | 'disconnected';

/** One snapshot of FreeShow's output, produced by the polling link. */
export interface OutputSnapshot {
  /** Text currently on the screens (`get_output_slide_text`). */
  text: string;
  /** Current slide of the active show (`get_slide`). */
  live: LiveItem | null;
}
