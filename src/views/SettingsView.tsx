import type { ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { isConfigured } from '../lib/storage';
import { Icon } from '../components/Icon';
import type { ConnectionStatus, FontSize, ViewId } from '../lib/types';
import styles from './SettingsView.module.css';

const FONT_OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const ROLE_CYCLE: { value: ViewId; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'songs', label: 'Song Navigator' },
  { value: 'bible', label: 'Bible Verses' },
  { value: 'images', label: 'Images' },
  { value: 'presentation', label: 'Presentation' },
];

export function SettingsView(): ReactNode {
  const {
    settings,
    updateSettings,
    commitSettings,
    navigate,
    connection,
    projects,
    bibles,
  } = useApp();

  const configured = isConfigured(settings);

  function goToStage() {
    commitSettings();
    navigate(settings.defaultRole === 'settings' ? 'home' : settings.defaultRole);
  }

  function cycleRole() {
    const i = ROLE_CYCLE.findIndex((r) => r.value === settings.defaultRole);
    const next = ROLE_CYCLE[(i + 1) % ROLE_CYCLE.length];
    updateSettings({ defaultRole: next.value });
  }

  const roleLabel =
    ROLE_CYCLE.find((r) => r.value === settings.defaultRole)?.label ?? 'Home';

  return (
    <section className={styles.view}>
      <header className={styles.header}>
        {configured && (
          <button
            type="button"
            className={styles.back}
            onClick={() => navigate('home')}
            aria-label="Back to home"
          >
            <Icon name="arrow_back" size={26} />
          </button>
        )}
        <div className={styles.titleWrap}>
          <Icon name="settings" size={28} className={styles.titleIcon} />
          <h1 className={styles.title}>Settings</h1>
        </div>
      </header>

      <div className={styles.body}>
        <section>
          <h2 className={styles.sectionLabel}>FreeShow Connection</h2>

          <div className={styles.row}>
            <label className={styles.fieldWide}>
              <span className={styles.fieldLabel}>FreeShow computer IP</span>
              <input
                className={`${styles.input} ${styles.mono}`}
                type="text"
                inputMode="decimal"
                placeholder="192.168.1.50"
                autoComplete="off"
                value={settings.host}
                onChange={(e) => updateSettings({ host: e.target.value })}
              />
            </label>
            <label className={styles.fieldNarrow}>
              <span className={styles.fieldLabel}>Port</span>
              <input
                className={`${styles.input} ${styles.mono}`}
                type="text"
                inputMode="numeric"
                placeholder="5510"
                value={settings.port}
                onChange={(e) => updateSettings({ port: e.target.value })}
              />
            </label>
            <label className={styles.fieldNarrow}>
              <span className={styles.fieldLabel}>Code</span>
              <input
                className={`${styles.input} ${styles.mono}`}
                type="text"
                inputMode="numeric"
                placeholder="6897"
                autoComplete="off"
                value={settings.password}
                onChange={(e) => updateSettings({ password: e.target.value })}
              />
            </label>
          </div>

          <p className={styles.hint}>
            In FreeShow, open <em>Settings → Connection</em> and switch{' '}
            <strong>RemoteShow</strong> on. Click its row for the address and the{' '}
            <strong>4-digit code</strong> — the same ones the built-in remote uses.
          </p>

          <div className={styles.testRow}>
            <StatusLine
              connection={connection}
              projects={projects.length}
              bibles={bibles.length}
              configured={configured}
              hasCode={settings.password.trim().length > 0}
            />
          </div>
        </section>

        <div className={styles.divider} />

        <section>
          <h2 className={styles.sectionLabel}>Display</h2>

          <div className={styles.settingRow}>
            <div>
              <div className={styles.settingTitle}>Reading font size</div>
              <div className={styles.settingDesc}>For verse &amp; lyric text on this device</div>
            </div>
            <div className={styles.segmented} role="group" aria-label="Reading font size">
              {FONT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles.seg} ${settings.fontSize === opt.value ? styles.segOn : ''}`}
                  aria-pressed={settings.fontSize === opt.value}
                  onClick={() => updateSettings({ fontSize: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.settingRow}>
            <div>
              <div className={styles.settingTitle}>Default role on launch</div>
              <div className={styles.settingDesc}>Which view opens first</div>
            </div>
            <button type="button" className={styles.cycle} onClick={cycleRole}>
              <span>{roleLabel}</span>
              <Icon name="expand_more" size={18} className={styles.cycleIcon} />
            </button>
          </div>

          <div className={styles.settingRow}>
            <div>
              <div className={styles.settingTitle}>On-screen text preview</div>
              <div className={styles.settingDesc}>Show what’s on the screens under the live song</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.nextPreview}
              aria-label="On-screen text preview"
              className={`${styles.toggle} ${settings.nextPreview ? styles.toggleOn : ''}`}
              onClick={() => updateSettings({ nextPreview: !settings.nextPreview })}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <button type="button" className={styles.primary} onClick={goToStage}>
          {configured ? 'Go to Stage' : 'Connect'} <Icon name="arrow_forward" size={22} />
        </button>
      </footer>
    </section>
  );
}

/**
 * Live connection state. There is no "test" button any more — the socket is
 * either up or it isn't, and it says so continuously.
 */
function StatusLine({
  connection,
  projects,
  bibles,
  configured,
  hasCode,
}: {
  connection: ConnectionStatus;
  projects: number;
  bibles: number;
  configured: boolean;
  hasCode: boolean;
}): ReactNode {
  if (!configured) {
    return (
      <div className={`${styles.testResult} ${styles.testTesting}`}>
        <Icon name="cable" size={20} />
        <span>Enter the address and code, then tap Connect</span>
      </div>
    );
  }
  if (connection === 'connected') {
    return (
      <div className={`${styles.testResult} ${styles.testOk}`}>
        <Icon name="check_circle" size={20} />
        <span>
          Connected — {projects} project{projects === 1 ? '' : 's'}, {bibles} bible
          {bibles === 1 ? '' : 's'}
        </span>
      </div>
    );
  }
  if (connection === 'unauthorized') {
    // An empty box is a different problem from a wrong code, and saying
    // "FreeShow rejected it" when nothing was sent just sends people hunting.
    return (
      <div className={`${styles.testResult} ${styles.testFail}`}>
        <Icon name="wifi_off" size={20} />
        <span>
          {hasCode
            ? 'FreeShow rejected the code — check it in Settings → Connection'
            : 'Enter the 4-digit code — FreeShow shows it beside RemoteShow’s QR'}
        </span>
      </div>
    );
  }
  if (connection === 'connecting') {
    return (
      <div className={`${styles.testResult} ${styles.testTesting}`}>
        <Icon name="progress_activity" size={20} spin />
        <span>Connecting…</span>
      </div>
    );
  }
  return (
    <div className={`${styles.testResult} ${styles.testFail}`}>
      <Icon name="wifi_off" size={20} />
      <span>No answer — check the IP, and that RemoteShow is switched on</span>
    </div>
  );
}
