import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';
import { normalizeFbxToMeters } from '../config/units.js';
import { createToonMaterial } from '../rendering/toonMaterial.js';
import { attachHullOutline } from '../rendering/hullOutline.js';

function usesBillboardAtlas(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats.some((m) => /billboard/i.test(m?.name || ''));
}

/**
 * Shared TheBerg / Billboard atlas materials.
 * Unity Toon_BillboardTexture_02 is opaque toon (_AlphaClip 0, cull back) —
 * RoadSign etc. share that atlas and must NOT use transparent DoubleSide cutout.
 */
export async function createAtlasMaterials(loadingManager) {
  const textureLoader = new THREE.TextureLoader(loadingManager);
  const [bergMap, billboardMap] = await Promise.all([
    textureLoader.loadAsync(SCENE.assets.bergAtlas),
    textureLoader.loadAsync(SCENE.assets.billboardAtlas),
  ]);

  for (const map of [bergMap, billboardMap]) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.flipY = true;
    map.anisotropy = 8;
    map.needsUpdate = true;
  }

  const bergMaterial = createToonMaterial({
    map: bergMap,
    color: 0xffffff,
  });

  const billboardMaterial = createToonMaterial({
    map: billboardMap,
    color: 0xffffff,
  });

  return { bergMaterial, billboardMaterial, bergMap, billboardMap };
}

/**
 * Apply atlas materials + hull outline, and normalize FBX to meters (cm→m).
 */
export function prepareFbxRoot(root, { bergMaterial, billboardMaterial, castShadow = true } = {}) {
  // Land / Asset_List FBXs are authored in centimeters
  normalizeFbxToMeters(root, { fileUnit: 'cm' });

  const meshes = [];
  root.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });

  for (const child of meshes) {
    child.castShadow = castShadow;
    child.receiveShadow = true;

    const base = (usesBillboardAtlas(child) ? billboardMaterial : bergMaterial).clone();
    child.material = base;
    attachHullOutline(child);

    const geo = child.geometry;
    if (geo && !geo.attributes.uv && geo.attributes.uv1) {
      geo.setAttribute('uv', geo.attributes.uv1);
    }
  }

  return root;
}
