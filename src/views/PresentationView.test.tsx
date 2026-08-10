import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
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
  localStorage.setItem(STORAGE_KEYS.password, '6897');
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
