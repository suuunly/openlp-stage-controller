import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { AppProvider } from '../state/AppContext';
import { STORAGE_KEYS } from '../lib/storage';
import { MockWebSocket } from '../test/mockSocket';

const SHOWS = { song1: { name: 'Amazing Grace', category: 'song' } };
const PROJECTS = [
  {
    id: 'p1',
    name: 'Sunday',
    shows: [
      { id: 'song1', index: 0 },
      { id: '/Users/j/Pictures/Ducky 2.png', type: 'image', name: 'Ducky 2', index: 1 },
    ],
  },
];

function renderImages() {
  localStorage.setItem(STORAGE_KEYS.host, '10.0.0.5');
  localStorage.setItem(STORAGE_KEYS.port, '5510');
  localStorage.setItem(STORAGE_KEYS.password, '1234');
  localStorage.setItem(STORAGE_KEYS.defaultRole, 'images');
  // Previews off: the fetch pulls full-resolution images, which a jsdom canvas
  // can't decode anyway.
  localStorage.setItem(STORAGE_KEYS.imagePreviews, 'false');
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

describe('Images view', () => {
  it('shows an image with play_media, not as a show', async () => {
    const user = userEvent.setup();
    const socket = renderImages();

    await user.click(screen.getByRole('button', { name: /Ducky 2/ }));

    // id_select_project is for shows; FreeShow answers "no show active".
    const sent = socket.outbound();
    expect(sent.map((m) => m.channel)).not.toContain('API:id_select_project');
    expect(sent.find((m) => m.channel === 'API:play_media')?.data).toEqual({
      path: '/Users/j/Pictures/Ducky 2.png',
      data: { type: 'image' },
    });
  });

  it('clears the slide layer first, so lyrics don’t sit over the photo', async () => {
    const user = userEvent.setup();
    const socket = renderImages();

    await user.click(screen.getByRole('button', { name: /Ducky 2/ }));

    const channels = socket.outbound().map((m) => m.channel);
    expect(channels).toContain('API:clear_slide');
    // Order matters: the image is a background, so the text has to go first.
    expect(channels.indexOf('API:clear_slide')).toBeLessThan(
      channels.indexOf('API:play_media'),
    );
  });

  it('only lists images, not songs', () => {
    renderImages();
    expect(screen.getByRole('button', { name: /Ducky 2/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Amazing Grace/ })).not.toBeInTheDocument();
  });
});
