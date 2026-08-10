import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { AppProvider } from '../state/AppContext';
import { STORAGE_KEYS } from '../lib/storage';
import { MockWebSocket } from '../test/mockSocket';

const line = (value: string) => ({ align: '', text: [{ value, style: '' }] });

/** One song and one presentation, as FreeShow reports them. */
const SHOWS = {
  song1: { name: 'Amazing Grace', category: 'song' },
  deck1: { name: 'Sermon', category: 'presentation' },
  deck2: { name: 'Notices', category: 'presentation' },
};

const PROJECTS = [
  {
    id: 'p1',
    name: 'Sunday',
    shows: [
      { id: 'song1', index: 0 },
      { id: 'deck1', index: 1 },
      // FreeShow lets the same show appear twice in a project.
      { id: 'deck1', index: 2 },
      { id: 'deck2', index: 3 },
    ],
  },
];

const showPayload = (name: string, text: string) => ({
  name,
  settings: { activeLayout: 'l1' },
  slides: { s1: { group: '', notes: '', items: [{ lines: [line(text)] }] } },
  layouts: { l1: { slides: [{ id: 's1' }] } },
});

function renderPresentation() {
  localStorage.setItem(STORAGE_KEYS.host, '10.0.0.5');
  localStorage.setItem(STORAGE_KEYS.port, '5510');
  localStorage.setItem(STORAGE_KEYS.password, '1234');
  localStorage.setItem(STORAGE_KEYS.defaultRole, 'presentation');
  render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
  act(() => {
    const socket = MockWebSocket.last();
    socket.handshake();
    socket.channel('SHOWS', SHOWS);
    socket.channel('PROJECTS', PROJECTS);
  });
  return MockWebSocket.last();
}

describe('Presentation view', () => {
  it('does not render a live song as though it were the presentation', () => {
    const socket = renderPresentation();

    // A song goes live. The Presentation view must not adopt its content.
    act(() => {
      socket.channel('OUT_DATA', { slide: { id: 'song1', layout: 'l1', index: 0 } });
      socket.channel('SHOW', showPayload('Amazing Grace', 'Amazing grace, how sweet'));
    });

    expect(screen.queryByText(/Amazing grace, how sweet/)).not.toBeInTheDocument();
    expect(screen.getByText(/Something else is on the screens/)).toBeInTheDocument();
  });

  it('renders the live slide once one of its own decks is live', () => {
    const socket = renderPresentation();

    act(() => {
      socket.channel('OUT_DATA', { slide: { id: 'deck1', layout: 'l1', index: 0 } });
      socket.channel('SHOW', showPayload('Sermon', 'Rooted and Built Up'));
    });

    expect(screen.getByText('Rooted and Built Up')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('lists a show once even when the project contains it twice', () => {
    renderPresentation();
    // Two distinct decks, so the picker renders — and 'Sermon' appears once
    // despite the project listing it twice.
    expect(screen.getAllByRole('button', { name: 'Sermon' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Notices' })).toHaveLength(1);
  });
});

describe('keyboard navigation', () => {
  it('does not advance a slide when Enter activates a focused control', async () => {
    const user = userEvent.setup();
    const socket = renderPresentation();
    act(() => {
      socket.channel('OUT_DATA', { slide: { id: 'deck1', layout: 'l1', index: 0 } });
      socket.channel('SHOW', showPayload('Sermon', 'Rooted and Built Up'));
    });

    // Browsers synthesise a click from Enter on a button. A global handler that
    // also treats Enter as "next" fires both — the deck goes live on slide 2.
    screen.getByRole('button', { name: 'Notices' }).focus();
    await user.keyboard('{Enter}');

    const sent = MockWebSocket.last().outbound().map((m) => m.channel);
    expect(sent).toContain('SHOW');
    expect(sent).not.toContain('API:next_slide');
  });

  it('still advances from a focused control on the pedal keys', async () => {
    const user = userEvent.setup();
    renderPresentation();

    // Arrow keys don't activate a button, so the pedal must keep working.
    screen.getByRole('button', { name: 'Notices' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(MockWebSocket.last().outbound().map((m) => m.channel)).toContain(
      'API:next_slide',
    );
  });
});

describe('SHOW reply correlation', () => {
  it('files a cached show’s reply under itself, not under whatever was live', async () => {
    const user = userEvent.setup();
    const socket = renderPresentation();

    // Deck 1 live and cached: 1 slide.
    act(() => {
      socket.channel('OUT_DATA', { slide: { id: 'deck1', layout: 'l1', index: 0 } });
      socket.channel('SHOW', showPayload('Sermon', 'Rooted and Built Up'));
    });
    expect(screen.getByText('Rooted and Built Up')).toBeInTheDocument();

    // Tap deck 2. selectShow() sends SHOW unconditionally, so a reply arrives
    // even though deck 2 is not cached — it must not land under deck 1.
    await user.click(screen.getByRole('button', { name: 'Notices' }));
    act(() => {
      socket.channel('SHOW', showPayload('Notices', 'Coffee after the service'));
      socket.channel('OUT_DATA', { slide: { id: 'deck2', layout: 'l1', index: 0 } });
    });
    expect(screen.getByText('Coffee after the service')).toBeInTheDocument();

    // Back to deck 1 — already cached, so nothing would re-fetch it if its
    // slides had been overwritten.
    await user.click(screen.getByRole('button', { name: 'Sermon' }));
    act(() => {
      socket.channel('SHOW', showPayload('Sermon', 'Rooted and Built Up'));
      socket.channel('OUT_DATA', { slide: { id: 'deck1', layout: 'l1', index: 0 } });
    });
    expect(screen.getByText('Rooted and Built Up')).toBeInTheDocument();
    expect(screen.queryByText('Coffee after the service')).not.toBeInTheDocument();
  });
});
