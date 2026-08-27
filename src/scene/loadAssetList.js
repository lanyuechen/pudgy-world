import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import assetListData from '../config/assetListPlacements.json';
import { assetUrl } from '../config/assetUrl.js';
import { ASSET_LOAD_CONCURRENCY, mapPool } from '../util/mapPool.js';
import { createAtlasMaterials, prepareFbxRoot } from './atlasMaterials.js';

/**
 * Load every FBX placement from Asset_List.unity under a Towns group.
 * Only runs when the Asset_List catalog scene is opened.
 */
export async function loadAssetListTowns(loadingManager, onProgress) {
  const materials = await createAtlasMaterials(loadingManager);
  const fbxLoader = new FBXLoader(loadingManager);
  const towns = new THREE.Group();
  towns.name = 'Towns';

  const placements = assetListData.placements;
  let loaded = 0;

  await mapPool(placements, ASSET_LOAD_CONCURRENCY, async (placement) => {
    onProgress?.(
      `Loading ${placement.name}… (${loaded + 1}/${placements.length})`,
      loaded / placements.length,
    );

    try {
      const root = await fbxLoader.loadAsync(assetUrl(placement.url));
      root.name = placement.name;
      // File scale is normalized to meters inside prepareFbxRoot; Unity instance scale stays on wrapper.
      prepareFbxRoot(root, { ...materials, castShadow: false });

      const wrapper = new THREE.Group();
      wrapper.name = `${placement.name}_Instance`;
      wrapper.position.set(placement.position.x, placement.position.y, placement.position.z);
      wrapper.quaternion.set(
        placement.rotation.x,
        placement.rotation.y,
        placement.rotation.z,
        placement.rotation.w,
      );
      wrapper.scale.set(placement.scale.x, placement.scale.y, placement.scale.z);
      wrapper.add(root);
      towns.add(wrapper);
    } catch (err) {
      console.error(`Failed to load ${placement.name}`, err);
    } finally {
      loaded += 1;
      onProgress?.(
        `Loading towns… (${loaded}/${placements.length})`,
        loaded / placements.length,
      );
    }
  });

  return towns;
}

export { assetListData };
