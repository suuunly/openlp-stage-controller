import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { MockWebSocket } from './mockSocket';

beforeEach(() => {
  // The app talks to FreeShow over a WebSocket and nothing else, so this is the
  // only boundary tests need to control. Nothing connects until a test drives
  // the handshake, which keeps every test starting from "not connected".
  MockWebSocket.reset();
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
