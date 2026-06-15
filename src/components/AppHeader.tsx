import type { ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { Icon, type IconName } from './Icon';
import styles from './AppHeader.module.css';

interface AppHeaderProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  /** Optional content rendered on the right (status pills, toggles…). */
  right?: ReactNode;
}

/** Standard view header with a back-to-home button (design spec pattern). */
export function AppHeader({ icon, title, subtitle, right }: AppHeaderProps): ReactNode {
  const { navigate } = useApp();
  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.back}
        onClick={() => navigate('home')}
        aria-label="Back to home"
      >
        <Icon name="arrow_back" size={26} />
      </button>
      <div className={styles.titleWrap}>
        <Icon name={icon} size={28} className={styles.titleIcon} />
        <div className={styles.titleText}>
          <div className={styles.title}>{title}</div>
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        </div>
      </div>
      {right && <div className={styles.right}>{right}</div>}
    </header>
  );
}
