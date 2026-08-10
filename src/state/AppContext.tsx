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
  buildLiveItem,
  buildScriptureItem,
  connect,
  disconnect,
  flattenShow,
  nextSlide,
  normalizeBible,
  normalizeBibles,
  normalizeOutput,
  normalizeProjects,
  normalizeShowIndex,
  previousSlide,
  requestScripture,
  requestShow,
  scriptureNext,
  scripturePrevious,
  selectShow,
  selectSlide,
  startScripture,
  type OutputPosition,
  type ShowIndex,
} from '../lib/api';
import {
  DEFAULT_SETTINGS,
  applyFontSize,
  isConfigured,
  loadSettings,
  saveSettings,
} from '../lib/storage';
import type {
  Bible,
  BibleInfo,
  ConnectionStatus,
  LiveItem,
  Project,
  ServiceItem,
  Settings,
  ShowDetail,
  ViewId,
} from '../lib/types';

interface AppContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  commitSettings: () => void;

  view: ViewId;
  navigate: (view: ViewId) => void;

  connection: ConnectionStatus;
  projects: Project[];
  activeProject: Project | null;
  selectProject: (id: string) => void;
  serviceItems: ServiceItem[];
  /** Fully-resolved shows, keyed by id — slides, groups and notes. */
  shows: Map<string, ShowDetail>;
  liveItem: LiveItem | null;
  /** Text currently on the screens. */
  outputText: string;

  /** Installed bibles, and the one currently loaded. */
  bibles: BibleInfo[];
  bible: Bible | null;
  loadBible: (id: string) => void;

  goNext: () => void;
  goPrev: () => void;
  /** Put a show on screen (the SHOW + index_select_slide two-step). */
  activateItem: (id: string) => void;
  jumpToSlide: (showId: string | null, slide: number) => void;
  /** `reference` is FreeShow's numeric `book.chapter.verse` form. */
  showScripture: (reference: string, bibleId?: string) => void;
  verseNext: () => void;
  versePrev: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }): ReactNode {
  const initial = useRef(loadSettings()).current;

  const [settings, setSettings] = useState<Settings>(initial);
  /**
   * The *committed* connection. `settings` changes on every keystroke in the
   * Settings fields; keying the socket off that would tear it down and rebuild
   * it per character.
   */
  const [conn, setConn] = useState({
    host: initial.host,
    port: initial.port,
    password: initial.password,
  });
  const [view, setView] = useState<ViewId>(
    isConfigured(initial) ? initial.defaultRole : 'settings',
  );
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [shows, setShows] = useState<Map<string, ShowDetail>>(new Map());
  const [position, setPosition] = useState<OutputPosition | null>(null);
  const [scriptureItem, setScriptureItem] = useState<LiveItem | null>(null);
  const [bibles, setBibles] = useState<BibleInfo[]>([]);
  const [bible, setBible] = useState<Bible | null>(null);

  useEffect(() => {
    applyFontSize(settings.fontSize);
  }, [settings.fontSize]);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;
  const serviceItems = activeProject?.items ?? [];

  /**
   * Scripture wins when it is live, because FreeShow inlines it into the
   * output rather than pointing at a show.
   */
  const liveItem = useMemo<LiveItem | null>(() => {
    if (scriptureItem) return scriptureItem;
    if (!position) return null;
    return buildLiveItem(position, shows.get(position.showId ?? '') ?? null);
  }, [scriptureItem, position, shows]);

  const outputText = liveItem?.text ?? '';

  // RemoteShow pushes PROJECTS and SHOWS independently and in either order, so
  // the raw projects are kept until the show index needed to name them arrives.
  const rawProjects = useRef<unknown>(null);
  const showIndex = useRef<ShowIndex>(new Map());
  const showsRef = useRef(shows);
  showsRef.current = shows;
  /**
   * Which show we last asked for. The `SHOW` reply does not echo the id it is
   * answering, so this is the only way to file it correctly — and it must be a
   * ref, because the reply can arrive before React re-renders.
   */
  const pendingShow = useRef<string | null>(null);

  const rebuildProjects = useCallback(() => {
    if (rawProjects.current == null) return;
    setProjects(normalizeProjects(rawProjects.current, showIndex.current));
  }, []);

  const handleMessage = useCallback(
    (channel: string, data: unknown) => {
      switch (channel) {
        case 'SHOWS':
          showIndex.current = normalizeShowIndex(data);
          rebuildProjects();
          break;

        case 'PROJECTS':
          rawProjects.current = data;
          rebuildProjects();
          break;

        // Only OUT_DATA. `OUT` carries the same idea in a different shape —
        // its `slide` is the index, not the slide object — so reading both
        // would overwrite a good position with an empty one.
        case 'OUT_DATA': {
          const scripture = buildScriptureItem(data);
          if (scripture) {
            setScriptureItem(scripture);
            setPosition(null);
            break;
          }
          setScriptureItem(null);
          const next = normalizeOutput(data);
          setPosition(next);
          // Pull the show definition once; it carries slides, groups and notes.
          if (next.showId && !showsRef.current.has(next.showId)) {
            pendingShow.current = next.showId;
            requestShow(next.showId);
          }
          break;
        }

        case 'SHOW': {
          const id = pendingShow.current ?? position?.showId ?? '';
          if (!id) break;
          pendingShow.current = null;
          const detail = flattenShow(data, id);
          if (detail) setShows((prev) => new Map(prev).set(id, detail));
          break;
        }

        case 'SCRIPTURE':
          setBibles(normalizeBibles(data));
          break;

        case 'GET_SCRIPTURE': {
          const loaded = normalizeBible(data);
          if (loaded) setBible(loaded);
          break;
        }
      }
    },
    [position?.showId, rebuildProjects],
  );

  const handleMessageRef = useRef(handleMessage);
  handleMessageRef.current = handleMessage;

  // One app-wide socket, rebuilt only when the saved connection changes.
  const configured = conn.host.trim().length > 0;
  useEffect(() => {
    if (!configured) return;
    let alive = true;
    connect(conn, {
      onStatus: (status) => {
        if (alive) setConnection(status);
      },
      onMessage: (channel, data) => {
        if (alive) handleMessageRef.current(channel, data);
      },
    });
    return () => {
      alive = false;
      disconnect();
      setConnection('disconnected');
    };
  }, [configured, conn]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const commitSettings = useCallback(() => {
    const draft = settingsRef.current;
    saveSettings(draft);
    applyFontSize(draft.fontSize);
    setConn({
      host: draft.host.trim(),
      port: draft.port.trim() || DEFAULT_SETTINGS.port,
      password: draft.password.trim(),
    });
  }, []);

  const navigate = useCallback((next: ViewId) => setView(next), []);
  const selectProject = useCallback((id: string) => setActiveProjectId(id), []);

  const goNext = useCallback(() => nextSlide(), []);
  const goPrev = useCallback(() => previousSlide(), []);
  const activateItem = useCallback((id: string) => {
    if (!showsRef.current.has(id)) pendingShow.current = id;
    selectShow(id);
  }, []);
  const jumpToSlide = useCallback((showId: string | null, slide: number) => {
    if (showId) selectSlide(showId, slide);
  }, []);
  const showScripture = useCallback((reference: string, bibleId?: string) => {
    startScripture(reference, bibleId);
  }, []);
  const verseNext = useCallback(() => scriptureNext(), []);
  const versePrev = useCallback(() => scripturePrevious(), []);
  const loadBible = useCallback((id: string) => requestScripture(id), []);

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
      shows,
      liveItem,
      outputText,
      bibles,
      bible,
      loadBible,
      goNext,
      goPrev,
      activateItem,
      jumpToSlide,
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
      shows,
      liveItem,
      outputText,
      bibles,
      bible,
      loadBible,
      goNext,
      goPrev,
      activateItem,
      jumpToSlide,
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
