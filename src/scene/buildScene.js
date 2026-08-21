import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';
import { createProceduralSky } from './sky.js';
import { createLights } from './lights.js';
import { createWater } from './water.js';
import { createSnow } from './snow.js';
import { loadPenguPlaza } from './loadPlaza.js';

/**
 * Builds the Pengu_Plaza visual world (scene setup step).
 * Deferred: networking, player, HUD, toon outline PP, baked lightmaps.
 */
export async function buildPenguPlazaScene({ loadingManager, onProgress } = {}) {
  const scene = new THREE.Scene();
  scene.name = 'Pengu_Plaza';
  scene.background = new THREE.Color(0x7ad8ef);

  const sky = createProceduralSky();
  scene.add(sky);

  const lights = createLights(scene);

  const water = createWater();
  scene.add(water);

  const textureLoader = new THREE.TextureLoader(loadingManager);
  let snowTexture = null;
  try {
    snowTexture = await textureLoader.loadAsync(SCENE.assets.snowParticle);
  } catch {
    // Particle texture optional
  }
  const snow = createSnow(snowTexture);
  scene.add(snow.points);

  onProgress?.('Loading Pengu Plaza mesh…');
  const plaza = await loadPenguPlaza(loadingManager);
  scene.add(plaza);

  return {
    scene,
    lights,
    water,
    snow,
    plaza,
    update(dt) {
      snow.update(dt);
    },
  };
}
