/** @typedef {'character' | 'environment' | 'prop' | 'clip'} ModelProfile */
/** @typedef {'glb' | 'fbx'} ModelSourceFormat */
/** @typedef {'model' | 'trait'} ModelRole */

export const MODEL_PROFILE = {
  CHARACTER: 'character',
  ENVIRONMENT: 'environment',
  PROP: 'prop',
  CLIP: 'clip',
};

export const MODEL_SPEC_VERSION = 10;

/**
 * Resolve profile from an asset URL or models-relative path.
 * @param {string} urlOrPath
 * @returns {ModelProfile}
 */
export function profileFromAssetPath(urlOrPath) {
  const path = String(urlOrPath)
    .split(/[?#]/)[0]
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^\//, '')
    .replace(/^assets\/models\//, '');

  const top = path.split('/')[0] || '';

  if (top === 'animations') return MODEL_PROFILE.CLIP;
  if (top === 'player' || top === 'npcs') return MODEL_PROFILE.CHARACTER;
  if (top === 'fish' || top === 'levels') return MODEL_PROFILE.PROP;
  if (
    top === 'neighborhoods' ||
    top === 'individuals' ||
    top === 'extras' ||
    top === 'special'
  ) {
    return MODEL_PROFILE.ENVIRONMENT;
  }

  return MODEL_PROFILE.PROP;
}

export function toGlbUrl(url) {
  return String(url).replace(/\.fbx$/i, '.glb');
}

export function toFbxUrl(url) {
  return String(url).replace(/\.glb$/i, '.fbx');
}

/** glTF/OpenGL atlas sampling — see docs/MODEL_SPEC.md */
export function configureAtlasTexture(map) {
  if (!map) return map;
  map.colorSpace = /* @type {import('three').ColorSpace} */ ('srgb');
  map.flipY = false;
  map.anisotropy = Math.max(map.anisotropy ?? 0, 8);
  map.needsUpdate = true;
  return map;
}
