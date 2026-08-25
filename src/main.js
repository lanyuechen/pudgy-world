import './styles.css';
import * as THREE from 'three';
import { buildPenguPlazaScene } from './scene/buildScene.js';
import { buildNeighborhoodScene } from './scene/buildNeighborhoodScene.js';
import { buildAssetListScene } from './scene/buildAssetListScene.js';
import { buildTheBergScene } from './scene/buildTheBergScene.js';
import { buildIntroScene } from './scene/buildIntroScene.js';
import { createExploreCamera } from './camera/exploreCamera.js';
import { createPlayerSystem } from './player/createPlayerSystem.js';
import { getSceneOptions, DEFAULT_SCENE_ID, THE_BERG_SCENE_ID } from './config/sceneOptions.js';
import { INTRO } from './config/introConfig.js';
import { remapFbxTextureUrl } from './config/assetUrl.js';
import { createOutlineComposer } from './rendering/outlineComposer.js';
import { syncToonLightDirection } from './rendering/toonMaterial.js';
import { createTraitCustomizer } from './ui/traitCustomizer.js';

const { groups: sceneGroups, flat: sceneOptions } = getSceneOptions();
const optionById = new Map(sceneOptions.map((o) => [o.id, o]));

const canvas = document.getElementById('c');
const loadingEl = document.getElementById('loading');
const loadingBar = document.getElementById('loading-bar');
const loadingStatus = document.getElementById('loading-status');
const selectEl = document.getElementById('scene-select');
const hintEl = document.getElementById('hint');
const configRoot = document.getElementById('config');
const configToggle = document.getElementById('config-toggle');
const configPanel = document.getElementById('config-panel');
const traitsPanel = document.getElementById('traits-panel');
const introSkipEl = document.getElementById('intro-skip');

for (const group of sceneGroups) {
  const og = document.createElement('optgroup');
  og.label = group.label;
  for (const opt of group.options) {
    const el = document.createElement('option');
    el.value = opt.id;
    el.textContent = opt.label;
    og.appendChild(el);
  }
  selectEl.appendChild(og);
}
selectEl.value = DEFAULT_SCENE_ID;

function setConfigOpen(open) {
  configPanel.hidden = !open;
  configToggle.setAttribute('aria-expanded', String(open));
  configToggle.setAttribute('aria-label', open ? 'Close settings' : 'Open settings');
}

configToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  setConfigOpen(configPanel.hidden);
});

document.addEventListener('pointerdown', (e) => {
  if (configPanel.hidden) return;
  if (configRoot.contains(e.target)) return;
  setConfigOpen(false);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !configPanel.hidden) setConfigOpen(false);
});

function setProgress(ratio, status) {
  loadingBar.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
  if (status) loadingStatus.textContent = status;
}

function showLoading(visible) {
  loadingEl.classList.toggle('hidden', !visible);
  if (visible) setProgress(0.02, 'Loading…');
}

const loadingManager = new THREE.LoadingManager();
loadingManager.setURLModifier(remapFbxTextureUrl);
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
let traitCustomizer = null;
let currentId = null;
let switching = false;
const clock = new THREE.Clock();

function bindOutlineComposer(scene) {
  outlineComposer?.dispose();
  outlineComposer = createOutlineComposer(renderer, scene, camera);
  outlineComposer.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
}

function setHint(playable, isIntro = false) {
  if (isIntro) {
    hintEl.textContent = 'Intro · Click Skip or press Space / Enter to continue';
    return;
  }
  hintEl.textContent = playable
    ? 'WASD move · Shift slide · Space jump · F throw · Click fish · Hold drag look · Scroll zoom'
    : 'LMB drag: orbit · RMB / wheel: pan / zoom · Space: reset';
}

function setIntroSkipVisible(visible) {
  if (!introSkipEl) return;
  introSkipEl.hidden = !visible;
}

function finishIntro() {
  if (currentId !== INTRO.id || switching) return;
  loadScene(INTRO.nextSceneId || THE_BERG_SCENE_ID).catch(() => {});
}

function sceneIdFromHash() {
  const hash = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  return optionById.has(hash) ? hash : DEFAULT_SCENE_ID;
}

async function buildScene(option) {
  if (option.isIntro) {
    return buildIntroScene({
      loadingManager,
      onProgress: (msg, ratio = 0.5) => setProgress(ratio, msg),
    });
  }
  if (option.isTheBerg) {
    return buildTheBergScene({
      loadingManager,
      onProgress: (msg, ratio = 0.5) => setProgress(ratio, msg),
    });
  }
  if (option.isAssetList) {
    return buildAssetListScene({
      loadingManager,
      onProgress: (msg, ratio = 0.5) => setProgress(ratio, msg),
    });
  }
  if (option.isPenguPlaza) {
    return buildPenguPlazaScene({
      loadingManager,
      onProgress: (msg, ratio = 0.5) => setProgress(ratio, msg),
    });
  }
  return buildNeighborhoodScene(option.placement, {
    loadingManager,
    onProgress: (msg, ratio = 0.5) => setProgress(ratio, msg),
    // Individuals are playable; Levels + Extras stay explore-only.
    playable: option.group === 'individuals',
  });
}

async function attachPlayer(next) {
  traitCustomizer?.dispose();
  traitCustomizer = null;

  if (playerSystem) {
    playerSystem.dispose();
    playerSystem = null;
  }

  traitsPanel.replaceChildren();
  setIntroSkipVisible(Boolean(next.isIntro));

  if (!next.playable) {
    if (next.isIntro) {
      explore.controls.enabled = false;
      explore.applyView(next.cameraView);
      setHint(false, true);
      return;
    }
    explore.controls.enabled = true;
    explore.applyView(next.cameraView);
    setHint(false);
    return;
  }

  explore.controls.enabled = false;
  if (next.cameraView?.far) {
    camera.far = next.cameraView.far;
    camera.updateProjectionMatrix();
  }
  setProgress(0.92, 'Spawning player…');
  playerSystem = await createPlayerSystem({
    scene: next.scene,
    camera,
    canvas,
    collisionRoot: next.collisionRoot,
    loadingManager,
    fishingHoles: next.fishingHoles ?? null,
    spawn: next.spawn,
  });
  traitCustomizer = createTraitCustomizer(playerSystem.traitEquipper, traitsPanel);
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

introSkipEl?.addEventListener('click', () => {
  finishIntro();
});

selectEl.addEventListener('change', () => {
  loadScene(selectEl.value).catch(() => {});
});

window.addEventListener('hashchange', () => {
  loadScene(sceneIdFromHash(), { pushHash: false }).catch(() => {});
});

window.addEventListener('keydown', (e) => {
  if (world?.isIntro && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) {
    e.preventDefault();
    finishIntro();
    return;
  }
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
    world?.update?.(dt);
  } else if (world?.isIntro) {
    const done = world.update?.(dt, { camera, controls: explore.controls });
    if (done) finishIntro();
  } else {
    explore.controls.update();
    world?.update?.(dt);
  }
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
