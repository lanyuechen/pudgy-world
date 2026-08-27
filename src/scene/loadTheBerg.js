import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { UNITS } from '../config/units.js';
import { ASSET_LOAD_CONCURRENCY, mapPool } from '../util/mapPool.js';
import { createAtlasMaterials, prepareFbxRoot } from './atlasMaterials.js';

/**
 * Load TheBerg base + fillers + neighborhood tiles for one map assembly.
 * Pieces keep authored cm world transforms; a shared parent scales cm→m.
 * Only the selected World Map version's assets are fetched.
 *
 * @param {Array<{ name: string, url: string }>} assets
 */
export async function loadTheBergLand(assets, loadingManager, onProgress) {
  const materials = await createAtlasMaterials(loadingManager);
  const fbxLoader = new FBXLoader(loadingManager);

  const land = new THREE.Group();
  land.name = 'TheBerg_Land';
  // World-authored FBXs stay in cm; one parent converts the whole map to meters.
  land.scale.setScalar(UNITS.cmToM);

  const pieces = new THREE.Group();
  pieces.name = 'Neighborhoods';
  land.add(pieces);

  let loaded = 0;
  const total = assets.length;

  await mapPool(assets, ASSET_LOAD_CONCURRENCY, async (asset) => {
    onProgress?.(`Loading ${asset.name}… (${loaded + 1}/${total})`, loaded / total);

    try {
      const root = await fbxLoader.loadAsync(asset.url);
      root.name = asset.name;
      prepareFbxRoot(root, { ...materials, castShadow: false, skipNormalize: true });
      pieces.add(root);
    } catch (err) {
      console.error(`Failed to load ${asset.name}`, err);
    } finally {
      loaded += 1;
      onProgress?.(`Loading TheBerg… (${loaded}/${total})`, loaded / total);
    }
  });

  return land;
}
