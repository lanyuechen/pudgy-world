import { SCENE } from '../config/sceneConfig.js';
import { loadModelRoot } from '../loaders/loadModel.js';
import { createAtlasMaterials, applyAtlasMaterials } from './atlasMaterials.js';

/**
 * Load Individual_PenguPlaza_03 for the Pengu Plaza scene.
 */
export async function loadPenguPlaza(loadingManager) {
  const materials = await createAtlasMaterials(loadingManager);
  const root = await loadModelRoot(SCENE.assets.plazaFbx, loadingManager);
  root.name = 'Individual_PenguPlaza_03';
  applyAtlasMaterials(root, { ...materials, castShadow: true });
  return root;
}
