import type { ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { Icon, type IconName } from '../components/Icon';
import type { ViewId } from '../lib/types';
import styles from './HomeView.module.css';

interface Role {
  view: ViewId;
  icon: IconName;
  title: string;
  desc: string;
}

const ROLES: Role[] = [
  { view: 'songs', icon: 'mic', title: 'Song Navigator', desc: 'For singers — navigate lyrics' },
  { view: 'bible', icon: 'menu_book', title: 'Bible Verses', desc: 'For speakers — show scripture' },
  { view: 'images', icon: 'image', title: 'Images', desc: 'For speakers — show service slides' },
  { view: 'presentation', icon: 'slideshow', title: 'Presentation', desc: 'For speakers — slides & big nav' },
];

export function HomeView(): ReactNode {
  const { navigate, connection, settings } = useApp();
  const connected = connection === 'connected';

  return (
    <section className={styles.view}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.wordmark}>ELIM</span>
          <span className={styles.product}>Stage Controller</span>
        </div>
        <div
          className={`${styles.connChip} ${connected ? styles.connOk : styles.connDown}`}
          role="status"
          aria-live="polite"
        >
          <Icon name={connected ? 'wifi' : 'wifi_off'} size={20} />
          <span>
            {connected
              ? `Connected · ${settings.host}`
              : connection === 'connecting'
                ? 'Reconnecting…'
                : 'Disconnected'}
          </span>
        </div>
      </header>

      <p className={styles.chooseLabel}>Choose your role</p>

      <div className={styles.grid}>
        {ROLES.map((role) => (
          <button
            key={role.view}
            type="button"
            className={styles.roleCard}
            onClick={() => navigate(role.view)}
          >
            <span className={styles.roleIcon}>
              <Icon name={role.icon} size={40} />
            </span>
            <span className={styles.roleText}>
              <span className={styles.roleTitle}>{role.title}</span>
              <span className={styles.roleDesc}>{role.desc}</span>
            </span>
            <Icon name="arrow_forward" size={24} className={styles.roleArrow} />
          </button>
        ))}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.settingsBtn} onClick={() => navigate('settings')}>
          <Icon name="settings" size={24} />
          <span>Settings</span>
        </button>
      </div>
    </section>
  );
}
