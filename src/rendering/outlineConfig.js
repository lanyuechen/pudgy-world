import * as THREE from 'three';

/**
 * Post-process outline only (outlineComposer):
 *   depth  — object silhouettes vs background
 *   normal — creases / hard edges
 *   color  — toon band boundaries
 *
 * No hull on skinned meshes (seam gaps) and no N·V rim in toon shader
 * (tilted faces like hat brims go fully black).
 */
export const OUTLINE = {
  hull: {
    enabled: false,
    skinnedEnabled: false,
    pixelWidth: 2.0,
    silhouetteCutoff: 0.15,
    fadeDistanceM: 75,
    color: new THREE.Color(0x000000),
    distanceScale: 0.5,
  },

  pp: {
    enabled: true,
    thickness: 1.4,
    normalThreshold: 0.58,
    colorThreshold: 0.82,
    depthThreshold: 0.01,
    color: new THREE.Color(0x000000),
    overlay: true,
  },

  ssao: {
    intensity: 0.4,
    radius: 0.3,
  },
};
