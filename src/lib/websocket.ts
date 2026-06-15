import { wsUrl } from './api';
import type { ConnectionStatus, OpenLpEvent, OpenLpEventType } from './types';

const EVENT_TYPES: OpenLpEventType[] = [
  'slidecontroller_changed',
  'service_changed',
  'blank_changed',
];

interface SocketCallbacks {
  onStatus: (status: ConnectionStatus) => void;
  onEvent: (event: OpenLpEvent) => void;
}

/**
 * Persistent connection to OpenLP's WebSocket (`ws://<host>:<port>/ws`).
 * Auto-reconnects with exponential backoff (1s → 2s → 4s … capped at 30s).
 * One instance app-wide (TASK-03) — views read state, never open their own.
 */
export class OpenLpSocket {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private readonly maxDelay = 30_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly cb: SocketCallbacks) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      // Detach handlers so the close doesn't trigger a reconnect.
      this.ws.onopen = this.ws.onmessage = this.ws.onclose = this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        /* already closing */
      }
      this.ws = null;
    }
  }

  private open(): void {
    if (this.stopped) return;
    this.cb.onStatus('connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.reconnectDelay = 1000;
      this.cb.onStatus('connected');
    };

    socket.onmessage = (ev) => {
      const event = parseMessage(ev.data);
      if (event) this.cb.onEvent(event);
    };

    socket.onclose = () => {
      this.cb.onStatus('disconnected');
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // Let onclose drive the reconnect; just force closure.
      try {
        socket.close();
      } catch {
        /* noop */
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
  }
}

/** Parse a raw WS message into a normalised {@link OpenLpEvent}, or null. */
export function parseMessage(data: unknown): OpenLpEvent | null {
  if (typeof data !== 'string') return null;
  let msg: unknown;
  try {
    msg = JSON.parse(data);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object') return null;

  const obj = msg as Record<string, unknown>;
  const results =
    obj.results && typeof obj.results === 'object'
      ? (obj.results as Record<string, unknown>)
      : obj;

  const rawType = (results.type ?? obj.type) as string | undefined;
  if (!rawType || !EVENT_TYPES.includes(rawType as OpenLpEventType)) {
    return null;
  }
  return { type: rawType as OpenLpEventType, data: results };
}
