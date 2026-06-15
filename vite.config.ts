import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base: './' → relative asset URLs so the built app drops straight into
// OpenLP's  DataFolder/stages/elim-remote/  and is reachable at
// http://<openlp-ip>:4316/stage/elim-remote/  with no path config.
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
