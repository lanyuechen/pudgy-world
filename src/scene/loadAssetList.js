import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import assetListData from '../config/assetListPlacements.json';
import { createAtlasMaterials, prepareFbxRoot } from './atlasMaterials.js';

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

/**
 * Load every FBX placement from Asset_List.unity under a Towns group.
 */
export async function loadAssetListTowns(loadingManager, onProgress) {
  const materials = await createAtlasMaterials(loadingManager);
  const fbxLoader = new FBXLoader(loadingManager);
  const towns = new THREE.Group();
  towns.name = 'Towns';

  const placements = assetListData.placements;
  let loaded = 0;

  await mapPool(placements, 3, async (placement) => {
    onProgress?.(
      `Loading ${placement.name}… (${loaded + 1}/${placements.length})`,
      loaded / placements.length,
    );

    try {
      const root = await fbxLoader.loadAsync(placement.url);
      root.name = placement.name;
      // File scale cm→m is applied inside prepareFbxRoot; Unity instance scale stays on wrapper.
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
