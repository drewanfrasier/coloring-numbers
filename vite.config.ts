import { defineConfig } from 'vitest/config';

// Relative base so the build works on GitHub Pages (or any subfolder) without changes.
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  test: { environment: 'node' },
});
