import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { AppProvider } from '../state/AppContext';
import { STORAGE_KEYS } from '../lib/storage';
import { MockWebSocket } from '../test/mockSocket';

function renderApp() {
  return render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
}

async function configure(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('192.168.1.50'), '10.0.0.5');
  await user.type(screen.getByPlaceholderText('6897'), '1234');
  await user.click(screen.getByRole('button', { name: /Connect|Go to Stage/i }));
}

describe('Settings → first run', () => {
  it('shows Settings first when the app is not configured', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('persists the connection and lands on Home', async () => {
    const user = userEvent.setup();
    renderApp();
    await configure(user);

    expect(localStorage.getItem(STORAGE_KEYS.host)).toBe('10.0.0.5');
    expect(localStorage.getItem(STORAGE_KEYS.port)).toBe('5510');
    expect(localStorage.getItem(STORAGE_KEYS.password)).toBe('1234');
    expect(screen.getByText('ELIM')).toBeInTheDocument();
  });

  it('opens RemoteShow’s socket, not the documented API port', async () => {
    const user = userEvent.setup();
    renderApp();
    await configure(user);

    // The REST API on 5506 sends no CORS headers and cannot be used from a
    // browser at all; 5505 cannot switch shows. 5510 is the only viable one.
    expect(MockWebSocket.last().url).toBe(
      'ws://10.0.0.5:5510/socket.io/?EIO=4&transport=websocket',
    );
  });

  it('authenticates with the code from FreeShow', async () => {
    const user = userEvent.setup();
    renderApp();
    await configure(user);

    const socket = MockWebSocket.last();
    act(() => {
      socket.open();
      socket.namespaceConnect();
      socket.channel('PASSWORD', { password: true });
    });

    expect(socket.find('ACCESS')).toBe('1234');
  });

  it('says the code was rejected rather than blaming the network', async () => {
    const user = userEvent.setup();
    renderApp();
    await configure(user);

    const socket = MockWebSocket.last();
    act(() => {
      socket.open();
      socket.namespaceConnect();
      socket.channel('PASSWORD', { password: true });
      socket.channel('ERROR', 'wrongPass');
    });

    await user.click(screen.getByRole('button', { name: /Settings/i }));
    expect(screen.getByText(/rejected the code/i)).toBeInTheDocument();
  });

  it('reports what it found once connected', async () => {
    const user = userEvent.setup();
    renderApp();
    await configure(user);

    const socket = MockWebSocket.last();
    act(() => {
      socket.handshake();
      socket.channel('SHOWS', { s1: { name: 'Amazing Grace', category: 'song' } });
      socket.channel('PROJECTS', [
        { id: 'p1', name: 'Sunday', shows: [{ id: 's1', index: 0 }] },
      ]);
      socket.channel('SCRIPTURE', { victor: { name: 'Victor', api: false } });
    });

    await user.click(screen.getByRole('button', { name: /Settings/i }));
    expect(screen.getByText(/1 project, 1 bible/i)).toBeInTheDocument();
  });
});
