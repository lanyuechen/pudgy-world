import * as THREE from 'three';
import { INTRO } from '../config/introConfig.js';
import { loadModelRoot } from '../loaders/loadModel.js';
import { createProceduralSky } from './sky.js';
import { createLights } from './lights.js';
import { createWater } from './water.js';
import { createAtlasMaterials, applyAtlasMaterials } from './atlasMaterials.js';
import { loadPlayerModel } from '../player/loadPlayer.js';
import { createToonMaterial } from '../rendering/toonMaterial.js';
import { attachHullOutline } from '../rendering/hullOutline.js';

function findClip(animations, aliases) {
  for (const name of aliases) {
    const hit = animations.find((a) => a.name === name || a.name.endsWith(`|${name}`));
    if (hit) return hit;
  }
  const lower = aliases.map((a) => a.toLowerCase());
  return animations.find((a) => lower.some((n) => a.name.toLowerCase().includes(n))) ?? null;
}

function playLoop(fbx, animations, aliases, speed = 1) {
  const clip = findClip(animations, aliases);
  if (!clip) {
    console.warn('[intro] missing clip', aliases);
    return null;
  }
  const mixer = new THREE.AnimationMixer(fbx);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.clampWhenFinished = false;
  action.setEffectiveTimeScale(speed);
  action.play();
  return mixer;
}

function tintMaterials(root, colorHex) {
  const tint = new THREE.Color(colorHex);
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (mat?.color) mat.color.multiply(tint);
    }
  });
}

async function loadFish(loadingManager) {
  const fbx = await loadModelRoot(INTRO.fishFbx, { loadingManager });
  const mat = createToonMaterial({ color: 0x7ec8ff });
  fbx.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.material = mat.clone();
    attachHullOutline(child);
  });
  fbx.scale.multiplyScalar(0.45);
  return fbx;
}

/**
 * Lightweight intro vignette (explore-only).
 * Original IntroScene FBXs are unsupported FBX 6100 — this approximates
 * Idle/Fishing loops with player clips on a TheBerg shell.
 */
export async function buildIntroScene({ loadingManager, onProgress } = {}) {
  const scene = new THREE.Scene();
  scene.name = 'Intro';
  scene.background = new THREE.Color(0x7ad8ef);

  const sky = createProceduralSky(1200);
  scene.add(sky);

  const stagePos = INTRO.stage.position;
  const lights = createLights(scene, {
    target: { x: stagePos.x, y: 2, z: stagePos.z },
    castShadow: true,
    sunDistance: 80,
  });

  const water = createWater();
  water.mesh.position.set(stagePos.x + 8, -1.2, stagePos.z + 6);
  water.mesh.scale.setScalar(8);
  scene.add(water.mesh);

  onProgress?.('Loading intro berg…', 0.15);
  const materials = await createAtlasMaterials(loadingManager);
  const berg = await loadModelRoot(INTRO.bergFbx, { loadingManager });
  applyAtlasMaterials(berg, { ...materials, castShadow: false });
  scene.add(berg);

  const stage = new THREE.Group();
  stage.name = 'Intro_Stage';
  stage.position.set(stagePos.x, stagePos.y, stagePos.z);
  scene.add(stage);

  onProgress?.('Loading pudgies…', 0.45);
  const [pudgy, peaches] = await Promise.all([
    loadPlayerModel(loadingManager),
    loadPlayerModel(loadingManager),
  ]);

  pudgy.root.name = 'Intro_Pudgy';
  pudgy.root.position.set(INTRO.stage.pudgy.x, INTRO.stage.pudgy.y, INTRO.stage.pudgy.z);
  pudgy.root.rotation.y = THREE.MathUtils.degToRad(INTRO.stage.pudgy.yawDeg);
  stage.add(pudgy.root);

  peaches.root.name = 'Intro_Peaches';
  peaches.root.position.set(INTRO.stage.peaches.x, INTRO.stage.peaches.y, INTRO.stage.peaches.z);
  peaches.root.rotation.y = THREE.MathUtils.degToRad(INTRO.stage.peaches.yawDeg);
  tintMaterials(peaches.root, 0xffc9b0);
  stage.add(peaches.root);

  const fishingAliases = [
    'Armature|FishingHoldingRodIdle',
    'FishingHoldingRodIdle',
    'Armature|FishingIdle',
    'FishingIdle',
  ];
  const mixers = [
    playLoop(pudgy.fbx, pudgy.animations, fishingAliases, 1),
    playLoop(peaches.fbx, peaches.animations, fishingAliases, 0.95),
  ].filter(Boolean);

  onProgress?.('Loading fish…', 0.75);
  let fish = null;
  try {
    fish = await loadFish(loadingManager);
    fish.name = 'Intro_Fish';
    fish.position.set(INTRO.stage.fish.x, INTRO.stage.fish.y, INTRO.stage.fish.z);
    stage.add(fish);
  } catch (err) {
    console.warn('[intro] fish load failed', err);
  }

  const look = {
    x: stagePos.x + INTRO.camera.lookAt.x,
    y: stagePos.y + INTRO.camera.lookAt.y,
    z: stagePos.z + INTRO.camera.lookAt.z,
  };

  let elapsed = 0;
  let yaw = INTRO.camera.orbitYaw;

  onProgress?.('Ready', 1);

  return {
    scene,
    lights,
    water,
    cameraView: {
      lookAt: look,
      orbitDistance: INTRO.camera.orbitDistance,
      orbitPitch: INTRO.camera.orbitPitch,
      orbitYaw: yaw,
      far: INTRO.camera.far,
      minDistance: INTRO.camera.minDistance,
      maxDistance: INTRO.camera.maxDistance,
    },
    playable: false,
    isIntro: true,
    durationSec: INTRO.durationSec,
    update(dt, { camera, controls } = {}) {
      elapsed += dt;
      for (const mixer of mixers) mixer.update(dt);
      water.update(dt);

      if (fish) {
        fish.position.y = INTRO.stage.fish.y + Math.sin(elapsed * 2.2) * 0.12;
        fish.rotation.y = elapsed * 0.8;
      }

      yaw += INTRO.camera.yawSpeed * dt;
      const pitch = THREE.MathUtils.degToRad(INTRO.camera.orbitPitch);
      const yawRad = THREE.MathUtils.degToRad(yaw);
      const d = INTRO.camera.orbitDistance;
      const target = new THREE.Vector3(look.x, look.y, look.z);
      if (controls) controls.target.copy(target);
      if (camera) {
        camera.position.set(
          look.x + Math.sin(yawRad) * Math.cos(pitch) * d,
          look.y + Math.sin(pitch) * d,
          look.z + Math.cos(yawRad) * Math.cos(pitch) * d,
        );
        camera.lookAt(target);
        camera.far = INTRO.camera.far;
        camera.updateProjectionMatrix();
      }

      return elapsed >= INTRO.durationSec;
    },
  };
}
