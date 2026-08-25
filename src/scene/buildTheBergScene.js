import * as THREE from 'three';
import { createProceduralSky } from './sky.js';
import { createLights } from './lights.js';
import { loadTheBergLand } from './loadTheBerg.js';
import { THE_BERG_CAMERA } from '../config/theBergAssets.js';

/**
 * Continuous world map: base + Berg_Filler + Neighborhood_V_02
 * (explore-only overview — not playable, no NPCs).
 */
export async function buildTheBergScene({ loadingManager, onProgress } = {}) {
  const scene = new THREE.Scene();
  scene.name = 'WorldMap';
  scene.background = new THREE.Color(0x7ad8ef);

  const sky = createProceduralSky(2500);
  scene.add(sky);

  const look = THE_BERG_CAMERA.lookAt;
  const lights = createLights(scene, {
    target: look,
    castShadow: false,
    sunDistance: 500,
  });

  onProgress?.('Loading World Map…', 0.05);
  const land = await loadTheBergLand(loadingManager, (msg, ratio) => {
    onProgress?.(msg, 0.05 + ratio * 0.9);
  });
  scene.add(land);

  return {
    scene,
    lights,
    land,
    cameraView: THE_BERG_CAMERA,
    playable: false,
    update() {},
  };
}
