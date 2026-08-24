import * as THREE from 'three';

/**
 * Project unit policy (matches Unity useFileScale → meters).
 *
 * - Gameplay, physics, cameras, outline thickness: **meters**
 * - Land / Asset_List FBXs from Cinema4D are authored in **centimeters**
 * - player_pudgy.fbx is already in **meters** after FBXLoader
 */
export const UNITS = {
  /** 1 world unit = 1 meter */
  world: 'm',
  /** cm → m (Unity file scale for environment FBXs) */
  cmToM: 0.01,
};

/**
 * @typedef {'cm' | 'm'} FbxFileUnit
 */

/**
 * Normalize an FBX root so its world scale is meters.
 * Idempotent via root.userData.units.
 *
 * @param {THREE.Object3D} root
 * @param {{ fileUnit?: FbxFileUnit }} [options]
 */
export function normalizeFbxToMeters(root, { fileUnit = 'cm' } = {}) {
  if (!root || root.userData.units === 'm') return root;

  if (fileUnit === 'cm') {
    root.scale.multiplyScalar(UNITS.cmToM);
  }
  // fileUnit === 'm' → leave scale as authored

  root.userData.units = 'm';
  root.userData.fbxFileUnit = fileUnit;
  return root;
}

/**
 * Infer cm vs m from unscaled AABB (fallback when caller is unsure).
 * Environment tiles are ~1e4 cm; the player is ~1–2 m.
 */
export function inferFbxFileUnit(root) {
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0);
  return maxDim > 20 ? 'cm' : 'm';
}
