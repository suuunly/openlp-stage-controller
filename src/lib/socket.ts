import type { ConnectionStatus } from './types';

/**
 * FreeShow **RemoteShow** client (port 5510), spoken over a raw `WebSocket`.
 *
 * ## Why this protocol and not the documented API
 *
 * Verified live on 2026-08-10 — see the Usable fragment *FreeShow RemoteShow
 * protocol (port 5510) — VERIFIED LIVE*:
 *
 * - The REST API on 5506 **cannot be used from a browser**. The documented
 *   `GET /?action=…` form 404s; it is POST-and-JSON only and sends no
 *   `Access-Control-*` headers at all, so the preflight fails. `mode:'no-cors'`
 *   doesn't help — it downgrades the body to `text/plain`, which is ignored.
 * - The socket API on 5505 works, but **cannot change which show is live**, has
 *   no scripture browsing, no thumbnails, and never pushes state.
 * - RemoteShow does all of it, and **pushes state changes**, so there is no
 *   polling loop at all.
 *
 * WebSockets are exempt from CORS, and socket.io's wire format is small enough
 * to speak directly — so this keeps the offline-LAN bundle dependency-free
 * (CLAUDE.md §9).
 *
 * ## Wire format
 *
 * ```
 *   <- 0{"sid":…}                                  engine.io open
 *   -> 40                                          connect default namespace
 *   <- 40{"sid":…}                                 ready — sid is our client id
 *   -> 42["REMOTE",{id,channel:"PASSWORD"}]        <- {dictionary, password:true}
 *   -> 42["REMOTE",{id,channel:"ACCESS",data:"<4-digit code>"}]
 *   <- 42["REMOTE",{channel:"ACCESS",data:null}]   authenticated
 *   <- …PROJECTS, SHOWS, SCRIPTURE, CATEGORIES, OUT, OUT_DATA, SHOW…  (pushed)
 *   <- 2  -> 3                                     ping / pong
 * ```
 *
 * ⚠️ This is a **private, undocumented protocol** and may change between
 * FreeShow releases. It is the only way to build a real remote; the trade-off
 * is recorded in CLAUDE.md §10.7.
 */

const PING = '2';
const PONG = '3';
const MESSAGE = '4';
const NS_CONNECT = '0';
const EVENT = '2';

const CHANNEL = 'REMOTE';
export const DEFAULT_TIMEOUT = 6000;

/** Channels RemoteShow pushes without being asked. */
export type PushChannel =
  | 'PROJECTS'
  | 'PROJECT'
  | 'SHOWS'
  | 'SHOW'
  | 'OUT'
  | 'OUT_DATA'
  | 'SCRIPTURE'
  | 'CATEGORIES'
  | 'FOLDERS';

interface SocketCallbacks {
  onStatus: (status: ConnectionStatus) => void;
  /** Every inbound channel, including pushed state. */
  onMessage: (channel: string, data: unknown) => void;
}

interface Waiter {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function socketUrl(host: string, port: string): string {
  return `ws://${host}:${port}/socket.io/?EIO=4&transport=websocket`;
}

export class FreeShowSocket {
  private ws: WebSocket | null = null;
  private clientId = '';
  private stopped = true;
  private authed = false;
  private reconnectDelay = 1000;
  private readonly maxDelay = 30_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Waiters keyed by channel; FIFO, since replies carry no request id. */
  private readonly waiting = new Map<string, Waiter[]>();

  constructor(
    private readonly url: string,
    private readonly password: string,
    private readonly cb: SocketCallbacks,
  ) {}

  get isReady(): boolean {
    return this.authed;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.authed = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.failAllWaiters('socket stopped');
    this.closeSocket();
  }

  /** Fire-and-forget on a RemoteShow channel. */
  send(channel: string, data: unknown = null): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('not connected');
    }
    const frame = JSON.stringify([CHANNEL, { id: this.clientId, channel, data }]);
    this.ws.send(`${MESSAGE}${EVENT}${frame}`);
  }

  /** Send and wait for the reply on the same channel. */
  request<T = unknown>(
    channel: string,
    data: unknown = null,
    timeoutMs = DEFAULT_TIMEOUT,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      try {
        this.send(channel, data);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      const queue = this.waiting.get(channel) ?? [];
      const waiter: Waiter = {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer: setTimeout(() => {
          this.drop(channel, waiter);
          reject(new Error(`timed out waiting for ${channel}`));
        }, timeoutMs),
      };
      queue.push(waiter);
      this.waiting.set(channel, queue);
    });
  }

  /** Invoke one of the 49 proxied API actions (`API:<action>`). */
  api(action: string, data: Record<string, unknown> = {}): void {
    this.send(`API:${action}`, data);
  }

  requestApi<T = unknown>(
    action: string,
    data: Record<string, unknown> = {},
    timeoutMs = DEFAULT_TIMEOUT,
  ): Promise<T> {
    return this.request<T>(`API:${action}`, data, timeoutMs);
  }

  private open(): void {
    if (this.stopped) return;
    this.authed = false;
    this.cb.onStatus('connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onmessage = (ev) => this.receive(String(ev.data));

    socket.onclose = () => {
      this.authed = false;
      this.failAllWaiters('socket closed');
      if (this.stopped) return;
      this.cb.onStatus('disconnected');
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      try {
        socket.close();
      } catch {
        /* already closing */
      }
    };
  }

  private receive(frame: string): void {
    if (frame === PING) {
      this.ws?.send(PONG);
      return;
    }
    if (frame[0] === '0') {
      this.ws?.send(`${MESSAGE}${NS_CONNECT}`);
      return;
    }
    if (frame[0] !== MESSAGE) return;

    if (frame[1] === NS_CONNECT) {
      // The namespace sid doubles as our client id in every REMOTE envelope.
      this.clientId = readSid(frame.slice(2));
      this.reconnectDelay = 1000;
      try {
        this.send('PASSWORD');
      } catch {
        /* the socket died between open and here */
      }
      return;
    }
    if (frame[1] !== EVENT) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(frame.slice(2));
    } catch {
      return;
    }
    if (!Array.isArray(parsed) || parsed.length < 2) return;
    const body = parsed[1];
    if (!body || typeof body !== 'object') return;

    const { channel, data } = body as { channel?: unknown; data?: unknown };
    if (typeof channel !== 'string') return;

    this.handleHandshake(channel, data);

    const queue = this.waiting.get(channel);
    const waiter = queue?.shift();
    if (waiter) {
      if (queue && queue.length === 0) this.waiting.delete(channel);
      clearTimeout(waiter.timer);
      waiter.resolve(data);
    }

    this.cb.onMessage(channel, data);
  }

  private handleHandshake(channel: string, data: unknown): void {
    if (channel === 'PASSWORD') {
      // `{ dictionary, password: boolean }` — send the code either way; an
      // empty one is rejected with "wrongPass", which is its own status.
      try {
        this.send('ACCESS', this.password);
      } catch {
        /* dropped */
      }
      return;
    }
    if (channel === 'ACCESS') {
      this.authed = true;
      this.cb.onStatus('connected');
      return;
    }
    if (channel === 'ERROR' && data === 'wrongPass') {
      this.authed = false;
      this.cb.onStatus('unauthorized');
      // Don't hammer a server that is rejecting our code.
      this.stop();
    }
  }

  private drop(channel: string, waiter: Waiter): void {
    const queue = this.waiting.get(channel);
    if (!queue) return;
    const i = queue.indexOf(waiter);
    if (i >= 0) queue.splice(i, 1);
    if (queue.length === 0) this.waiting.delete(channel);
  }

  private failAllWaiters(reason: string): void {
    for (const queue of this.waiting.values()) {
      for (const waiter of queue) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(reason));
      }
    }
    this.waiting.clear();
  }

  private closeSocket(): void {
    if (!this.ws) return;
    this.ws.onopen = this.ws.onmessage = this.ws.onclose = this.ws.onerror = null;
    try {
      this.ws.close();
    } catch {
      /* already closing */
    }
    this.ws = null;
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.closeSocket();
      this.open();
    }, delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
  }
}

function readSid(json: string): string {
  try {
    const parsed = JSON.parse(json) as { sid?: unknown };
    return typeof parsed.sid === 'string' ? parsed.sid : '';
  } catch {
    return '';
  }
}
