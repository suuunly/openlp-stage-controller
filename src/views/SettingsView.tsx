import { useState, type ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { runDiagnostics, type DiagnosticsReport } from '../lib/api';
import { isConfigured } from '../lib/storage';
import { Icon } from '../components/Icon';
import type { FontSize, ViewId } from '../lib/types';
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
  const { settings, updateSettings, commitSettings, navigate } = useApp();
  const [testing, setTesting] = useState(false);
  const [report, setReport] = useState<DiagnosticsReport | null>(null);

  const configured = isConfigured(settings);

  async function testConnection() {
    setTesting(true);
    setReport(null);
    try {
      setReport(
        await runDiagnostics({ host: settings.host, port: settings.port }),
      );
    } finally {
      setTesting(false);
    }
  }

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
        {/* ---- Connection ---- */}
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
                onChange={(e) => {
                  updateSettings({ host: e.target.value });
                  setReport(null);
                }}
              />
            </label>
            <label className={styles.fieldNarrow}>
              <span className={styles.fieldLabel}>API port</span>
              <input
                className={`${styles.input} ${styles.mono}`}
                type="text"
                inputMode="numeric"
                placeholder="5506"
                value={settings.port}
                onChange={(e) => {
                  updateSettings({ port: e.target.value });
                  setReport(null);
                }}
              />
            </label>
          </div>

          <p className={styles.hint}>
            FreeShow’s API server is <strong>off by default</strong>. Turn it on
            in FreeShow under <em>Settings → Connection</em>, and use the port it
            shows there (usually 5506).
          </p>

          <div className={styles.testRow}>
            <button
              type="button"
              className={styles.testBtn}
              onClick={testConnection}
              disabled={testing}
            >
              <Icon name="cable" size={22} />
              <span>Test Connection</span>
            </button>
            {testing && (
              <div className={`${styles.testResult} ${styles.testTesting}`}>
                <Icon name="progress_activity" size={20} spin />
                <span>Testing…</span>
              </div>
            )}
            {!testing && report && <TestSummary report={report} />}
          </div>

          {!testing && report && (
            <ul className={styles.checks}>
              {report.checks.map((check) => (
                <li key={check.action} className={styles.check}>
                  <Icon
                    name={check.ok ? 'check_circle' : 'wifi_off'}
                    size={16}
                    className={check.ok ? styles.checkOk : styles.checkFail}
                  />
                  <span className={styles.checkLabel}>{check.label}</span>
                  <span className={styles.checkDetail}>{check.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className={styles.divider} />

        {/* ---- Display ---- */}
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
          Go to Stage <Icon name="arrow_forward" size={22} />
        </button>
      </footer>
    </section>
  );
}

function TestSummary({ report }: { report: DiagnosticsReport }): ReactNode {
  if (!report.reachable) {
    return (
      <div className={`${styles.testResult} ${styles.testFail}`}>
        <Icon name="wifi_off" size={20} />
        <span>
          No answer — check the IP, and that FreeShow’s API server is switched on
        </span>
      </div>
    );
  }
  if (report.corsBlocked) {
    return (
      <div className={`${styles.testResult} ${styles.testTesting}`}>
        <Icon name="cast_connected" size={20} />
        <span>
          FreeShow answered, but this browser blocked the reply — controls will
          work, live read-back won’t
        </span>
      </div>
    );
  }
  return (
    <div className={`${styles.testResult} ${styles.testOk}`}>
      <Icon name="check_circle" size={20} />
      <span>Connected</span>
    </div>
  );
}
