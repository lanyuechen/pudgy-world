import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { PLAYER } from '../config/playerConfig.js';
import { normalizeFbxToMeters } from '../config/units.js';
import { createToonMaterial } from '../rendering/toonMaterial.js';
import { attachHullOutline } from '../rendering/hullOutline.js';

/**
 * Load Unity Player.prefab mesh (player_pudgy.fbx).
 * Already authored in meters — still runs through normalizeFbxToMeters for one unit path.
 */
export async function loadPlayerModel(loadingManager) {
  const textureLoader = new THREE.TextureLoader(loadingManager);
  const fbxLoader = new FBXLoader(loadingManager);

  const [traitsMap, fbx] = await Promise.all([
    textureLoader.loadAsync(PLAYER.traitsAtlas),
    fbxLoader.loadAsync(PLAYER.fbx),
  ]);

  traitsMap.colorSpace = THREE.SRGBColorSpace;
  traitsMap.flipY = true;
  traitsMap.anisotropy = 8;

  normalizeFbxToMeters(fbx, { fileUnit: 'm' });

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
    attachHullOutline(child);

    if (child.isSkinnedMesh && child.skeleton) {
      child.skeleton.update();
    }

    const geo = child.geometry;
    if (geo && !geo.attributes.uv && geo.attributes.uv1) {
      geo.setAttribute('uv', geo.attributes.uv1);
    }
  }

  // Face movement/+camera forward (FBX authored the opposite way in Three.js)
  fbx.rotation.y = Math.PI;

  fbx.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fbx);
  if (!box.isEmpty()) {
    fbx.position.y -= box.min.y;
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
