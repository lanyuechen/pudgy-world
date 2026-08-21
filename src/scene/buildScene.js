import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';
import { createProceduralSky } from './sky.js';
import { createLights } from './lights.js';
import { createWater } from './water.js';
import { createSnow } from './snow.js';
import { loadPenguPlaza } from './loadPlaza.js';

/**
 * Builds the Pengu_Plaza visual world (scene setup step).
 */
export async function buildPenguPlazaScene({ loadingManager, onProgress } = {}) {
  const scene = new THREE.Scene();
  scene.name = 'Pengu_Plaza';
  scene.background = new THREE.Color(0x7ad8ef);

  const sky = createProceduralSky();
  scene.add(sky);

  const lights = createLights(scene, {
    target: SCENE.camera.lookAt,
    castShadow: true,
  });

  const water = createWater();
  scene.add(water);

  const textureLoader = new THREE.TextureLoader(loadingManager);
  let snowTexture = null;
  try {
    snowTexture = await textureLoader.loadAsync(SCENE.assets.snowParticle);
  } catch {
    // optional
  }
  const snow = createSnow(snowTexture);
  scene.add(snow.points);

  onProgress?.('Loading Pengu Plaza mesh…', 0.4);
  const plaza = await loadPenguPlaza(loadingManager);
  scene.add(plaza);

  return {
    scene,
    lights,
    water,
    snow,
    plaza,
    cameraView: {
      lookAt: SCENE.camera.lookAt,
      orbitDistance: SCENE.camera.orbitDistance,
      orbitPitch: SCENE.camera.orbitPitch,
      orbitYaw: SCENE.camera.orbitYaw,
      far: SCENE.camera.far,
      maxDistance: 180,
      minDistance: SCENE.camera.distance,
    },
    update(dt) {
      snow.update(dt);
    },
  };
}
