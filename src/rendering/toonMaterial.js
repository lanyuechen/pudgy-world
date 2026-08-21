import * as THREE from 'three';

/** Unity ToonS_* mat live values from ToonShderGraph. */
export const TOON = {
  shades: 0.49,
  minShade: 0.3,
  maxShade: 1.0,
};

let sharedGradient = null;

/**
 * Nearest-filtered 1D ramp approximating Unity stepped N·L
 * (remap to [min,max] then quantize by _Shades).
 */
export function getToonGradientMap() {
  if (sharedGradient) return sharedGradient;

  // ~2–3 bands between minShade and maxShade
  const stops = [
    TOON.minShade,
    THREE.MathUtils.lerp(TOON.minShade, TOON.maxShade, 0.45),
    THREE.MathUtils.lerp(TOON.minShade, TOON.maxShade, 0.75),
    TOON.maxShade,
  ];

  const data = new Uint8Array(stops.length * 4);
  for (let i = 0; i < stops.length; i++) {
    const v = Math.round(THREE.MathUtils.clamp(stops[i], 0, 1) * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }

  sharedGradient = new THREE.DataTexture(data, stops.length, 1);
  sharedGradient.magFilter = THREE.NearestFilter;
  sharedGradient.minFilter = THREE.NearestFilter;
  sharedGradient.needsUpdate = true;
  return sharedGradient;
}

/**
 * MeshToonMaterial parity for Unity ToonS_TheBerg / ToonS_Traits / Billboard.
 */
export function createToonMaterial({
  map = null,
  color = 0xffffff,
  transparent = false,
  alphaTest = 0,
  side = THREE.FrontSide,
  depthWrite = true,
} = {}) {
  const mat = new THREE.MeshToonMaterial({
    map,
    color,
    gradientMap: getToonGradientMap(),
    transparent,
    alphaTest,
    side,
    depthWrite,
  });
  mat.name = 'ToonMaterial';
  return mat;
}
