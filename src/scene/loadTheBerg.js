import * as THREE from 'three';
import { loadModelRoot } from '../loaders/loadModel.js';
import { ASSET_LOAD_CONCURRENCY, mapPool } from '../util/mapPool.js';
import { createAtlasMaterials, applyAtlasMaterials } from './atlasMaterials.js';

/**
 * Load TheBerg base + fillers + neighborhood tiles for one map assembly.
 * GLB tiles are cm→m baked at convert; pieces keep authored world offsets in mesh space.
 *
 * @param {Array<{ name: string, url: string }>} assets
 */
export async function loadTheBergLand(assets, loadingManager, onProgress) {
  const materials = await createAtlasMaterials(loadingManager);

  const land = new THREE.Group();
  land.name = 'TheBerg_Land';

  const pieces = new THREE.Group();
  pieces.name = 'Neighborhoods';
  land.add(pieces);

  let loaded = 0;
  const total = assets.length;

  await mapPool(assets, ASSET_LOAD_CONCURRENCY, async (asset) => {
    onProgress?.(`Loading ${asset.name}… (${loaded + 1}/${total})`, loaded / total);

    try {
      const root = await loadModelRoot(asset.url, { loadingManager });
      root.name = asset.name;
      applyAtlasMaterials(root, { ...materials, castShadow: false });
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
