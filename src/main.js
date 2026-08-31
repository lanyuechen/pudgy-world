import './styles.css';
import * as THREE from 'three';
import { buildPenguPlazaScene } from './scene/buildScene.js';
import { buildNeighborhoodScene } from './scene/buildNeighborhoodScene.js';
import { buildAssetListScene } from './scene/buildAssetListScene.js';
import { buildTheBergScene } from './scene/buildTheBergScene.js';
import { buildNpcPreviewScene } from './scene/buildNpcPreviewScene.js';
import { createExploreCamera } from './camera/exploreCamera.js';
import { createPlayerSystem } from './player/createPlayerSystem.js';
import { getSceneOptions, DEFAULT_SCENE_ID, THE_BERG_SCENE_ID } from './config/sceneOptions.js';
import { remapFbxTextureUrl } from './config/assetUrl.js';
import { createOutlineComposer } from './rendering/outlineComposer.js';
import { updateHullOutlineViewport } from './rendering/hullOutline.js';
import { syncToonLightDirection } from './rendering/toonMaterial.js';
import { createTraitCustomizer } from './ui/traitCustomizer.js';
import { createConfigSectionPanel } from './ui/configSectionPanel.js';
import { createShowcasePreview } from './ui/showcasePreview.js';
import { createAnimPreview } from './ui/animPreview.js';
import { createPlayerPortrait } from './ui/playerPortrait.js';
import { createGameSettingsPanel } from './ui/gameSettingsPanel.js';
import { createSkillInfoPanel } from './ui/skillInfoPanel.js';
import { applyGameSettings, loadGameSettings } from './config/gameSettings.js';
import { getAnimOptions } from './config/animConfig.js';
import { frameExploreInRightHalf, getSceneBounds, setRightHalfViewOffset } from './ui/configCameraFraming.js';
import {
  createSceneTransition,
  getWorldSlideRoots,
  resetSlideRoots,
} from './ui/sceneTransition.js';

const { flat: sceneOptions, individuals, otherGroups } = getSceneOptions();
const optionById = new Map(sceneOptions.map((o) => [o.id, o]));
const { groups: animGroups, byId: animById } = getAnimOptions();

const SHOWCASE_GROUP_LABELS = {
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
const animPanelEl = document.getElementById('anim-panel');
const showcaseCanvas = document.getElementById('showcase-canvas');
const animCanvas = document.getElementById('anim-canvas');
const animStatusEl = document.getElementById('anim-preview-status');
const showcaseViewportEl = document.getElementById('showcase-viewport');
const hintEl = document.getElementById('hint');
const configToggle = document.getElementById('config-toggle');
const configToggleAvatarCanvas = document.getElementById('config-toggle-avatar-canvas');
/** @type {ReturnType<typeof createPlayerPortrait> | null} */
let configAvatarPortrait = null;
const configPanel = document.getElementById('config-panel');
const traitsPanel = document.getElementById('traits-panel');
const paneScene = document.getElementById('config-pane-scene');
const paneSkin = document.getElementById('config-pane-skin');
const paneShowcase = document.getElementById('config-pane-showcase');
const paneAnim = document.getElementById('config-pane-anim');
const paneControls = document.getElementById('config-pane-controls');
const paneSkills = document.getElementById('config-pane-skills');
const paneSettings = document.getElementById('config-pane-settings');
const skillsPanelEl = document.getElementById('skills-panel');
const settingsPanelEl = document.getElementById('settings-panel');
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
/** @type {ReturnType<typeof createAnimPreview>|null} */
let animPreview = null;
/** @type {ReturnType<typeof createGameSettingsPanel>|null} */
let gameSettingsPanel = null;
let skillInfoPanel = null;

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
    resizePreviewViewport();
    showcasePreview?.previewOption(option);
  },
});

const animPanel = createConfigSectionPanel(animPanelEl, {
  accordion: true,
  sections: animGroups.map((group, index) => ({
    id: group.id,
    label: group.label,
    count: group.options.length,
    openByDefault: index === 0,
    options: group.options.map((opt) => ({ value: opt.id, label: opt.label })),
  })),
  onSelect: (_sectionId, optionId) => {
    const option = animById.get(optionId);
    if (!option) return;
    animSelectedId = optionId;
    animPreview?.previewAnim(option);
  },
});

function syncScenePickers(id) {
  scenePanel.syncSelection((sectionId) => (sectionId === 'scenes' ? id : ''));
}

function resizePreviewViewport() {
  if (!showcaseViewportEl) return;
  const rect = showcaseViewportEl.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (configTab === 'showcase') showcasePreview?.resize(w, h);
  if (configTab === 'anim') animPreview?.resize(w, h);
}

syncScenePickers(DEFAULT_SCENE_ID);

/** @type {'scene' | 'skin' | 'showcase' | 'anim' | 'controls' | 'settings'} */
let configTab = 'scene';
let configOpen = false;
/** @type {string|null} */
let showcaseSelectedId = null;
/** @type {string|null} */
let animSelectedId = null;
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
  paneAnim.hidden = configTab !== 'anim';
  paneControls.hidden = configTab !== 'controls';
  paneSkills.hidden = configTab !== 'skills';
  paneSettings.hidden = configTab !== 'settings';
  const previewOpen = configTab === 'showcase' || configTab === 'anim';
  configPanel.classList.toggle('is-showcase', configTab === 'showcase');
  configPanel.classList.toggle('is-anim', configTab === 'anim');
  if (showcaseViewportEl) {
    showcaseViewportEl.setAttribute('aria-hidden', String(!previewOpen));
  }
  if (showcaseCanvas) showcaseCanvas.hidden = configTab !== 'showcase';
  if (animCanvas) animCanvas.hidden = configTab !== 'anim';
  if (animStatusEl) animStatusEl.hidden = configTab !== 'anim';
  animPreview?.setActive(configTab === 'anim');
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
  configPanel.classList.remove('is-showcase', 'is-anim');
  animPreview?.setActive(false);
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
  } else if (!playerSystem && world) {
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resizePreviewViewport();
        if (showcaseSelectedId) {
          const option = optionById.get(showcaseSelectedId);
          if (option) showcasePreview?.previewOption(option);
        }
      });
    });
    return;
  }

  if (tab === 'anim') {
    applyShowcaseMode();
    animPanel.updateLayout();
    // Two frames: panel → 100vw, then flex viewport gets non-zero size.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resizePreviewViewport();
        const option =
          (animSelectedId && animById.get(animSelectedId)) ||
          animGroups[0]?.options?.[0] ||
          null;
        if (option) {
          animSelectedId = option.id;
          animPanel.syncSelection((sectionId) =>
            sectionId === option.group ? option.id : '',
          );
          animPreview?.previewAnim(option);
        } else {
          animPreview?.ensurePlayer?.();
        }
      });
    });
    return;
  }

  if (tab === 'controls' || tab === 'settings' || tab === 'skills') {
    if (playerSystem) {
      if (exploreViewSnapshot) {
        explore.controls.target.copy(exploreViewSnapshot.target);
        explore.camera.position.copy(exploreViewSnapshot.position);
        explore.controls.enabled = false;
        exploreViewSnapshot = null;
      }
      playerSystem.setConfigMode(
        tab === 'settings' ? 'settings' : tab === 'skills' ? 'skills' : 'controls',
      );
    } else {
      applySceneOverviewFraming();
    }
    if (tab === 'settings') gameSettingsPanel?.refresh();
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
    applyConfigTab(
      /** @type {'scene'|'skin'|'showcase'|'anim'|'controls'|'skills'|'settings'} */ (btn.dataset.tab),
      {
        force: true,
      },
    );
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
animPreview = createAnimPreview(animCanvas, loadingManager, { statusEl: animStatusEl });

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

if (settingsPanelEl) {
  gameSettingsPanel = createGameSettingsPanel(settingsPanelEl, {
    exploreControls: explore.controls,
  });
} else {
  applyGameSettings(loadGameSettings());
}

if (skillsPanelEl) {
  skillInfoPanel = createSkillInfoPanel(skillsPanelEl);
}

/** Outline composer is bound per active scene (normals + color Roberts, Unity Outlines). */
let outlineComposer = null;

/** @type {Map<string, object>} */
const cache = new Map();

function disposeObject3D(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose?.();
    const mats = obj.material
      ? Array.isArray(obj.material)
        ? obj.material
        : [obj.material]
      : [];
    for (const m of mats) {
      if (!m) continue;
      for (const key of Object.keys(m)) {
        const v = m[key];
        if (v && v.isTexture) v.dispose?.();
      }
      m.dispose?.();
    }
  });
}

/** Drop GPU resources for a built world entry (scene-scoped lazy load). */
function disposeBuiltWorld(entry) {
  if (!entry || entry.__disposed) return;
  entry.__disposed = true;
  try {
    entry.enemies?.dispose?.();
  } catch {
    // ignore
  }
  try {
    entry.dispose?.();
  } catch {
    // ignore
  }
  if (entry.scene) {
    disposeObject3D(entry.scene);
    entry.scene.clear();
  }
}

/** Keep only the active scene in memory — revisit reloads (HTTP/CDN cache helps). */
function evictOtherScenes(keepId) {
  for (const [id, entry] of cache) {
    if (id === keepId) continue;
    disposeBuiltWorld(entry);
    cache.delete(id);
  }
}
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
  const pr = renderer.getPixelRatio();
  outlineComposer.setSize(window.innerWidth, window.innerHeight, pr);
  updateHullOutlineViewport(window.innerWidth, window.innerHeight, pr);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderKeyTokens(tokens) {
  return tokens
    .map((token) => {
      if (token === '+') return '<span class="controls-sep">+</span>';
      if (token === '/') return '<span class="controls-sep">/</span>';
      return `<kbd>${escapeHtml(token)}</kbd>`;
    })
    .join('');
}

/**
 * @param {{ note?: string, groups: Array<{ title: string, rows: Array<{ keys: string[], desc: string }> }> }} guide
 */
function renderControlsGuide(guide) {
  if (!hintEl) return;
  const parts = [];
  if (guide.note) {
    parts.push(`<p class="controls-guide-note">${escapeHtml(guide.note)}</p>`);
  }
  for (const group of guide.groups) {
    const rows = group.rows
      .map(
        (row) =>
          `<li><span class="controls-keys">${renderKeyTokens(row.keys)}</span><span class="controls-desc">${escapeHtml(row.desc)}</span></li>`,
      )
      .join('');
    parts.push(
      `<section class="controls-group"><p class="controls-group-title">${escapeHtml(group.title)}</p><ul class="controls-list">${rows}</ul></section>`,
    );
  }
  hintEl.innerHTML = parts.join('');
}

function setHint(playable) {
  if (playable) {
    renderControlsGuide({
      groups: [
        {
          title: '移动',
          rows: [
            { keys: ['W', 'A', 'S', 'D'], desc: '移动' },
            { keys: ['Shift'], desc: '奔跑' },
            { keys: ['Space'], desc: '跳跃' },
          ],
        },
        {
          title: '雪球',
          rows: [
            { keys: ['按住左键'], desc: '蓄力投掷' },
            { keys: ['左右拖动'], desc: '调整投掷方向' },
            { keys: ['上下拖动'], desc: '调节投掷角度' },
            { keys: ['松开左键'], desc: '投出雪球' },
            { keys: ['F'], desc: '快速投掷' },
          ],
        },
        {
          title: '视角',
          rows: [
            { keys: ['拖拽左键'], desc: '旋转视角' },
            { keys: ['滚轮'], desc: '缩放镜头' },
          ],
        },
        {
          title: '互动',
          rows: [{ keys: ['点击鱼洞'], desc: '开始钓鱼' }],
        },
      ],
    });
    return;
  }
  renderControlsGuide({
    groups: [
      {
        title: '浏览',
        rows: [
          { keys: ['左键拖拽'], desc: '旋转视角' },
          { keys: ['右键', '/', '滚轮'], desc: '平移 / 缩放' },
          { keys: ['Space'], desc: '重置视角' },
        ],
      },
    ],
  });
}

function sceneIdFromHash() {
  const hash = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  // Legacy bookmarks
  if (hash === 'WorldMap' || hash === 'Intro') return THE_BERG_SCENE_ID;
  return optionById.has(hash) ? hash : DEFAULT_SCENE_ID;
}

async function buildScene(option) {
  if (option.isTheBerg) {
    return buildTheBergScene({
      map: option.bergMap,
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

function bindConfigAvatar(source) {
  if (!configToggleAvatarCanvas) return;
  if (!configAvatarPortrait) {
    configAvatarPortrait = createPlayerPortrait(configToggleAvatarCanvas, source ?? null);
  } else {
    configAvatarPortrait.setSource(source ?? null);
  }
}

function clearConfigAvatar() {
  configAvatarPortrait?.setSource(null);
}

async function attachPlayer(next, { syncCamera = true, keepCamera = false } = {}) {
  traitCustomizer?.dispose();
  traitCustomizer = null;

  if (playerSystem) {
    playerSystem.dispose();
    playerSystem = null;
  }
  clearConfigAvatar();

  traitsPanel.replaceChildren();

  if (!next.playable) {
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
    enemies: next.enemies ?? null,
    spawn: next.spawn,
    syncCamera,
  });
  bindConfigAvatar(playerSystem.fbx);
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
  clearConfigAvatar();
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
  animPanel.setAllDisabled(true);
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
      evictOtherScenes(id);
    } else {
      const next = await loadPromise;
      if (showGlobalLoading) setProgress(1, '就绪');
      await activateWorld(next, id, { pushHash });
      evictOtherScenes(id);
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
    animPanel.setAllDisabled(false);
    if (currentId) syncScenePickers(currentId);
    if (showGlobalLoading) showLoading(false);
  }
}

window.addEventListener('hashchange', () => {
  loadScene(sceneIdFromHash(), { pushHash: false }).catch(() => {});
});

window.addEventListener('keydown', (e) => {
  if (configOpen && e.code === 'Escape') return;
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
    world?.update?.(dt);
  } else if (playerSystem) {
    playerSystem.update(dt);
    configAvatarPortrait?.update();
    world?.update?.(dt);
  } else {
    if (!configOpen || configTab === 'scene' || configTab === 'controls' || configTab === 'skills' || configTab === 'settings') {
      explore.controls.update();
    }
    world?.update?.(dt);
  }
  if (configOpen && configTab === 'showcase') {
    showcasePreview?.update(dt);
  }
  if (configOpen && configTab === 'anim') {
    animPreview?.update(dt);
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
  const pr = renderer.getPixelRatio();
  outlineComposer?.setSize(window.innerWidth, window.innerHeight, pr);
  updateHullOutlineViewport(window.innerWidth, window.innerHeight, pr);
  if (configOpen && (configTab === 'showcase' || configTab === 'anim')) {
    resizePreviewViewport();
  }
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
