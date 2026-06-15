import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { AppProvider } from '../state/AppContext';
import { STORAGE_KEYS } from '../lib/storage';

function renderApp() {
  return render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
}

describe('Settings → first run', () => {
  it('shows Settings first when the app is not configured', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('persists settings and navigates to Home on "Go to Stage"', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByPlaceholderText('192.168.1.50'), '10.0.0.5');
    await user.click(screen.getByRole('button', { name: /Go to Stage/i }));

    expect(localStorage.getItem(STORAGE_KEYS.host)).toBe('10.0.0.5');
    // Home view renders the ELIM wordmark.
    expect(screen.getByText('ELIM')).toBeInTheDocument();
  });

  it('shows a Connected result when Test Connection succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => '{}' } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByPlaceholderText('192.168.1.50'), '10.0.0.5');
    await user.click(screen.getByRole('button', { name: /Test Connection/i }));

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://10.0.0.5:4316/api/v2/core/state',
      expect.anything(),
    );
  });
});
