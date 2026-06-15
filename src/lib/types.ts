/** Shared domain types for the OpenLP Stage Controller. */

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
  port: string;
  username: string;
  password: string;
  fontSize: FontSize;
  /** Which view opens on launch once configured. */
  defaultRole: ViewId;
  /** Song view: show the current line under the live song card. */
  nextPreview: boolean;
}

/** A single item in the OpenLP service (song, bible, image, presentation…). */
export interface ServiceItem {
  id: string;
  title: string;
  plugin: string;
  selected?: boolean;
  /** Slide count, when the API provides it. */
  slides?: number;
  notes?: string;
}

/** Normalised view of whatever OpenLP currently has live. */
export interface LiveItem {
  id: string | null;
  plugin: string | null;
  name: string;
  /** 0-based index of the current slide. */
  slide: number;
  /** Total slides in the live item. */
  total: number;
  /** Plain-text of the current slide (HTML stripped). */
  text: string;
  tag?: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/** Normalised WebSocket event the app reacts to. */
export type OpenLpEventType =
  | 'slidecontroller_changed'
  | 'service_changed'
  | 'blank_changed';

export interface OpenLpEvent {
  type: OpenLpEventType;
  /** Raw payload (`results`) for handlers that need extra fields. */
  data: Record<string, unknown>;
}
