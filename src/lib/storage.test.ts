import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
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

  it('round-trips settings through localStorage', () => {
    saveSettings({
      host: '10.0.0.5',
      port: '4316',
      username: 'admin',
      password: 'pw',
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

  it('trims the host and falls back to default port when blank', () => {
    saveSettings({ ...DEFAULT_SETTINGS, host: '  192.168.0.2  ', port: '' });
    const loaded = loadSettings();
    expect(loaded.host).toBe('192.168.0.2');
    expect(loaded.port).toBe('4316');
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
