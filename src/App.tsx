import type { ReactNode } from 'react';
import { useApp } from './state/AppContext';
import { ConnectionBanner } from './components/ConnectionBanner';
import { SettingsView } from './views/SettingsView';
import { HomeView } from './views/HomeView';
import { SongView } from './views/SongView';
import { BibleView } from './views/BibleView';
import { ImagesView } from './views/ImagesView';
import { PresentationView } from './views/PresentationView';

/**
 * App shell. Renders the single active view (the React equivalent of the
 * spec's "one .view is .active") plus the global connection banner.
 */
export function App(): ReactNode {
  const { view } = useApp();

  return (
    <>
      <ConnectionBanner />
      {view === 'settings' && <SettingsView />}
      {view === 'home' && <HomeView />}
      {view === 'songs' && <SongView />}
      {view === 'bible' && <BibleView />}
      {view === 'images' && <ImagesView />}
      {view === 'presentation' && <PresentationView />}
    </>
  );
}
