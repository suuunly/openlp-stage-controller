import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

beforeEach(() => {
  // Default every test to "FreeShow is not there". A `TypeError` is exactly
  // what a browser raises for an unreachable host or a CORS rejection, so this
  // exercises the same path the real app takes when offline — and stops the
  // polling link from making real network calls. Tests that need a live
  // FreeShow stub their own fetch over the top.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
