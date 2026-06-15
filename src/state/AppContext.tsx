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
  fetchLiveItem,
  fetchServiceItems,
  nextItem,
  previousItem,
  setBlank,
  showItem,
  showSlide,
} from '../lib/api';
import { OpenLpSocket } from '../lib/websocket';
import {
  applyFontSize,
  isConfigured,
  loadSettings,
  saveSettings,
} from '../lib/storage';
import type {
  ConnectionStatus,
  LiveItem,
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
  serviceItems: ServiceItem[];
  liveItem: LiveItem | null;
  blanked: boolean;

  refresh: () => void;
  goNext: () => void;
  goPrev: () => void;
  activateItem: (id: string) => void;
  jumpToSlide: (id: string, slide: number) => void;
  toggleBlank: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }): ReactNode {
  const initial = useRef(loadSettings()).current;

  const [settings, setSettings] = useState<Settings>(initial);
  const [view, setView] = useState<ViewId>(
    isConfigured(initial) ? initial.defaultRole : 'settings',
  );
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected');
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([]);
  const [liveItem, setLiveItem] = useState<LiveItem | null>(null);
  const [blanked, setBlanked] = useState(false);

  // Apply the reading-font-size class on mount and whenever it changes.
  useEffect(() => {
    applyFontSize(settings.fontSize);
  }, [settings.fontSize]);

  const refresh = useCallback(() => {
    fetchServiceItems()
      .then(setServiceItems)
      .catch(() => {
        /* offline — banner already shows it */
      });
    fetchLiveItem()
      .then((li) => {
        if (li) setLiveItem(li);
      })
      .catch(() => {
        /* offline */
      });
  }, []);

  // One app-wide WebSocket, re-established when the host/port changes.
  const configured = isConfigured(settings);
  useEffect(() => {
    if (!configured) return;
    const socket = new OpenLpSocket({
      onStatus: (status) => {
        setConnection(status);
        if (status === 'connected') refresh();
      },
      onEvent: (event) => {
        switch (event.type) {
          case 'slidecontroller_changed':
            fetchLiveItem()
              .then((li) => setLiveItem(li))
              .catch(() => undefined);
            break;
          case 'service_changed':
            refresh();
            break;
          case 'blank_changed': {
            const display = event.data.display;
            setBlanked(display !== undefined && display !== 'show');
            break;
          }
        }
      },
    });
    socket.start();
    return () => socket.stop();
  }, [configured, settings.host, settings.port, refresh]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const commitSettings = useCallback(() => {
    setSettings((prev) => {
      saveSettings(prev);
      applyFontSize(prev.fontSize);
      return prev;
    });
  }, []);

  const navigate = useCallback((next: ViewId) => setView(next), []);

  const goNext = useCallback(() => {
    nextItem().catch(() => undefined);
  }, []);
  const goPrev = useCallback(() => {
    previousItem().catch(() => undefined);
  }, []);
  const activateItem = useCallback((id: string) => {
    showItem(id).catch(() => undefined);
  }, []);
  const jumpToSlide = useCallback((id: string, slide: number) => {
    showSlide(id, slide).catch(() => undefined);
  }, []);
  const toggleBlank = useCallback(() => {
    // Optimistic toggle (Android-Auto: instant feedback); WS confirms.
    setBlanked((prev) => {
      const next = !prev;
      setBlank(next ? 'blank' : 'show').catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      settings,
      updateSettings,
      commitSettings,
      view,
      navigate,
      connection,
      serviceItems,
      liveItem,
      blanked,
      refresh,
      goNext,
      goPrev,
      activateItem,
      jumpToSlide,
      toggleBlank,
    }),
    [
      settings,
      updateSettings,
      commitSettings,
      view,
      navigate,
      connection,
      serviceItems,
      liveItem,
      blanked,
      refresh,
      goNext,
      goPrev,
      activateItem,
      jumpToSlide,
      toggleBlank,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}
