import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { createProceduralSky } from './sky.js';
import { createLights } from './lights.js';
import { assetUrl } from '../config/assetUrl.js';
import { createAtlasMaterials, prepareFbxRoot } from './atlasMaterials.js';

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
 * Single Asset_List entry as its own explore scene (model at origin).
 */
export async function buildNeighborhoodScene(placement, { loadingManager, onProgress } = {}) {
  const scene = new THREE.Scene();
  scene.name = placement.name;
  scene.background = new THREE.Color(0x7ad8ef);

  const sky = createProceduralSky(800);
  scene.add(sky);

  onProgress?.(`Loading ${placement.name}…`, 0.2);

  const materials = await createAtlasMaterials(loadingManager);
  const fbxLoader = new FBXLoader(loadingManager);
  const root = await fbxLoader.loadAsync(assetUrl(placement.url));
  root.name = placement.name;
  prepareFbxRoot(root, { ...materials, castShadow: true });

  // Show this neighborhood alone at origin (ignore Asset_List world offset).
  const wrapper = new THREE.Group();
  wrapper.name = `${placement.name}_View`;
  wrapper.quaternion.set(
    placement.rotation.x,
    placement.rotation.y,
    placement.rotation.z,
    placement.rotation.w,
  );
  wrapper.scale.set(placement.scale.x, placement.scale.y, placement.scale.z);
  wrapper.add(root);
  scene.add(wrapper);

  const cameraView = cameraViewFromObject(wrapper);
  const lights = createLights(scene, {
    target: cameraView.lookAt,
    castShadow: true,
    sunDistance: Math.max(80, cameraView.orbitDistance),
  });

  onProgress?.('Ready', 1);

  return {
    scene,
    lights,
    root: wrapper,
    cameraView,
    playable: true,
    collisionRoot: wrapper,
    spawn: { x: 0, y: 20, z: 0 },
    update() {},
  };
}
