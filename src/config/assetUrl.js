/**
 * Prefix public asset paths with Vite `base` (needed for GitHub Pages project sites).
 * Accepts `/assets/...` or `assets/...`.
 */
export function assetUrl(path) {
  const cleaned = String(path).replace(/^\//, '');
  return `${import.meta.env.BASE_URL}${cleaned}`;
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
 * /assets/models/asset-list/TheBerg_ColorAtlas.png). Remap those to the
 * actual atlas files so LoadingManager does not 404.
 */
export function remapFbxTextureUrl(url) {
  const raw = String(url).split(/[?#]/)[0];
  const base = raw.split(/[/\\]/).pop() || '';
  const mapped = TEXTURE_BASENAME_REMAP[base];
  return mapped ? assetUrl(mapped) : url;
}
