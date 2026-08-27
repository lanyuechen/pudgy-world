import './styles.css';
import * as THREE from 'three';
import { buildPenguPlazaScene } from './scene/buildScene.js';
import { buildNeighborhoodScene } from './scene/buildNeighborhoodScene.js';
import { buildAssetListScene } from './scene/buildAssetListScene.js';
import { buildTheBergScene } from './scene/buildTheBergScene.js';
import { buildIntroScene } from './scene/buildIntroScene.js';
import { buildNpcPreviewScene } from './scene/buildNpcPreviewScene.js';
import { createExploreCamera } from './camera/exploreCamera.js';
import { createPlayerSystem } from './player/createPlayerSystem.js';
import { getSceneOptions, DEFAULT_SCENE_ID, THE_BERG_SCENE_ID } from './config/sceneOptions.js';
import { INTRO } from './config/introConfig.js';
import { remapFbxTextureUrl } from './config/assetUrl.js';
import { createOutlineComposer } from './rendering/outlineComposer.js';
import { syncToonLightDirection } from './rendering/toonMaterial.js';
import { createTraitCustomizer } from './ui/traitCustomizer.js';
import { createConfigSectionPanel } from './ui/configSectionPanel.js';
import { createShowcasePreview } from './ui/showcasePreview.js';
import { frameExploreInRightHalf, getSceneBounds, setRightHalfViewOffset } from './ui/configCameraFraming.js';
import {
  createSceneTransition,
  getWorldSlideRoots,
  resetSlideRoots,
} from './ui/sceneTransition.js';

const { flat: sceneOptions, individuals, otherGroups } = getSceneOptions();
const optionById = new Map(sceneOptions.map((o) => [o.id, o]));

const SHOWCASE_GROUP_LABELS = {
  intro: 'Intro',
  neighborhoods: 'World Map',
  npcs: 'NPCs',
  levels: 'Levels',
  extras: 'Extras',
};

const canvas = document.getElementById('c');
const loadingEl = document.getElementById('loading');
const loadingBar = document.getElementById('loading-bar');
const loadingStatus = document.getElementById('loading-status');
const scenePanelEl = document.getElementById('scene-panel');
const showcasePanelEl = document.getElementById('showcase-panel');
const showcaseCanvas = document.getElementById('showcase-canvas');
const showcaseViewportEl = document.getElementById('showcase-viewport');
const hintEl = document.getElementById('hint');
const configToggle = document.getElementById('config-toggle');
const configPanel = document.getElementById('config-panel');
const traitsPanel = document.getElementById('traits-panel');
const introSkipEl = document.getElementById('intro-skip');
const paneScene = document.getElementById('config-pane-scene');
const paneSkin = document.getElementById('config-pane-skin');
const paneShowcase = document.getElementById('config-pane-showcase');
const paneControls = document.getElementById('config-pane-controls');
const skinTabBtn = document.getElementById('config-tab-skin');
const navButtons = [...document.querySelectorAll('.config-nav-btn')];

const scenePanel = createConfigSectionPanel(scenePanelEl, {
  accordion: false,
  sections: [{
    id: 'scenes',
    label: '选择场景',
    openByDefault: true,
    options: individuals.map((opt) => ({ value: opt.id, label: opt.label })),
  }],
  onSelect: (_sectionId, sceneId) => {
    loadScene(sceneId).catch(() => {});
  },
});

/** @type {ReturnType<typeof createShowcasePreview>|null} */
let showcasePreview = null;

const showcasePanel = createConfigSectionPanel(showcasePanelEl, {
  accordion: true,
  sections: otherGroups.map((group, index) => ({
    id: group.id,
    label: SHOWCASE_GROUP_LABELS[group.id] ?? group.label,
    count: group.options.length,
    openByDefault: index === 0,
    options: group.options.map((opt) => ({ value: opt.id, label: opt.label })),
  })),
  onSelect: (_sectionId, optionId) => {
    const option = optionById.get(optionId);
    if (!option) return;
    showcaseSelectedId = optionId;
    showcasePreview?.previewOption(option);
  },
});

function syncScenePickers(id) {
  scenePanel.syncSelection((sectionId) => (sectionId === 'scenes' ? id : ''));
}

function resizeShowcasePreview() {
  if (!showcaseViewportEl || !showcasePreview) return;
  const rect = showcaseViewportEl.getBoundingClientRect();
  showcasePreview.resize(Math.round(rect.width), Math.round(rect.height));
}

syncScenePickers(DEFAULT_SCENE_ID);

/** @type {'scene' | 'skin' | 'showcase' | 'controls'} */
let configTab = 'scene';
let configOpen = false;
/** @type {string|null} */
let showcaseSelectedId = null;
/** @type {null | { kind: 'explore', target: THREE.Vector3, position: THREE.Vector3, enabled: boolean }} */
let exploreViewSnapshot = null;

function setConfigOpen(open) {
  configOpen = open;
  configPanel.hidden = !open;
  configToggle.setAttribute('aria-expanded', String(open));
  configToggle.setAttribute('aria-label', open ? '关闭设置' : '打开设置');
  if (open) {
    applyConfigTab(configTab, { force: true });
  } else {
    clearConfigCamera();
  }
}

function syncNavUi() {
  for (const btn of navButtons) {
    const active = btn.dataset.tab === configTab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  }
  paneScene.hidden = configTab !== 'scene';
  paneSkin.hidden = configTab !== 'skin';
  paneShowcase.hidden = configTab !== 'showcase';
  paneControls.hidden = configTab !== 'controls';
  configPanel.classList.toggle('is-showcase', configTab === 'showcase');
  if (showcaseViewportEl) {
    showcaseViewportEl.setAttribute('aria-hidden', String(configTab !== 'showcase'));
  }
}

function updateSkinTabAvailability() {
  const canSkin = Boolean(playerSystem);
  if (skinTabBtn) {
    skinTabBtn.disabled = !canSkin;
    if (!canSkin && configTab === 'skin') {
      configTab = 'scene';
      syncNavUi();
    }
  }
}

function clearConfigCamera() {
  configPanel.classList.remove('is-showcase');
  if (playerSystem) {
    playerSystem.setConfigMode(null);
  }
  setRightHalfViewOffset(camera, false);
  if (exploreViewSnapshot) {
    explore.controls.target.copy(exploreViewSnapshot.target);
    explore.camera.position.copy(exploreViewSnapshot.position);
    explore.controls.enabled = exploreViewSnapshot.enabled;
    explore.controls.update();
    exploreViewSnapshot = null;
  } else if (!playerSystem && world && !world.isIntro) {
    explore.controls.enabled = true;
  }
}

function applyShowcaseMode() {
  setRightHalfViewOffset(camera, false);
  if (playerSystem) {
    playerSystem.setConfigMode('showcase');
    return;
  }
  if (!exploreViewSnapshot) {
    exploreViewSnapshot = {
      kind: 'explore',
      target: explore.controls.target.clone(),
      position: explore.camera.position.clone(),
      enabled: explore.controls.enabled,
    };
  }
  explore.controls.enabled = false;
}

function applySceneOverviewFraming({ snap = false, fromCurrent = false } = {}) {
  if (transitioning) return;
  const box = getSceneBounds(world);
  if (playerSystem) {
    playerSystem.setConfigMode('scene', { box, snap, fromCurrent });
    return;
  }

  if (!exploreViewSnapshot) {
    exploreViewSnapshot = {
      kind: 'explore',
      target: explore.controls.target.clone(),
      position: explore.camera.position.clone(),
      enabled: explore.controls.enabled,
    };
  }
  explore.controls.enabled = true;
  frameExploreInRightHalf(camera, explore.controls, box);
}

function applyConfigTab(tab, { force = false } = {}) {
  if (!force && tab === configTab && configOpen) {
    // still re-frame after scene switch while open
  }
  configTab = tab;
  syncNavUi();
  if (!configOpen) return;

  if (tab === 'skin') {
    if (!playerSystem) {
      configTab = 'scene';
      syncNavUi();
      applyConfigTab('scene', { force: true });
      return;
    }
    if (exploreViewSnapshot) {
      explore.controls.target.copy(exploreViewSnapshot.target);
      explore.camera.position.copy(exploreViewSnapshot.position);
      explore.controls.enabled = false;
      exploreViewSnapshot = null;
    }
    playerSystem.setConfigMode('skin');
    traitCustomizer?.updateLayout?.();
    return;
  }

  if (tab === 'showcase') {
    applyShowcaseMode();
    showcasePanel.updateLayout();
    resizeShowcasePreview();
    if (showcaseSelectedId) {
      const option = optionById.get(showcaseSelectedId);
      if (option) showcasePreview?.previewOption(option);
    }
    return;
  }

  if (tab === 'controls') {
    if (playerSystem) {
      if (exploreViewSnapshot) {
        explore.controls.target.copy(exploreViewSnapshot.target);
        explore.camera.position.copy(exploreViewSnapshot.position);
        explore.controls.enabled = false;
        exploreViewSnapshot = null;
      }
      playerSystem.setConfigMode('controls');
    } else {
      applySceneOverviewFraming();
    }
    return;
  }

  if (tab === 'scene') {
    scenePanel.updateLayout();
    applySceneOverviewFraming();
  }
}

configToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  setConfigOpen(!configOpen);
});

for (const btn of navButtons) {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    applyConfigTab(/** @type {'scene'|'skin'|'showcase'|'controls'} */ (btn.dataset.tab), {
      force: true,
    });
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && configOpen) {
    e.preventDefault();
    setConfigOpen(false);
  }
});

function setProgress(ratio, status) {
  loadingBar.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
  if (status) loadingStatus.textContent = status;
}

function showLoading(visible) {
  loadingEl.classList.toggle('hidden', !visible);
  if (visible) setProgress(0.02, '加载中…');
}

const loadingManager = new THREE.LoadingManager();
loadingManager.setURLModifier(remapFbxTextureUrl);
loadingManager.onProgress = (_url, loaded, total) => {
  if (!total) return;
  setProgress(0.15 + (loaded / total) * 0.7, `加载资源…（${loaded}/${total}）`);
};
loadingManager.onError = (url) => {
  console.error('Failed to load', url);
};

showcasePreview = createShowcasePreview(showcaseCanvas, loadingManager);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
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
/** True while content is sliding between scenes (camera locked). */
let transitioning = false;
const sceneTransition = createSceneTransition();
const clock = new THREE.Clock();

const SLIDE_OUT_SEC = 0.85;
const SLIDE_IN_SEC = 0.85;

function bindOutlineComposer(scene) {
  outlineComposer?.dispose();
  outlineComposer = createOutlineComposer(renderer, scene, camera);
  outlineComposer.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
}

function setHint(playable, isIntro = false) {
  if (isIntro) {
    hintEl.textContent = '开场动画进行中。点击「跳过开场」，或按 Space / Enter 继续。';
    return;
  }
  if (playable) {
    hintEl.textContent =
      'WASD 移动\nShift 奔跑\nSpace 跳跃\nF 扔雪球\n点击鱼洞钓鱼\n按住左键拖拽旋转视角\n滚轮缩放';
    return;
  }
  hintEl.textContent = '左键拖拽旋转\n右键 / 滚轮平移 / 缩放\nSpace 重置视角';
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
  if (option.isNpcPreview) {
    return buildNpcPreviewScene(option.modelKey, {
      loadingManager,
      onProgress: (msg, ratio = 0.5) => setProgress(ratio, msg),
    });
  }
  return buildNeighborhoodScene(option.placement, {
    loadingManager,
    onProgress: (msg, ratio = 0.5) => setProgress(ratio, msg),
    playable: option.group === 'individuals',
  });
}

async function attachPlayer(next, { syncCamera = true, keepCamera = false } = {}) {
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
      if (!keepCamera) explore.applyView(next.cameraView);
      setHint(false, true);
      updateSkinTabAvailability();
      if (configOpen && !keepCamera) applyConfigTab(configTab, { force: true });
      return;
    }
    explore.controls.enabled = !keepCamera;
    if (!keepCamera) explore.applyView(next.cameraView);
    setHint(false);
    updateSkinTabAvailability();
    if (configOpen && !keepCamera) applyConfigTab(configTab, { force: true });
    return;
  }

  explore.controls.enabled = false;
  if (next.cameraView?.far) {
    camera.far = next.cameraView.far;
    camera.updateProjectionMatrix();
  }
  if (!transitioning) setProgress(0.92, '生成角色…');
  playerSystem = await createPlayerSystem({
    scene: next.scene,
    camera,
    canvas,
    collisionRoot: next.collisionRoot,
    loadingManager,
    fishingHoles: next.fishingHoles ?? null,
    spawn: next.spawn,
    syncCamera,
  });
  traitCustomizer = createTraitCustomizer(playerSystem.traitEquipper, traitsPanel);
  setHint(true);
  updateSkinTabAvailability();
  if (configOpen && !keepCamera) applyConfigTab(configTab, { force: true });
}

function disposeActivePlayer() {
  traitCustomizer?.dispose();
  traitCustomizer = null;
  if (playerSystem) {
    playerSystem.dispose();
    playerSystem = null;
  }
  traitsPanel.replaceChildren();
  updateSkinTabAvailability();
}

async function ensureBuiltScene(option) {
  let next = cache.get(option.id);
  if (!next) {
    next = await buildScene(option);
    cache.set(option.id, next);
  }
  return next;
}

/**
 * Swap in a built world without a slide (first load / fallback).
 */
async function activateWorld(next, id, { pushHash }) {
  disposeActivePlayer();
  world = next;
  currentId = id;
  bindOutlineComposer(next.scene);
  await attachPlayer(next);
  if (pushHash) {
    const nextHash = `#${encodeURIComponent(id)}`;
    if (location.hash !== nextHash) {
      history.replaceState(null, '', nextHash);
    }
  }
}

async function loadScene(id, { pushHash = true, useLoading } = {}) {
  if (!optionById.has(id) || switching) return;
  if (id === currentId && world) return;

  const option = optionById.get(id);
  const showGlobalLoading = useLoading ?? world === null;
  const useSlideTransition = !showGlobalLoading && Boolean(world?.scene);
  switching = true;
  scenePanel.setAllDisabled(true);
  showcasePanel.setAllDisabled(true);
  syncScenePickers(id);
  if (showGlobalLoading) {
    showLoading(true);
    setProgress(0.05, `构建 ${option.label}…`);
  }

  // Drop explore snapshot; will re-frame after load if panel still open.
  exploreViewSnapshot = null;

  /** @type {THREE.Object3D[]} */
  let exitRoots = [];
  /** @type {THREE.Object3D[]} */
  let enterRoots = [];

  try {
    const loadPromise = ensureBuiltScene(option);

    if (useSlideTransition) {
      exitRoots = getWorldSlideRoots(world);
      transitioning = true;
      explore.controls.enabled = false;
      disposeActivePlayer();

      const exitPromise = sceneTransition.slideOut(exitRoots, camera, {
        duration: SLIDE_OUT_SEC,
      });

      const next = await loadPromise;
      enterRoots = getWorldSlideRoots(next);
      resetSlideRoots(enterRoots);

      await exitPromise;
      // Keep old content off-screen until we stop rendering that scene.
      for (const root of exitRoots) root.visible = false;

      // Empty gap: hide new content, swap scene, snap camera to new overview.
      for (const root of enterRoots) root.visible = false;
      world = next;
      currentId = id;
      bindOutlineComposer(next.scene);
      const overviewBox = getSceneBounds(next);
      frameExploreInRightHalf(camera, explore.controls, overviewBox);
      explore.controls.enabled = false;
      try {
        renderer.compile(next.scene, camera);
      } catch {
        // compile is best-effort
      }

      // Place + slide in relative to the already-correct overview camera.
      const prepared = sceneTransition.placeAbove(enterRoots, camera);
      for (const root of enterRoots) root.visible = true;

      await sceneTransition.slideIn(prepared, { duration: SLIDE_IN_SEC });
      resetSlideRoots(enterRoots);

      // Restore cached previous scene for a later revisit.
      for (const root of exitRoots) {
        root.visible = true;
      }
      resetSlideRoots(exitRoots);

      await attachPlayer(next, { syncCamera: false, keepCamera: true });
      transitioning = false;
      // Sync spring-arm / config mode to the pose already snapped in the empty gap.
      if (configOpen && configTab === 'scene') {
        applySceneOverviewFraming({ snap: true });
      } else if (configOpen) {
        applyConfigTab(configTab, { force: true });
      } else {
        applySceneOverviewFraming({ snap: true });
      }
      if (pushHash) {
        const nextHash = `#${encodeURIComponent(id)}`;
        if (location.hash !== nextHash) {
          history.replaceState(null, '', nextHash);
        }
      }
    } else {
      const next = await loadPromise;
      if (showGlobalLoading) setProgress(1, '就绪');
      await activateWorld(next, id, { pushHash });
    }
  } catch (err) {
    console.error(err);
    sceneTransition.cancel();
    transitioning = false;
    for (const root of exitRoots) {
      root.visible = true;
    }
    resetSlideRoots(exitRoots);
    resetSlideRoots(enterRoots);
    if (showGlobalLoading) loadingStatus.textContent = err?.message || String(err);
    throw err;
  } finally {
    switching = false;
    transitioning = false;
    scenePanel.setAllDisabled(false);
    showcasePanel.setAllDisabled(false);
    if (currentId) syncScenePickers(currentId);
    if (showGlobalLoading) showLoading(false);
  }
}

introSkipEl?.addEventListener('click', () => {
  finishIntro();
});

window.addEventListener('hashchange', () => {
  loadScene(sceneIdFromHash(), { pushHash: false }).catch(() => {});
});

window.addEventListener('keydown', (e) => {
  if (configOpen && e.code === 'Escape') return;
  if (world?.isIntro && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) {
    e.preventDefault();
    finishIntro();
    return;
  }
  if (e.code === 'Space' && !playerSystem && !configOpen) {
    e.preventDefault();
    explore.reset();
  }
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (transitioning) {
    sceneTransition.update(dt);
    if (world && !world.isIntro) world.update?.(dt);
  } else if (playerSystem) {
    playerSystem.update(dt);
    world?.update?.(dt);
  } else if (world?.isIntro) {
    const done = world.update?.(dt, { camera, controls: explore.controls });
    if (done) finishIntro();
  } else {
    if (!configOpen || configTab === 'scene' || configTab === 'controls') {
      explore.controls.update();
    }
    world?.update?.(dt);
  }
  if (configOpen && configTab === 'showcase') {
    showcasePreview?.update(dt);
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
  if (configOpen && configTab === 'showcase') resizeShowcasePreview();
  if (configOpen && !transitioning) applyConfigTab(configTab, { force: true });
}
window.addEventListener('resize', onResize);

syncNavUi();
animate();
loadScene(sceneIdFromHash()).catch((err) => {
  console.error(err);
  showLoading(true);
  loadingStatus.textContent = err?.message || String(err);
});
