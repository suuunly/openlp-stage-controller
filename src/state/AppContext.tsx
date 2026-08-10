import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  activateProjectItem,
  fetchProject,
  fetchProjects,
  nextSlide,
  previousSlide,
  resetTransportState,
  scriptureNext,
  scripturePrevious,
  selectSlideIndex,
  startScripture,
  toggleOutput,
} from '../lib/api';
import { FreeShowLink } from '../lib/realtime';
import {
  DEFAULT_SETTINGS,
  applyFontSize,
  isConfigured,
  loadSettings,
  saveSettings,
} from '../lib/storage';
import type {
  ConnectionStatus,
  LiveItem,
  Project,
  ServiceItem,
  Settings,
  ViewId,
} from '../lib/types';

interface AppContextValue {
  settings: Settings;
  /** Live, in-memory settings edits (not yet persisted). */
  updateSettings: (patch: Partial<Settings>) => void;
  /** Persist current settings and apply side effects (font size). */
  commitSettings: () => void;

  view: ViewId;
  navigate: (view: ViewId) => void;

  connection: ConnectionStatus;
  /** Every FreeShow project on the machine. */
  projects: Project[];
  /** The project being used as "the service" — its items feed every view. */
  activeProject: Project | null;
  selectProject: (id: string) => void;
  /** Items of the active project. */
  serviceItems: ServiceItem[];
  liveItem: LiveItem | null;
  /** Text currently on the screens (`get_output_slide_text`). */
  outputText: string;
  blanked: boolean;

  refresh: () => void;
  goNext: () => void;
  goPrev: () => void;
  activateItem: (id: string) => void;
  jumpToSlide: (showId: string | null, slide: number) => void;
  toggleBlank: () => void;
  showScripture: (reference: string) => void;
  verseNext: () => void;
  versePrev: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }): ReactNode {
  const initial = useRef(loadSettings()).current;

  const [settings, setSettings] = useState<Settings>(initial);
  /**
   * The *committed* connection. `settings.host` changes on every keystroke in
   * the Settings field, and keying the polling link off that tore the
   * connection down and rebuilt it per character. The link follows this
   * instead, so it only moves when the user actually saves.
   */
  const [conn, setConn] = useState({ host: initial.host, port: initial.port });
  const [view, setView] = useState<ViewId>(
    isConfigured(initial) ? initial.defaultRole : 'settings',
  );
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [liveItem, setLiveItem] = useState<LiveItem | null>(null);
  const [outputText, setOutputText] = useState('');
  const [blanked, setBlanked] = useState(false);

  // Apply the reading-font-size class on mount and whenever it changes.
  useEffect(() => {
    applyFontSize(settings.fontSize);
  }, [settings.fontSize]);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;
  const serviceItems = activeProject?.items ?? [];

  // Mirrored in a ref so `refresh` can read the current selection without
  // taking it as a dependency (it is called from the polling link's callbacks).
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeProjectId;
  }, [activeProjectId]);

  /**
   * `get_projects` may hand back projects without their items, so the chosen
   * project is topped up with `get_project` when it comes back empty.
   */
  const refresh = useCallback(() => {
    void (async () => {
      let list: Project[];
      try {
        list = await fetchProjects();
      } catch {
        return; // offline — the banner already says so
      }
      setProjects(list);

      const prev = activeIdRef.current;
      const chosen =
        (prev ? list.find((p) => p.id === prev) : undefined) ??
        list.find((p) => p.active) ??
        list[0];
      activeIdRef.current = chosen?.id ?? null;
      setActiveProjectId(chosen?.id ?? null);

      if (chosen && chosen.items.length === 0) {
        try {
          const full = await fetchProject(chosen.id);
          if (full) {
            setProjects((ps) => ps.map((p) => (p.id === full.id ? full : p)));
          }
        } catch {
          /* leave the project item-less; the view shows its empty state */
        }
      }
    })();
  }, []);

  // One app-wide connection, re-established when the saved host/port changes.
  const configured = conn.host.trim().length > 0;
  useEffect(() => {
    if (!configured) return;
    resetTransportState();
    let alive = true;
    let previous: ConnectionStatus = 'disconnected';
    const isUp = (s: ConnectionStatus) => s === 'connected' || s === 'send-only';

    const link = new FreeShowLink({
      onStatus: (status) => {
        if (!alive) return;
        // Reload the service whenever we come back from a bad state.
        if (isUp(status) && !isUp(previous)) refresh();
        previous = status;
        setConnection(status);
      },
      onSnapshot: ({ text, live }) => {
        if (!alive) return;
        if (text !== undefined) setOutputText(text);
        // `null` is a real answer — nothing is live — so it must clear, or a
        // finished song stays highlighted as live forever.
        if (live !== undefined) setLiveItem(live);
      },
      onOutputActive: (active) => {
        if (alive && active !== null) setBlanked(!active);
      },
    });
    link.start();
    return () => {
      alive = false;
      link.stop();
      setConnection('disconnected');
    };
  }, [configured, conn.host, conn.port, refresh]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  // Mirrored so `commitSettings` can read the current draft without being
  // rebuilt on every edit.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const commitSettings = useCallback(() => {
    const draft = settingsRef.current;
    saveSettings(draft);
    applyFontSize(draft.fontSize);
    setConn({
      host: draft.host.trim(),
      port: draft.port.trim() || DEFAULT_SETTINGS.port,
    });
  }, []);

  const navigate = useCallback((next: ViewId) => setView(next), []);

  const selectProject = useCallback((id: string) => {
    activeIdRef.current = id;
    setActiveProjectId(id);
    void (async () => {
      try {
        const full = await fetchProject(id);
        if (full) setProjects((ps) => ps.map((p) => (p.id === id ? full : p)));
      } catch {
        /* keep whatever we already had */
      }
    })();
  }, []);

  const goNext = useCallback(() => {
    nextSlide().catch(() => undefined);
  }, []);
  const goPrev = useCallback(() => {
    previousSlide().catch(() => undefined);
  }, []);
  const activateItem = useCallback((id: string) => {
    activateProjectItem(id).catch(() => undefined);
  }, []);
  const jumpToSlide = useCallback((showId: string | null, slide: number) => {
    selectSlideIndex(slide, showId ?? undefined).catch(() => undefined);
  }, []);
  const toggleBlank = useCallback(() => {
    // Optimistic toggle (Android-Auto: instant feedback); the poll confirms.
    setBlanked((prev) => {
      toggleOutput().catch(() => undefined);
      return !prev;
    });
  }, []);
  const showScripture = useCallback((reference: string) => {
    startScripture(reference).catch(() => undefined);
  }, []);
  const verseNext = useCallback(() => {
    scriptureNext().catch(() => undefined);
  }, []);
  const versePrev = useCallback(() => {
    scripturePrevious().catch(() => undefined);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      settings,
      updateSettings,
      commitSettings,
      view,
      navigate,
      connection,
      projects,
      activeProject,
      selectProject,
      serviceItems,
      liveItem,
      outputText,
      blanked,
      refresh,
      goNext,
      goPrev,
      activateItem,
      jumpToSlide,
      toggleBlank,
      showScripture,
      verseNext,
      versePrev,
    }),
    [
      settings,
      updateSettings,
      commitSettings,
      view,
      navigate,
      connection,
      projects,
      activeProject,
      selectProject,
      serviceItems,
      liveItem,
      outputText,
      blanked,
      refresh,
      goNext,
      goPrev,
      activateItem,
      jumpToSlide,
      toggleBlank,
      showScripture,
      verseNext,
      versePrev,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}
