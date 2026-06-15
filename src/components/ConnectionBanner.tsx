import type { ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { isConfigured } from '../lib/storage';
import { Icon } from './Icon';
import styles from './ConnectionBanner.module.css';

/**
 * Global "can't reach OpenLP" banner (TASK-03). Shown whenever the app is
 * configured but the WebSocket is not connected — except on the Settings
 * view, where the user is actively fixing the connection.
 */
export function ConnectionBanner(): ReactNode {
  const { connection, settings, view } = useApp();
  const show =
    isConfigured(settings) && connection !== 'connected' && view !== 'settings';

  if (!show) return null;

  const reconnecting = connection === 'connecting';

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <Icon name="wifi_off" size={18} />
      <span>
        {reconnecting
          ? 'Reconnecting to OpenLP…'
          : '⚠️ Cannot reach OpenLP — check WiFi'}
      </span>
    </div>
  );
}
