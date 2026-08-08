import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { AppProvider } from '../state/AppContext';
import { STORAGE_KEYS } from '../lib/storage';
import { pushHistory } from './BibleView';

/** Land straight in the Bible view with the app already configured. */
function renderBibleView() {
  localStorage.setItem(STORAGE_KEYS.host, '10.0.0.5');
  localStorage.setItem(STORAGE_KEYS.port, '5506');
  localStorage.setItem(STORAGE_KEYS.defaultRole, 'bible');
  return render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
}

/** Actions sent to FreeShow, in order, with their decoded data. */
function sentActions(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([url]) => {
    const params = new URL(url as string).searchParams;
    return {
      action: params.get('action'),
      data: JSON.parse(params.get('data') ?? 'null'),
    };
  });
}

describe('pushHistory', () => {
  it('keeps the most recent first, de-duplicated, capped at five', () => {
    let history: string[] = [];
    for (const ref of ['Jóh 3:16', 'Sálm 23', 'Róm 8:28', 'Jóh 1:1', 'Hebr 11:1']) {
      history = pushHistory(history, ref);
    }
    expect(history).toHaveLength(5);
    expect(history[0]).toBe('Hebr 11:1');

    history = pushHistory(history, 'Sálm 23');
    expect(history).toHaveLength(5);
    expect(history[0]).toBe('Sálm 23');
    expect(history.filter((h) => h === 'Sálm 23')).toHaveLength(1);

    // Re-showing 'Sálm 23' moved it to the front, so the oldest is now the
    // first reference entered — that is what falls off the end.
    history = pushHistory(history, 'Opinb 21:4');
    expect(history).toHaveLength(5);
    expect(history).not.toContain('Jóh 3:16');
  });
});

describe('Bible view', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
  });

  it('sends start_scripture with the reference as typed', async () => {
    const user = userEvent.setup();
    renderBibleView();

    await user.type(screen.getByLabelText('Reference'), 'Jóh 3:16');
    await user.click(screen.getByRole('button', { name: 'SHOW ON SCREEN' }));

    await vi.waitFor(() => {
      expect(sentActions(fetchMock)).toContainEqual({
        action: 'start_scripture',
        // Faroese book names go through untouched — FreeShow parses the string.
        data: { reference: 'Jóh 3:16' },
      });
    });
  });

  it('adds the shown reference to the history strip', async () => {
    const user = userEvent.setup();
    renderBibleView();

    await user.type(screen.getByLabelText('Reference'), 'Sálm 23');
    await user.click(screen.getByRole('button', { name: 'SHOW ON SCREEN' }));

    expect(await screen.findByRole('button', { name: 'Sálm 23' })).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem('verse_history') ?? '[]')).toEqual([
      'Sálm 23',
    ]);
  });

  it('steps verses with FreeShow’s own scripture navigation', async () => {
    const user = userEvent.setup();
    renderBibleView();

    await user.click(screen.getByRole('button', { name: /NEXT/ }));
    await vi.waitFor(() => {
      expect(sentActions(fetchMock).some((c) => c.action === 'scripture_next')).toBe(true);
    });

    await user.click(screen.getByRole('button', { name: /PREV/ }));
    await vi.waitFor(() => {
      expect(sentActions(fetchMock).some((c) => c.action === 'scripture_previous')).toBe(
        true,
      );
    });
  });

  it('does not steal the arrow keys while a reference is being typed', async () => {
    const user = userEvent.setup();
    renderBibleView();

    const input = screen.getByLabelText('Reference');
    await user.click(input);
    await user.keyboard('Jóh 3{ArrowLeft}{ArrowRight}');

    expect(sentActions(fetchMock).some((c) => c.action === 'scripture_next')).toBe(false);
    expect(sentActions(fetchMock).some((c) => c.action === 'scripture_previous')).toBe(
      false,
    );
  });
});
