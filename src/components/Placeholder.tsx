import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import { Icon, type IconName } from './Icon';
import styles from './Placeholder.module.css';

interface PlaceholderProps {
  icon: IconName;
  title: string;
  phase: string;
}

/** Stub for views not yet built — keeps Home navigation working in earlier phases. */
export function Placeholder({ icon, title, phase }: PlaceholderProps): ReactNode {
  return (
    <section className={styles.view}>
      <AppHeader icon={icon} title={title} />
      <div className={styles.body}>
        <span className={styles.icon}>
          <Icon name={icon} size={44} />
        </span>
        <p className={styles.text}>Coming in {phase}.</p>
      </div>
    </section>
  );
}
