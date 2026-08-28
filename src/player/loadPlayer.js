import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';
import { loadModelRoot } from '../loaders/loadModel.js';
import { configureAtlasTexture } from '../loaders/modelProfiles.js';
import { createToonMaterial } from '../rendering/toonMaterial.js';
import { attachHullOutline, stripHullOutline } from '../rendering/hullOutline.js';

/** Load player mesh (config path .fbx → runtime .glb via assetUrl). */
export async function loadPlayerModel(loadingManager) {
  const textureLoader = new THREE.TextureLoader(loadingManager);

  const [traitsMap, fbx] = await Promise.all([
    textureLoader.loadAsync(PLAYER.traitsAtlas),
    loadModelRoot(PLAYER.fbx, { loadingManager, snapFeet: true }),
  ]);

  configureAtlasTexture(traitsMap);

  const base = createToonMaterial({
    map: traitsMap,
    color: 0xffffff,
    skinning: true,
  });

  fbx.name = 'player_pudgy';
  const meshes = [];
  fbx.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });

  for (const child of meshes) {
    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = false;
    const mat = base.clone();
    mat.skinning = true;
    child.material = mat;
    stripHullOutline(child);
    if (!child.isSkinnedMesh) attachHullOutline(child);

    if (child.isSkinnedMesh && child.skeleton) {
      child.skeleton.update();
    }
  }

  const root = new THREE.Group();
  root.name = 'Pudgy_Player';
  root.userData.units = 'm';
  root.add(fbx);

  return {
    root,
    fbx,
    animations: fbx.animations ?? [],
  };
}
