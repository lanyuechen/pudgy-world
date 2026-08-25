import * as THREE from 'three';
import { createProceduralSky } from './sky.js';
import { createLights } from './lights.js';
import { loadAssetListTowns, assetListData } from './loadAssetList.js';

/**
 * Asset_List.unity — neighborhood / extras showcase (no water/snow/gameplay).
 */
export async function buildAssetListScene({ loadingManager, onProgress } = {}) {
  const scene = new THREE.Scene();
  scene.name = 'Asset_List';
  scene.background = new THREE.Color(0x7ad8ef);

  const sky = createProceduralSky(2500);
  scene.add(sky);

  const look = assetListData.camera.lookAt;
  const lights = createLights(scene, {
    target: look,
    castShadow: false,
    sunDistance: 400,
  });

  onProgress?.('Loading Asset List towns…', 0.05);
  const towns = await loadAssetListTowns(loadingManager, (msg, ratio) => {
    onProgress?.(msg, 0.05 + ratio * 0.9);
  });
  scene.add(towns);

  return {
    scene,
    lights,
    towns,
    cameraView: assetListData.camera,
    playable: false,
    update() {},
  };
}
