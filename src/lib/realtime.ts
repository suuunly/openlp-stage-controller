import {
  fetchActiveSlide,
  fetchOutput,
  fetchOutputSlideText,
  isSendOnly,
  probeReachable,
  readOutputActive,
} from './api';
import type { ConnectionStatus, OutputSnapshot } from './types';

/**
 * FreeShow's push transport is socket.io, which would be a runtime dependency
 * the offline-LAN bundle rule (CLAUDE.md §9) exists to avoid. This app almost
 * only *sends*; it needs to *observe* just when the tech operator intervenes at
 * the desk, so a 1s REST poll buys the same behaviour for nothing.
 *
 * The contract is deliberately the same as the old `OpenLpSocket`: `start()`,
 * `stop()`, and status/data callbacks, with the same 1→2→4…30s backoff — so
 * swapping in socket.io later is a change to this file alone.
 */

export const POLL_INTERVAL = 1000;
const MAX_BACKOFF = 30_000;

interface LinkCallbacks {
  onStatus: (status: ConnectionStatus) => void;
  onSnapshot: (snapshot: OutputSnapshot) => void;
  /** Output visibility, when FreeShow reports it. Null means "unknown". */
  onOutputActive?: (active: boolean | null) => void;
}

export class FreeShowLink {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private delay = POLL_INTERVAL;

  constructor(private readonly cb: LinkCallbacks) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.delay = POLL_INTERVAL;
    this.cb.onStatus('connecting');
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;

    const [text, live, output] = await Promise.allSettled([
      fetchOutputSlideText(),
      fetchActiveSlide(),
      fetchOutput(),
    ]);
    if (this.stopped) return;

    const anyOk = [text, live, output].some((r) => r.status === 'fulfilled');

    if (anyOk) {
      this.delay = POLL_INTERVAL;
      this.cb.onStatus(isSendOnly() ? 'send-only' : 'connected');
      this.cb.onSnapshot({
        text: text.status === 'fulfilled' ? text.value : '',
        live: live.status === 'fulfilled' ? live.value : null,
      });
      if (output.status === 'fulfilled') {
        this.cb.onOutputActive?.(readOutputActive(output.value));
      }
    } else {
      // Nothing readable. Distinguish "FreeShow is off / wrong IP" from
      // "FreeShow is up but the browser is hiding its answers" (CORS), because
      // the second case still lets every control button work.
      const reachable = await probeReachable();
      if (this.stopped) return;
      this.cb.onStatus(reachable ? 'send-only' : 'disconnected');
      this.delay = Math.min(Math.max(this.delay * 2, POLL_INTERVAL * 2), MAX_BACKOFF);
    }

    this.schedule();
  }

  private schedule(): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, this.delay);
  }
}
