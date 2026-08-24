import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';
import { createProceduralSky } from './sky.js';
import { createLights } from './lights.js';
import { createWater } from './water.js';
import { createSnow } from './snow.js';
import { loadPenguPlaza } from './loadPlaza.js';
import { createFishingHoles } from '../fishing/fishingHoles.js';
import { PLAYER } from '../config/playerConfig.js';

/**
 * Builds the Pengu_Plaza visual world (playable).
 */
export async function buildPenguPlazaScene({ loadingManager, onProgress } = {}) {
  const scene = new THREE.Scene();
  scene.name = 'Pengu_Plaza';
  scene.background = new THREE.Color(0x7ad8ef);

  const sky = createProceduralSky();
  scene.add(sky);

  const lights = createLights(scene, {
    target: PLAYER.spawn,
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

  const holeOffsets = [
    { id: 'hole-a', dx: 4, dz: 0 },
    { id: 'hole-b', dx: -3, dz: 4 },
    { id: 'hole-c', dx: 0, dz: -5 },
  ];
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const holes = holeOffsets.map(({ id, dx, dz }) => {
    const x = PLAYER.spawn.x + dx;
    const z = PLAYER.spawn.z + dz;
    ray.set(new THREE.Vector3(x, 200, z), down);
    const hit = ray.intersectObject(plaza, true)[0];
    const y = hit ? hit.point.y + 0.05 : PLAYER.spawn.y;
    return { id, position: { x, y, z } };
  });
  const fishingHoles = createFishingHoles(scene, { holes });
  console.info('[fishing] holes', holes.map((h) => [h.id, h.position.x, h.position.y, h.position.z]));

  return {
    scene,
    lights,
    water,
    snow,
    plaza,
    fishingHoles,
    playable: true,
    collisionRoot: plaza,
    spawn: { ...PLAYER.spawn },
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
