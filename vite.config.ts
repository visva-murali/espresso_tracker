import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Git worktrees live under .claude/worktrees/ and carry their own
    // node_modules. Without this, `vitest run` from the main checkout
    // globs into every worktree's test files and re-runs the whole suite
    // against a second React instance (hooks throw "Cannot read
    // properties of null"). This bit three feature merges in a row.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
});
