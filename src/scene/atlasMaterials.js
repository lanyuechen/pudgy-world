import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';
import { configureAtlasTexture } from '../loaders/modelProfiles.js';
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

  configureAtlasTexture(bergMap);
  configureAtlasTexture(billboardMap);

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
 * Apply Berg/Billboard atlas materials + hull outline.
 * Units/orientation are handled in loadModelRoot → normalizeLoadedModel.
 */
export function applyAtlasMaterials(
  root,
  { bergMaterial, billboardMaterial, castShadow = true } = {},
) {
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
  }

  return root;
}
