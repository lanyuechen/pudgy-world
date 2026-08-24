import { defineConfig } from 'vite';
import path from 'node:path';

// GitHub Pages project site: https://<user>.github.io/pudgy-world/
const repoBase = '/pudgy-world/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? repoBase : '/',
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}));
