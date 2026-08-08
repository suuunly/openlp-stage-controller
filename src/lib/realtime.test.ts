import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FreeShowLink } from './realtime';
import { resetTransportState } from './api';
import type { ConnectionStatus, OutputSnapshot } from './types';

function collect() {
  const statuses: ConnectionStatus[] = [];
  const snapshots: OutputSnapshot[] = [];
  const link = new FreeShowLink({
    onStatus: (s) => statuses.push(s),
    onSnapshot: (s) => snapshots.push(s),
  });
  return { statuses, snapshots, link };
}

function actionOf(url: string): string {
  return new URL(url).searchParams.get('action') ?? '';
}

beforeEach(() => {
  resetTransportState();
});

describe('FreeShowLink', () => {
  it('polls FreeShow and reports what is on screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const bodies: Record<string, string> = {
          get_output_slide_text: '"Amazing grace"',
          get_slide: JSON.stringify({
            showId: 's1',
            name: 'Amazing Grace',
            index: 1,
            total: 4,
          }),
          get_output: JSON.stringify({ enabled: true }),
        };
        return { ok: true, text: async () => bodies[actionOf(url)] ?? '' };
      }),
    );

    const { statuses, snapshots, link } = collect();
    link.start();
    await vi.waitFor(() => expect(snapshots.length).toBeGreaterThan(0));
    link.stop();

    expect(statuses[0]).toBe('connecting');
    expect(statuses).toContain('connected');
    expect(snapshots[0].text).toBe('Amazing grace');
    expect(snapshots[0].live?.slide).toBe(1);
    expect(snapshots[0].live?.total).toBe(4);
  });

  it('reports disconnected when nothing answers at all', async () => {
    // The default test fetch rejects everything, opaque probe included.
    const { statuses, link } = collect();
    link.start();
    await vi.waitFor(() => expect(statuses).toContain('disconnected'));
    link.stop();
  });

  it('reports send-only when FreeShow answers but the reply is blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options?: RequestInit) => {
        // A CORS rejection is indistinguishable from a dead host except that
        // an opaque request still resolves.
        if (options?.mode === 'no-cors') return { type: 'opaque' };
        throw new TypeError('Failed to fetch');
      }),
    );

    const { statuses, link } = collect();
    link.start();
    await vi.waitFor(() => expect(statuses).toContain('send-only'));
    link.stop();
  });

  it('stops polling once stopped', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const { statuses, link } = collect();
    link.start();
    await vi.waitFor(() => expect(statuses).toContain('disconnected'));
    link.stop();

    const callsAfterStop = fetchMock.mock.calls.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(fetchMock.mock.calls.length).toBe(callsAfterStop);
  });
});
