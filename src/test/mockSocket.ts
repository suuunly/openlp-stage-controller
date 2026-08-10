/**
 * A stand-in for the browser `WebSocket` that speaks enough of engine.io for
 * tests to drive the RemoteShow handshake and assert on what the app sent.
 *
 * Frames are the real wire format, so these tests would catch a change in the
 * protocol encoding rather than just in our own helpers.
 */
export class MockWebSocket {
  static instances: MockWebSocket[] = [];

  static reset(): void {
    MockWebSocket.instances = [];
  }

  /** The socket the app most recently opened. */
  static last(): MockWebSocket {
    const socket = MockWebSocket.instances.at(-1);
    if (!socket) throw new Error('no WebSocket was opened');
    return socket;
  }

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  /** Raw frames the app sent. */
  readonly sent: string[] = [];

  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  /* ---- driving the server side ---- */

  private deliver(frame: string): void {
    this.onmessage?.({ data: frame });
  }

  /** engine.io open → the app replies `40`. */
  open(): void {
    this.deliver('0{"sid":"engine-sid","upgrades":[],"pingInterval":25000}');
  }

  /** Namespace connected → the app sends `PASSWORD`. */
  namespaceConnect(sid = 'client-sid'): void {
    this.deliver(`40{"sid":"${sid}"}`);
  }

  /** Push a RemoteShow channel message at the app. */
  channel(channel: string, data: unknown = null): void {
    this.deliver(`42${JSON.stringify(['REMOTE', { channel, data }])}`);
  }

  /** Complete the whole handshake: open → namespace → PASSWORD → ACCESS. */
  handshake(): void {
    this.open();
    this.namespaceConnect();
    this.channel('PASSWORD', { password: true });
    this.channel('ACCESS', null);
  }

  /** Everything the app emitted on the REMOTE channel, decoded. */
  outbound(): { channel: string; data: unknown }[] {
    return this.sent
      .filter((frame) => frame.startsWith('42'))
      .map((frame) => JSON.parse(frame.slice(2)) as [string, { channel: string; data: unknown }])
      .filter(([name]) => name === 'REMOTE')
      .map(([, body]) => ({ channel: body.channel, data: body.data }));
  }

  /** Did the app send this channel, and with what payload? */
  find(channel: string): unknown {
    return this.outbound().find((m) => m.channel === channel)?.data;
  }
}
