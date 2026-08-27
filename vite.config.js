import { defineConfig, loadEnv } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// GitHub Pages project site: https://<user>.github.io/pudgy-world/
const repoBase = '/pudgy-world/';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const assetCdn = Boolean(env.VITE_ASSET_BASE?.trim());

  return {
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
    plugins: [
      {
        name: 'omit-assets-when-cdn',
        apply: 'build',
        closeBundle() {
          if (!assetCdn) return;
          // Vite JS/CSS also live under dist/assets/ — only drop mirrored public models/textures.
          for (const name of ['models', 'textures']) {
            const dir = path.resolve(__dirname, 'dist/assets', name);
            if (!fs.existsSync(dir)) continue;
            fs.rmSync(dir, { recursive: true, force: true });
          }
          console.info(
            '[vite] omitted dist/assets/{models,textures} (VITE_ASSET_BASE set — serve from CDN)',
          );
        },
      },
    ],
  };
});
