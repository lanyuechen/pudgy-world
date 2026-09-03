import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';

// GitHub Pages project site: https://<user>.github.io/pudgy-world/
const repoBase = '/pudgy-world/';

/** @param {string | undefined} assetBase */
function buildAssetRuntimeCaching(assetBase) {
  /** @type {import('workbox-build').RuntimeCaching[]} */
  const rules = [
    {
      // Same-origin game assets (models, textures, fx, wasm, etc.)
      urlPattern: ({ url }) =>
        /\/assets\/.+\.(glb|gltf|bin|png|jpe?g|webp|ktx2?|json|wasm|fbx|mp3|ogg|wav)$/i.test(
          url.pathname,
        ),
      handler: 'CacheFirst',
      options: {
        cacheName: 'pudgy-game-assets',
        expiration: {
          maxEntries: 250,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ];

  const cdn = assetBase?.trim();
  if (cdn) {
    let cdnOrigin = '';
    try {
      cdnOrigin = new URL(cdn).origin;
    } catch {
      cdnOrigin = '';
    }
    if (cdnOrigin) {
      rules.push({
        urlPattern: ({ url }) =>
          url.origin === cdnOrigin &&
          /\.(glb|gltf|bin|png|jpe?g|webp|ktx2?|json|wasm|fbx|mp3|ogg|wav)$/i.test(url.pathname),
        handler: 'CacheFirst',
        options: {
          cacheName: 'pudgy-cdn-assets',
          expiration: {
            maxEntries: 250,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      });
    }
  }

  return rules;
}

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
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: [],
        manifest: false,
        workbox: {
          // App shell only — do not precache multi‑MB models from public/.
          globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
          // three + rapier chunks can exceed the 2 MiB default.
          maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
          navigateFallback: null,
          runtimeCaching: buildAssetRuntimeCaching(env.VITE_ASSET_BASE),
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
        },
        devOptions: {
          enabled: false,
        },
      }),
      {
        name: 'production-asset-bundle',
        apply: 'build',
        closeBundle() {
          const modelsDir = path.resolve(__dirname, 'dist/assets/models');
          if (fs.existsSync(modelsDir)) {
            const stripFbx = (dir) => {
              for (const name of fs.readdirSync(dir)) {
                const p = path.join(dir, name);
                if (fs.statSync(p).isDirectory()) stripFbx(p);
                else if (name.toLowerCase().endsWith('.fbx')) fs.unlinkSync(p);
              }
            };
            stripFbx(modelsDir);
            console.info('[vite] stripped dist/assets/models/**/*.fbx (runtime uses GLB)');
          }

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
