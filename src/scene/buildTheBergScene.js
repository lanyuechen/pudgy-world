import * as THREE from 'three';
import { createProceduralSky } from './sky.js';
import { createLights } from './lights.js';
import { loadTheBergLand } from './loadTheBerg.js';
import { THE_BERG_MAP_V02 } from '../config/theBergAssets.js';

/**
 * Continuous world map for one Berg assembly (explore-only — not playable, no NPCs).
 *
 * @param {{ map?: typeof THE_BERG_MAP_V02, loadingManager?: import('three').LoadingManager, onProgress?: Function }} opts
 */
export async function buildTheBergScene({
  map = THE_BERG_MAP_V02,
  loadingManager,
  onProgress,
} = {}) {
  const scene = new THREE.Scene();
  scene.name = map.id;
  scene.background = new THREE.Color(0x7ad8ef);

  const sky = createProceduralSky(2500);
  scene.add(sky);

  const cameraView = map.camera;
  const look = cameraView.lookAt;
  const lights = createLights(scene, {
    target: look,
    castShadow: false,
    sunDistance: 500,
  });

  onProgress?.(`Loading ${map.label}…`, 0.05);
  const land = await loadTheBergLand(map.assets, loadingManager, (msg, ratio) => {
    onProgress?.(msg, 0.05 + ratio * 0.9);
  });
  scene.add(land);

  return {
    scene,
    lights,
    land,
    cameraView,
    playable: false,
    update() {},
  };
}
