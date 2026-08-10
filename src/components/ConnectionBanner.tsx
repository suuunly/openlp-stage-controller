import type { ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { isConfigured } from '../lib/storage';
import { Icon } from './Icon';
import styles from './ConnectionBanner.module.css';

/**
 * Global connection banner. Shown whenever the app is configured but not fully
 * connected — except on Settings, where the user is already fixing it.
 *
 * `unauthorized` is called out separately: FreeShow answered and rejected the
 * code, which needs a different fix from "can't reach it".
 */
export function ConnectionBanner(): ReactNode {
  const { connection, settings, view } = useApp();
  const show =
    isConfigured(settings) && connection !== 'connected' && view !== 'settings';

  if (!show) return null;

  const rejected = connection === 'unauthorized';

  return (
    <div
      className={`${styles.banner} ${rejected ? '' : styles.bannerWarn}`}
      role="status"
      aria-live="polite"
    >
      <Icon name={connection === 'connecting' ? 'cast_connected' : 'wifi_off'} size={18} />
      <span>
        {rejected
          ? '⚠️ FreeShow rejected the code — check it in Settings'
          : connection === 'connecting'
            ? 'Connecting to FreeShow…'
            : '⚠️ Cannot reach FreeShow — check WiFi, or that RemoteShow is on'}
      </span>
    </div>
  );
}
