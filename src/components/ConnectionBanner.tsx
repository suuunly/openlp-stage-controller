import type { ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { isConfigured } from '../lib/storage';
import { Icon } from './Icon';
import styles from './ConnectionBanner.module.css';

/**
 * Global connection banner. Shown whenever the app is configured but not fully
 * connected — except on Settings, where the user is already fixing it.
 *
 * `send-only` is its own state on purpose: FreeShow is answering but the
 * browser won't let us read the replies (CORS). Every button still works; only
 * the on-screen read-back is gone. That is worth saying plainly rather than
 * calling it an outage.
 */
export function ConnectionBanner(): ReactNode {
  const { connection, settings, view } = useApp();
  const show =
    isConfigured(settings) && connection !== 'connected' && view !== 'settings';

  if (!show) return null;

  const sendOnly = connection === 'send-only';

  return (
    <div
      className={`${styles.banner} ${sendOnly ? styles.bannerWarn : ''}`}
      role="status"
      aria-live="polite"
    >
      <Icon name={sendOnly ? 'cast_connected' : 'wifi_off'} size={18} />
      <span>
        {sendOnly
          ? 'Controls work, but FreeShow’s replies are blocked — no live read-back'
          : connection === 'connecting'
            ? 'Connecting to FreeShow…'
            : '⚠️ Cannot reach FreeShow — check WiFi, or that its API server is on'}
      </span>
    </div>
  );
}
