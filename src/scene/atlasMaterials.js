import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';

function isBillboard(name = '') {
  return name.toLowerCase().includes('billboard');
}

/**
 * Shared TheBerg / Billboard atlas materials (flipY true for Unity/FBX UVs).
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

  const bergMaterial = new THREE.MeshLambertMaterial({
    map: bergMap,
    color: 0xffffff,
  });

  const billboardMaterial = new THREE.MeshLambertMaterial({
    map: billboardMap,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  return { bergMaterial, billboardMaterial, bergMap, billboardMap };
}

/**
 * Apply atlas materials to an FBX root. Unity useFileScale → scale 0.01 (cm→m).
 */
export function prepareFbxRoot(root, { bergMaterial, billboardMaterial, castShadow = true } = {}) {
  root.scale.setScalar(0.01);

  root.traverse((child) => {
    if (!child.isMesh) return;

    child.castShadow = castShadow;
    child.receiveShadow = true;

    const matList = Array.isArray(child.material) ? child.material : [child.material];
    const useBillboard =
      isBillboard(child.name) || matList.some((m) => isBillboard(m?.name));

    child.material = useBillboard ? billboardMaterial.clone() : bergMaterial.clone();

    const geo = child.geometry;
    if (geo && !geo.attributes.uv && geo.attributes.uv1) {
      geo.setAttribute('uv', geo.attributes.uv1);
    }
  });

  return root;
}
