import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { PLAYER } from '../config/playerConfig.js';

/**
 * Load the same FBX as Unity Player.prefab (Assets/FBXs/player_pudgy.fbx).
 * Model faces +Z in FBX; gameplay forward uses camera/-Z, so rotate 180° on Y.
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

  const material = new THREE.MeshLambertMaterial({
    map: traitsMap,
    color: 0xffffff,
  });

  fbx.name = 'player_pudgy';
  fbx.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = false;
    child.material = material.clone();

    if (child.isSkinnedMesh && child.skeleton) {
      child.skeleton.update();
    }

    const geo = child.geometry;
    if (geo && !geo.attributes.uv && geo.attributes.uv1) {
      geo.setAttribute('uv', geo.attributes.uv1);
    }
  });

  // Face movement/+camera forward (FBX authored the opposite way in Three.js)
  fbx.rotation.y = Math.PI;

  fbx.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fbx);
  if (!box.isEmpty()) {
    fbx.position.y -= box.min.y;
  }

  const root = new THREE.Group();
  root.name = 'Pudgy_Player';
  root.add(fbx);

  return {
    root,
    fbx,
    animations: fbx.animations ?? [],
  };
}
