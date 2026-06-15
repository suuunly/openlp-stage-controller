import type { FontSize, Settings, ViewId } from './types';

/**
 * localStorage keys. Kept stable for backward-compat with the original spec
 * (TASK-01); `defaultRole`/`nextPreview` are additions.
 */
export const STORAGE_KEYS = {
  host: 'openlp_host',
  port: 'openlp_port',
  username: 'openlp_username',
  password: 'openlp_password',
  fontSize: 'openlp_font_size',
  defaultRole: 'openlp_default_role',
  nextPreview: 'openlp_next_preview',
} as const;

export const DEFAULT_SETTINGS: Settings = {
  host: '',
  port: '4316',
  username: '',
  password: '',
  fontSize: 'medium',
  defaultRole: 'home',
  nextPreview: true,
};

const FONT_SIZES: FontSize[] = ['small', 'medium', 'large'];
const VIEW_IDS: ViewId[] = [
  'settings',
  'home',
  'songs',
  'bible',
  'images',
  'presentation',
];

export function loadSettings(): Settings {
  const get = (k: string) => localStorage.getItem(k);
  const rawFont = get(STORAGE_KEYS.fontSize) as FontSize | null;
  const rawRole = get(STORAGE_KEYS.defaultRole) as ViewId | null;
  return {
    host: get(STORAGE_KEYS.host) ?? DEFAULT_SETTINGS.host,
    port: get(STORAGE_KEYS.port) ?? DEFAULT_SETTINGS.port,
    username: get(STORAGE_KEYS.username) ?? DEFAULT_SETTINGS.username,
    password: get(STORAGE_KEYS.password) ?? DEFAULT_SETTINGS.password,
    fontSize:
      rawFont && FONT_SIZES.includes(rawFont)
        ? rawFont
        : DEFAULT_SETTINGS.fontSize,
    defaultRole:
      rawRole && VIEW_IDS.includes(rawRole)
        ? rawRole
        : DEFAULT_SETTINGS.defaultRole,
    nextPreview:
      get(STORAGE_KEYS.nextPreview) === null
        ? DEFAULT_SETTINGS.nextPreview
        : get(STORAGE_KEYS.nextPreview) === 'true',
  };
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(STORAGE_KEYS.host, s.host.trim());
  localStorage.setItem(STORAGE_KEYS.port, s.port.trim() || DEFAULT_SETTINGS.port);
  localStorage.setItem(STORAGE_KEYS.username, s.username);
  localStorage.setItem(STORAGE_KEYS.password, s.password);
  localStorage.setItem(STORAGE_KEYS.fontSize, s.fontSize);
  localStorage.setItem(STORAGE_KEYS.defaultRole, s.defaultRole);
  localStorage.setItem(STORAGE_KEYS.nextPreview, String(s.nextPreview));
}

/** The app is "configured" once a host has been entered. */
export function isConfigured(s: Settings): boolean {
  return s.host.trim().length > 0;
}

/** Apply the reading-font-size preference as a body class. */
export function applyFontSize(size: FontSize): void {
  const body = document.body;
  body.classList.remove('font-small', 'font-medium', 'font-large');
  body.classList.add(`font-${size}`);
}
