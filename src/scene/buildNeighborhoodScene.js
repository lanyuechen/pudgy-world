import * as THREE from 'three';
import { createProceduralSky } from './sky.js';
import { createLights } from './lights.js';
import { assetUrl } from '../config/assetUrl.js';
import { loadModelRoot } from '../loaders/loadModel.js';
import { createAtlasMaterials, applyAtlasMaterials } from './atlasMaterials.js';
import { ENEMY_PLACEMENTS } from '../config/combatConfig.js';
import { createEnemyCrowd } from '../combat/createEnemyCrowd.js';

function cameraViewFromObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const distance = Math.max(maxDim * 1.35, 12);

  return {
    lookAt: { x: center.x, y: center.y + size.y * 0.05, z: center.z },
    orbitDistance: distance,
    orbitPitch: 28,
    orbitYaw: 40,
    far: Math.max(1000, distance * 20),
    minDistance: Math.max(2, maxDim * 0.05),
    maxDistance: Math.max(180, distance * 6),
  };
}

/**
 * Single placement as its own scene (model at origin).
 * Individuals are playable; Levels / Extras stay explore-only.
 */
export async function buildNeighborhoodScene(
  placement,
  { loadingManager, onProgress, playable = true } = {},
) {
  const scene = new THREE.Scene();
  scene.name = placement.name;
  scene.background = new THREE.Color(0x7ad8ef);

  const sky = createProceduralSky(800);
  scene.add(sky);

  onProgress?.(`Loading ${placement.name}…`, 0.2);

  const materials = await createAtlasMaterials(loadingManager);
  const root = await loadModelRoot(assetUrl(placement.url), loadingManager);
  root.name = placement.name;
  applyAtlasMaterials(root, { ...materials, castShadow: playable });

  const wrapper = new THREE.Group();
  wrapper.name = `${placement.name}_View`;
  // Asset_List rotation is catalog layout only; standalone island uses baked GLB facing.
  wrapper.add(root);
  scene.add(wrapper);

  const cameraView = cameraViewFromObject(wrapper);
  const lights = createLights(scene, {
    target: cameraView.lookAt,
    castShadow: playable,
    sunDistance: Math.max(80, cameraView.orbitDistance),
  });

  let enemies = null;
  if (playable) {
    onProgress?.('Loading enemies…', 0.85);
    enemies = await createEnemyCrowd({
      parent: scene,
      collisionRoot: wrapper,
      placements: ENEMY_PLACEMENTS,
      loadingManager,
    });
  }

  onProgress?.('Ready', 1);

  return {
    scene,
    lights,
    root: wrapper,
    enemies,
    cameraView,
    playable,
    collisionRoot: playable ? wrapper : null,
    spawn: playable ? { x: 0, y: 20, z: 0 } : undefined,
    update(dt) {
      /* enemies updated by player system when playable */
    },
  };
}
