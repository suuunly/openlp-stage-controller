import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base: './' → relative asset URLs, so the built app runs from any directory
// on any static host without path config. FreeShow has no equivalent of
// OpenLP's drop-in stage folder, so the bundle is served either from a small
// static server on the FreeShow PC or straight off disk — see CLAUDE.md §4.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // woff2 are well above the inline threshold; keep them as emitted files
    assetsInlineLimit: 4096,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    // Playwright specs live in e2e/ and must not be picked up by Vitest
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
