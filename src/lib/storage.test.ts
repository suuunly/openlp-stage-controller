import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  LEGACY_KEYS,
  STORAGE_KEYS,
  applyFontSize,
  isConfigured,
  loadSettings,
  saveSettings,
} from './storage';

describe('storage', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('defaults to RemoteShow’s port', () => {
    expect(DEFAULT_SETTINGS.port).toBe('5510');
  });

  it('round-trips settings through localStorage', () => {
    saveSettings({
      host: '10.0.0.5',
      port: '5510',
      password: '6897',
      fontSize: 'large',
      defaultRole: 'songs',
      nextPreview: false,
    });
    expect(localStorage.getItem(STORAGE_KEYS.host)).toBe('10.0.0.5');
    const loaded = loadSettings();
    expect(loaded.host).toBe('10.0.0.5');
    expect(loaded.fontSize).toBe('large');
    expect(loaded.defaultRole).toBe('songs');
    expect(loaded.nextPreview).toBe(false);
  });

  it('trims the host and falls back to the default port when blank', () => {
    saveSettings({ ...DEFAULT_SETTINGS, host: '  192.168.0.2  ', port: '' });
    const loaded = loadSettings();
    expect(loaded.host).toBe('192.168.0.2');
    expect(loaded.port).toBe('5510');
  });

  it('ignores invalid persisted enum values', () => {
    localStorage.setItem(STORAGE_KEYS.fontSize, 'gigantic');
    localStorage.setItem(STORAGE_KEYS.defaultRole, 'nope');
    const loaded = loadSettings();
    expect(loaded.fontSize).toBe('medium');
    expect(loaded.defaultRole).toBe('home');
  });

  it('reports configured only once a host is set', () => {
    expect(isConfigured(DEFAULT_SETTINGS)).toBe(false);
    expect(isConfigured({ ...DEFAULT_SETTINGS, host: '1.2.3.4' })).toBe(true);
  });

  it('applies the font-size class to the body', () => {
    applyFontSize('large');
    expect(document.body.classList.contains('font-large')).toBe(true);
    applyFontSize('small');
    expect(document.body.classList.contains('font-large')).toBe(false);
    expect(document.body.classList.contains('font-small')).toBe(true);
  });
});

describe('migration off the OpenLP build', () => {
  it('keeps the device preferences but drops the dead OpenLP host', () => {
    localStorage.setItem(LEGACY_KEYS.host, '192.168.1.99');
    localStorage.setItem(LEGACY_KEYS.port, '4316');
    localStorage.setItem(LEGACY_KEYS.username, 'admin');
    localStorage.setItem(LEGACY_KEYS.fontSize, 'large');
    localStorage.setItem(LEGACY_KEYS.defaultRole, 'songs');
    localStorage.setItem(LEGACY_KEYS.nextPreview, 'false');

    const loaded = loadSettings();

    expect(loaded.fontSize).toBe('large');
    expect(loaded.defaultRole).toBe('songs');
    expect(loaded.nextPreview).toBe(false);
    // An OpenLP host must not read as "configured" — the device has to be
    // pointed at FreeShow deliberately.
    expect(loaded.host).toBe('');
    expect(loaded.port).toBe('5510');
    expect(isConfigured(loaded)).toBe(false);
  });

  it('clears every legacy key, including the stored credentials', () => {
    for (const key of Object.values(LEGACY_KEYS)) {
      localStorage.setItem(key, 'x');
    }
    loadSettings();
    for (const key of Object.values(LEGACY_KEYS)) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });

  it('does not overwrite settings already saved against FreeShow', () => {
    saveSettings({ ...DEFAULT_SETTINGS, host: '10.0.0.5', fontSize: 'small' });
    localStorage.setItem(LEGACY_KEYS.fontSize, 'large');

    const loaded = loadSettings();
    expect(loaded.fontSize).toBe('small');
    expect(loaded.host).toBe('10.0.0.5');
  });
});
