import * as THREE from 'three';
import assetListData from '../config/assetListPlacements.json';
import { assetUrl } from '../config/assetUrl.js';
import { loadModelRoot } from '../loaders/loadModel.js';
import { ASSET_LOAD_CONCURRENCY, mapPool } from '../util/mapPool.js';
import { createAtlasMaterials, applyAtlasMaterials } from './atlasMaterials.js';

/**
 * Load every mesh placement from Asset_List.unity under a Towns group.
 * Only runs when the Asset_List catalog scene is opened.
 */
export async function loadAssetListTowns(loadingManager, onProgress) {
  const materials = await createAtlasMaterials(loadingManager);
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
      const root = await loadModelRoot(assetUrl(placement.url), loadingManager);
      root.name = placement.name;
      applyAtlasMaterials(root, { ...materials, castShadow: false });

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
