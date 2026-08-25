import * as THREE from 'three';
import { bindNpcAnimations, loadNpcModel } from '../npc/loadNpc.js';
import { createProceduralSky } from './sky.js';
import { createLights } from './lights.js';

function cameraViewFromObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.5);
  const distance = Math.max(maxDim * 2.4, 4);

  return {
    lookAt: { x: center.x, y: center.y + size.y * 0.1, z: center.z },
    orbitDistance: distance,
    orbitPitch: 18,
    orbitYaw: 35,
    far: Math.max(500, distance * 20),
    minDistance: Math.max(1, maxDim * 0.4),
    maxDistance: Math.max(40, distance * 8),
  };
}

/**
 * Explore-only preview for a single NPC model (idle + optional wave/talk).
 */
export async function buildNpcPreviewScene(
  modelKey,
  { loadingManager, onProgress } = {},
) {
  const scene = new THREE.Scene();
  scene.name = `NPC_${modelKey}`;
  scene.background = new THREE.Color(0x7ad8ef);

  const sky = createProceduralSky(400);
  scene.add(sky);

  onProgress?.(`Loading NPC ${modelKey}…`, 0.25);
  const { root, fbx } = await loadNpcModel(modelKey, loadingManager);
  root.position.set(0, 0, 0);
  scene.add(root);

  onProgress?.('Binding animations…', 0.75);
  const anim = await bindNpcAnimations(fbx, {
    skeleton: 'standard',
    clipKeys: ['idle1', 'wave', 'talk'],
    loadingManager,
  });
  anim.update(1 / 30);

  const cameraView = cameraViewFromObject(root);
  const lights = createLights(scene, {
    target: cameraView.lookAt,
    castShadow: false,
    sunDistance: Math.max(40, cameraView.orbitDistance),
  });

  onProgress?.('Ready', 1);

  return {
    scene,
    lights,
    root,
    anim,
    cameraView,
    playable: false,
    update(dt) {
      anim.update(dt);
    },
  };
}
