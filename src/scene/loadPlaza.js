import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { SCENE } from '../config/sceneConfig.js';
import { createAtlasMaterials, prepareFbxRoot } from './atlasMaterials.js';

/**
 * Load Individual_PenguPlaza_03.fbx for the Pengu Plaza scene.
 */
export async function loadPenguPlaza(loadingManager) {
  const materials = await createAtlasMaterials(loadingManager);
  const fbxLoader = new FBXLoader(loadingManager);
  const root = await fbxLoader.loadAsync(SCENE.assets.plazaFbx);
  root.name = 'Individual_PenguPlaza_03';
  prepareFbxRoot(root, { ...materials, castShadow: true });
  return root;
}
