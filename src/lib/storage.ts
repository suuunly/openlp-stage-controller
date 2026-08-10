import type { FontSize, Settings, ViewId } from './types';

/**
 * localStorage keys. Deliberately re-prefixed `freeshow_*` during the OpenLP →
 * FreeShow migration so a device that still holds an OpenLP host cannot
 * silently load it and appear "configured" against a server that no longer
 * exists. See `migrateLegacyKeys()`.
 */
export const STORAGE_KEYS = {
  host: 'freeshow_host',
  port: 'freeshow_port',
  password: 'freeshow_password',
  fontSize: 'freeshow_font_size',
  defaultRole: 'freeshow_default_role',
  nextPreview: 'freeshow_next_preview',
  imagePreviews: 'freeshow_image_previews',
} as const;

/** The keys written by the OpenLP-era build, cleared on first load. */
export const LEGACY_KEYS = {
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
  // RemoteShow's port (FreeShow → Settings → Connection). The documented API
  // ports (5505/5506) cannot drive a real remote — see src/lib/socket.ts.
  port: '5510',
  password: '',
  fontSize: 'medium',
  defaultRole: 'home',
  nextPreview: true,
  imagePreviews: true,
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

/**
 * Carry the device *preferences* over from the OpenLP build and drop the
 * connection details — the host and port are meaningless against FreeShow,
 * and a stale host reads as "configured", which would skip Settings and leave
 * a volunteer staring at a dead connection.
 */
export function migrateLegacyKeys(): void {
  const alreadyMigrated = localStorage.getItem(STORAGE_KEYS.fontSize) !== null;
  const legacyFont = localStorage.getItem(LEGACY_KEYS.fontSize);

  if (!alreadyMigrated && legacyFont !== null) {
    localStorage.setItem(STORAGE_KEYS.fontSize, legacyFont);
    const role = localStorage.getItem(LEGACY_KEYS.defaultRole);
    if (role !== null) localStorage.setItem(STORAGE_KEYS.defaultRole, role);
    const preview = localStorage.getItem(LEGACY_KEYS.nextPreview);
    if (preview !== null) localStorage.setItem(STORAGE_KEYS.nextPreview, preview);
  }

  for (const key of Object.values(LEGACY_KEYS)) localStorage.removeItem(key);
}

export function loadSettings(): Settings {
  migrateLegacyKeys();
  const get = (k: string) => localStorage.getItem(k);
  const rawFont = get(STORAGE_KEYS.fontSize) as FontSize | null;
  const rawRole = get(STORAGE_KEYS.defaultRole) as ViewId | null;
  return {
    host: get(STORAGE_KEYS.host) ?? DEFAULT_SETTINGS.host,
    port: get(STORAGE_KEYS.port) ?? DEFAULT_SETTINGS.port,
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
    imagePreviews:
      get(STORAGE_KEYS.imagePreviews) === null
        ? DEFAULT_SETTINGS.imagePreviews
        : get(STORAGE_KEYS.imagePreviews) === 'true',
  };
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(STORAGE_KEYS.host, s.host.trim());
  localStorage.setItem(STORAGE_KEYS.port, s.port.trim() || DEFAULT_SETTINGS.port);
  localStorage.setItem(STORAGE_KEYS.password, s.password.trim());
  localStorage.setItem(STORAGE_KEYS.fontSize, s.fontSize);
  localStorage.setItem(STORAGE_KEYS.defaultRole, s.defaultRole);
  localStorage.setItem(STORAGE_KEYS.nextPreview, String(s.nextPreview));
  localStorage.setItem(STORAGE_KEYS.imagePreviews, String(s.imagePreviews));
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
