/**
 * Resolve a public asset path for loaders.
 *
 * Precedence:
 * 1. Absolute http(s) URL → unchanged (still rewrites .fbx → .glb)
 * 2. `VITE_ASSET_BASE` (CDN / object storage origin) when set
 * 3. Vite `BASE_URL` (e.g. `/pudgy-world/` on GitHub Pages)
 *
 * Accepts `/assets/...` or `assets/...`. Runtime models are meshopt `.glb`
 * (see `npm run convert:glb`); `.fbx` paths in configs are rewritten.
 */
export function getAssetBase() {
  const raw = import.meta.env.VITE_ASSET_BASE;
  if (raw == null || String(raw).trim() === '') {
    return import.meta.env.BASE_URL || '/';
  }
  const base = String(raw).trim();
  return base.endsWith('/') ? base : `${base}/`;
}

/** Prefer compressed GLB produced by scripts/convertFbxToGlb.mjs */
export function toGlbPath(path) {
  return String(path).replace(/\.fbx$/i, '.glb');
}

/**
 * @param {string} path
 * @returns {string}
 */
export function assetUrl(path) {
  const input = toGlbPath(path);
  if (/^https?:\/\//i.test(input)) return input;
  const cleaned = input.replace(/^\//, '');
  return `${getAssetBase()}${cleaned}`;
}

/** Filenames embedded in FBXs → real files under public/assets/textures/ */
const TEXTURE_BASENAME_REMAP = {
  'TheBerg_ColorAtlas.png': 'assets/textures/TheBerg_ColorAtlas.png',
  'BillboardTexture_02.png': 'assets/textures/BillboardTexture_02.png',
  'Traits_ColorAtlas.png': 'assets/textures/Traits_ColorAtlas.png',
  'snow-particle.png': 'assets/textures/snow-particle.png',
  'pasted__pasted__TheBerg_ColorAtlas.png': 'assets/textures/TheBerg_ColorAtlas.png',
};

/**
 * FBXLoader resolves material textures relative to the .fbx path (e.g.
 * /assets/models/neighborhoods/TheBerg_ColorAtlas.png). Remap those to the
 * actual atlas files so LoadingManager does not 404.
 */
export function remapFbxTextureUrl(url) {
  const raw = String(url).split(/[?#]/)[0];
  const base = raw.split(/[/\\]/).pop() || '';
  const mapped = TEXTURE_BASENAME_REMAP[base];
  return mapped ? assetUrl(mapped) : url;
}
