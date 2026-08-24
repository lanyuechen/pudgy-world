import './styles.css';
import * as THREE from 'three';
import { buildPenguPlazaScene } from './scene/buildScene.js';
import { buildNeighborhoodScene } from './scene/buildNeighborhoodScene.js';
import { createExploreCamera } from './camera/exploreCamera.js';
import { createPlayerSystem } from './player/createPlayerSystem.js';
import { getSceneOptions, DEFAULT_SCENE_ID } from './config/sceneOptions.js';
import { createOutlineComposer } from './rendering/outlineComposer.js';
import { syncToonLightDirection } from './rendering/toonMaterial.js';

const sceneOptions = getSceneOptions();
const optionById = new Map(sceneOptions.map((o) => [o.id, o]));

const canvas = document.getElementById('c');
const loadingEl = document.getElementById('loading');
const loadingBar = document.getElementById('loading-bar');
const loadingStatus = document.getElementById('loading-status');
const selectEl = document.getElementById('scene-select');
const hintEl = document.getElementById('hint');

for (const opt of sceneOptions) {
  const el = document.createElement('option');
  el.value = opt.id;
  el.textContent = opt.label;
  selectEl.appendChild(el);
}
selectEl.value = DEFAULT_SCENE_ID;

function setProgress(ratio, status) {
  loadingBar.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
  if (status) loadingStatus.textContent = status;
}

function showLoading(visible) {
  loadingEl.classList.toggle('hidden', !visible);
  if (visible) setProgress(0.02, 'Loading…');
}

const loadingManager = new THREE.LoadingManager();
loadingManager.onProgress = (_url, loaded, total) => {
  if (!total) return;
  setProgress(0.15 + (loaded / total) * 0.7, `Loading assets… (${loaded}/${total})`);
};
loadingManager.onError = (url) => {
  console.error('Failed to load', url);
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Plaza SampleSceneProfile tonemapping is inactive; Unlit toon looks closest without ACES washout
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const explore = createExploreCamera(canvas);
const camera = explore.camera;

/** Outline composer is bound per active scene (normals + color Roberts, Unity Outlines). */
let outlineComposer = null;

/** @type {Map<string, object>} */
const cache = new Map();
let world = null;
let playerSystem = null;
let currentId = null;
let switching = false;
const clock = new THREE.Clock();

function bindOutlineComposer(scene) {
  outlineComposer?.dispose();
  outlineComposer = createOutlineComposer(renderer, scene, camera);
  outlineComposer.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
}

function setHint(playable) {
  hintEl.textContent = playable
    ? 'WASD move · Shift slide · Space jump · Hold LMB look'
    : 'LMB drag: orbit · RMB / wheel: pan / zoom · Space: reset';
}

function sceneIdFromHash() {
  const hash = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  return optionById.has(hash) ? hash : DEFAULT_SCENE_ID;
}

async function buildScene(option) {
  if (option.isPenguPlaza) {
    return buildPenguPlazaScene({
      loadingManager,
      onProgress: (msg, ratio = 0.5) => setProgress(ratio, msg),
    });
  }
  return buildNeighborhoodScene(option.placement, {
    loadingManager,
    onProgress: (msg, ratio = 0.5) => setProgress(ratio, msg),
  });
}

async function attachPlayer(next) {
  if (playerSystem) {
    playerSystem.dispose();
    playerSystem = null;
  }

  if (!next.playable) {
    explore.controls.enabled = true;
    explore.applyView(next.cameraView);
    setHint(false);
    return;
  }

  explore.controls.enabled = false;
  setProgress(0.92, 'Spawning player…');
  playerSystem = await createPlayerSystem({
    scene: next.scene,
    camera,
    canvas,
    collisionRoot: next.collisionRoot,
    loadingManager,
    spawn: next.spawn,
  });
  setHint(true);
}

async function loadScene(id, { pushHash = true } = {}) {
  if (!optionById.has(id) || switching) return;
  if (id === currentId && world) return;

  const option = optionById.get(id);
  switching = true;
  selectEl.disabled = true;
  selectEl.value = id;
  showLoading(true);
  setProgress(0.05, `Building ${option.label}…`);

  try {
    let next = cache.get(id);
    if (!next) {
      next = await buildScene(option);
      cache.set(id, next);
    }

    // Drop previous player when leaving a cached playable scene; re-attach on enter.
    if (playerSystem) {
      playerSystem.dispose();
      playerSystem = null;
    }

    world = next;
    currentId = id;
    bindOutlineComposer(next.scene);
    await attachPlayer(next);
    setProgress(1, 'Ready');
    if (pushHash) {
      const nextHash = `#${encodeURIComponent(id)}`;
      if (location.hash !== nextHash) {
        history.replaceState(null, '', nextHash);
      }
    }
  } catch (err) {
    console.error(err);
    loadingStatus.textContent = err?.message || String(err);
    throw err;
  } finally {
    switching = false;
    selectEl.disabled = false;
    if (currentId) selectEl.value = currentId;
    showLoading(false);
  }
}

selectEl.addEventListener('change', () => {
  loadScene(selectEl.value).catch(() => {});
});

window.addEventListener('hashchange', () => {
  loadScene(sceneIdFromHash(), { pushHash: false }).catch(() => {});
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !playerSystem) {
    e.preventDefault();
    explore.reset();
  }
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (playerSystem) {
    playerSystem.update(dt);
  } else {
    explore.controls.update();
  }
  world?.update?.(dt);
  if (world?.scene) {
    if (world.lights?.sun) {
      syncToonLightDirection(world.scene, world.lights.sun);
    }
    if (outlineComposer) outlineComposer.render();
    else renderer.render(world.scene, camera);
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  outlineComposer?.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
}
window.addEventListener('resize', onResize);

animate();
loadScene(sceneIdFromHash()).catch((err) => {
  console.error(err);
  showLoading(true);
  loadingStatus.textContent = err?.message || String(err);
});
