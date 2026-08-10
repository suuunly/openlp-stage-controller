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
  /** RemoteShow's port (FreeShow → Settings → Connection). Default 5510. */
  port: string;
  /** RemoteShow's 4-digit code, shown next to its QR in FreeShow. */
  password: string;
  fontSize: FontSize;
  /** Which view opens on launch once configured. */
  defaultRole: ViewId;
  /** Song view: show the current on-screen line under the live song card. */
  nextPreview: boolean;
}

/**
 * What a project item is. Derived from FreeShow's own `category` where it has
 * one (`song`, `presentation`), then the item `type`, then the filename.
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
  /** Media path — the key `API:get_thumbnail` wants. */
  path?: string;
  /** Section items carry notes directly on the project entry. */
  notes?: string;
}

/** A FreeShow project — the closest thing to OpenLP's "service". */
export interface Project {
  id: string;
  name: string;
  items: ServiceItem[];
}

/**
 * One slide, flattened out of FreeShow's hierarchy.
 *
 * A show's layout lists *parent* slides, each of which may have `children`.
 * What the operator sees — and what `OUT_DATA.slide.index` counts — is the
 * flattened sequence of parents and children in order.
 */
export interface Slide {
  id: string;
  /** Position in the flattened sequence. */
  index: number;
  /** Group label: `V1`, `C`, … Empty when ungrouped. */
  group: string;
  text: string;
  notes: string;
}

/** A show with its slides resolved and flattened. */
export interface ShowDetail {
  id: string;
  name: string;
  category: string | null;
  kind: ItemKind;
  slides: Slide[];
}

/** Normalised view of whatever FreeShow currently has live. */
export interface LiveItem {
  /** Show id, or null when scripture (or nothing) is live. */
  id: string | null;
  kind: ItemKind | null;
  name: string;
  /** 0-based index into the flattened slide sequence. */
  slide: number;
  total: number;
  /** Plain text of the current slide. */
  text: string;
  /** Plain text of the next slide, for the preview strip. */
  nextText: string;
  /** Speaker notes for the current slide. */
  notes: string;
  /** Group label of the current slide (`V1`, `C`…). */
  group?: string;
  /** Set when scripture is live: e.g. `"1 Mósebók 1:3"`. */
  scriptureRef?: string;
}

/**
 * `unauthorized` is its own state: FreeShow answered and rejected the code,
 * which needs a different message from "can't reach it".
 */
export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'unauthorized'
  | 'disconnected';

/* ---------------------------------------------------------------- *
 * Scripture — RemoteShow's GET_SCRIPTURE returns the whole tree,
 * including verse text, so verses can be previewed before showing.
 * ---------------------------------------------------------------- */

export interface BibleInfo {
  id: string;
  name: string;
  /** False for bibles installed locally (Elim's Faroese "Victor"). */
  online: boolean;
}

export interface BibleVerse {
  number: number;
  text: string;
}

export interface BibleChapter {
  number: number;
  verses: BibleVerse[];
}

export interface BibleBook {
  number: number;
  /** Faroese for the Victor bible: `1 Mósebók`, `Jóhannes`… */
  name: string;
  /** Canonical key, e.g. `GEN`. */
  key: string;
  chapters: BibleChapter[];
}

export interface Bible {
  id: string;
  name: string;
  language?: string;
  books: BibleBook[];
}
