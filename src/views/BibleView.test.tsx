import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { AppProvider } from '../state/AppContext';
import { STORAGE_KEYS } from '../lib/storage';
import { MockWebSocket } from '../test/mockSocket';
import { pushHistory } from './BibleView';

/** Land in the Bible view with the app configured and the socket authenticated. */
function renderBibleView() {
  localStorage.setItem(STORAGE_KEYS.host, '10.0.0.5');
  localStorage.setItem(STORAGE_KEYS.port, '5510');
  localStorage.setItem(STORAGE_KEYS.password, '6897');
  localStorage.setItem(STORAGE_KEYS.defaultRole, 'bible');
  const view = render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
  act(() => MockWebSocket.last().handshake());
  return view;
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
  it('sends start_scripture with the reference as typed', async () => {
    const user = userEvent.setup();
    renderBibleView();

    await user.type(screen.getByLabelText('Reference'), 'Jóh 3:16');
    await user.click(screen.getByRole('button', { name: 'SHOW ON SCREEN' }));

    // Faroese book names go through untouched — FreeShow parses the string.
    expect(MockWebSocket.last().find('API:start_scripture')).toEqual({
      reference: 'Jóh 3:16',
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
    await user.click(screen.getByRole('button', { name: /PREV/ }));

    const channels = MockWebSocket.last()
      .outbound()
      .map((m) => m.channel);
    expect(channels).toContain('API:scripture_next');
    expect(channels).toContain('API:scripture_previous');
  });

  it('reads the live verse back off the output', async () => {
    const user = userEvent.setup();
    renderBibleView();

    await user.type(screen.getByLabelText('Reference'), '1 Mósebók 1:3');
    await user.click(screen.getByRole('button', { name: 'SHOW ON SCREEN' }));

    // FreeShow inlines scripture into the output rather than pointing at a show.
    act(() =>
      MockWebSocket.last().channel('OUT_DATA', {
        slide: {
          id: 'temp',
          tempItems: [{ lines: [{ text: [{ value: "Gud segði: 'Verði ljós!'" }] }] }],
          customDynamicValues: { scripture_reference_full: '1 Mósebók 1:3' },
        },
      }),
    );

    expect(await screen.findByText(/Verði ljós/)).toBeInTheDocument();
  });

  it('does not steal the arrow keys while a reference is being typed', async () => {
    const user = userEvent.setup();
    renderBibleView();

    await user.click(screen.getByLabelText('Reference'));
    await user.keyboard('Jóh 3{ArrowLeft}{ArrowRight}');

    const channels = MockWebSocket.last()
      .outbound()
      .map((m) => m.channel);
    expect(channels).not.toContain('API:scripture_next');
    expect(channels).not.toContain('API:scripture_previous');
  });
});
