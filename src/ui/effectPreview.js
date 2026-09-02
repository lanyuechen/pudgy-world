/**
 * In-panel Quarks VFX preview for the 特效 tab — same layout as 橱窗.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BatchedRenderer, QuarksLoader, QuarksUtil } from 'three.quarks';
import { assetUrl } from '../config/assetUrl.js';
import { createLights } from '../scene/lights.js';
import { syncToonLightDirection } from '../rendering/toonMaterial.js';
import { applyPreviewCanvasSize, syncPreviewCanvasSize } from './previewCanvasSize.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {THREE.LoadingManager} loadingManager
 * @param {{ statusEl?: HTMLElement | null }} [opts]
 */
export function createEffectPreview(canvas, loadingManager, { statusEl = null } = {}) {
  const getPixelRatio = () => Math.min(window.devicePixelRatio, 2);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(getPixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
  camera.position.set(5.6, 4.4, 8.4);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1;
  controls.maxDistance = 40;
  controls.target.set(0, 1, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;
  controls.update();

  const { sun } = createLights(scene);
  sun.castShadow = false;

  const batchedRenderer = new BatchedRenderer();
  batchedRenderer.name = 'EffectPreviewBatch';
  scene.add(batchedRenderer);

  const loader = new QuarksLoader(loadingManager);
  const fileLoader = new THREE.FileLoader(loadingManager);
  fileLoader.setResponseType('json');

  /** @type {Map<string, object>} */
  const jsonCache = new Map();
  /** @type {THREE.Object3D|null} */
  let activeInstance = null;
  /** @type {string|null} */
  let selectedId = null;
  let busy = false;
  let active = false;
  let replayAccum = 0;
  let replayInterval = 2.4;

  const canvasCtx = () => ({ canvas, renderer, camera, getPixelRatio });

  function setStatus(msg) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
  }

  function syncCanvasSize() {
    return syncPreviewCanvasSize(canvasCtx());
  }

  function clearActive() {
    if (!activeInstance) return;
    QuarksUtil.stop(activeInstance);
    QuarksUtil.runOnAllParticleEmitters(activeInstance, (ps) => {
      batchedRenderer.deleteSystem(ps.system);
    });
    activeInstance.removeFromParent();
    activeInstance = null;
    replayAccum = 0;
  }

  async function loadJson(option) {
    const cached = jsonCache.get(option.id);
    if (cached) return cached;
    const url = assetUrl(option.path);
    const json = await new Promise((resolve, reject) => {
      fileLoader.load(url, resolve, undefined, reject);
    });
    jsonCache.set(option.id, json);
    return json;
  }

  /** Fresh parse each play — Object3D.clone breaks EmitSubParticleSystem links. */
  function spawnFromJson(json) {
    clearActive();
    const instance = loader.parse(JSON.parse(JSON.stringify(json)));
    instance.position.set(0, 1, 0);
    instance.visible = true;
    scene.add(instance);
    QuarksUtil.addToBatchRenderer(instance, batchedRenderer);
    QuarksUtil.play(instance);
    activeInstance = instance;
    replayAccum = 0;

    let maxDuration = 1.5;
    QuarksUtil.runOnAllParticleEmitters(instance, (ps) => {
      const d = Number(ps.system?.duration) || 0;
      if (d > maxDuration) maxDuration = d;
    });
    replayInterval = Math.max(2.2, maxDuration + 0.6);
  }

  /**
   * @param {{ id: string, label: string, path: string }} option
   */
  async function previewEffect(option) {
    if (!option?.id) return;
    selectedId = option.id;
    setStatus(`加载 ${option.label}…`);
    busy = true;
    try {
      const json = await loadJson(option);
      if (selectedId !== option.id) return;
      spawnFromJson(json);
      setStatus(option.label);
    } catch (err) {
      console.error('[effect-preview]', err);
      setStatus(err?.message || String(err));
    } finally {
      busy = false;
    }
  }

  function setActive(next) {
    active = Boolean(next);
    if (!active) {
      clearActive();
      setStatus('');
    } else {
      syncCanvasSize();
    }
  }

  function resize(width, height) {
    applyPreviewCanvasSize(canvasCtx(), width, height);
  }

  function update(dt) {
    if (!active) return;
    syncCanvasSize();
    controls.update();
    if (sun) syncToonLightDirection(scene, sun);

    if (activeInstance && !busy) {
      replayAccum += dt;
      if (replayAccum >= replayInterval) {
        QuarksUtil.restart(activeInstance);
        replayAccum = 0;
      }
    }

    batchedRenderer.update(dt);
    renderer.render(scene, camera);
  }

  function dispose() {
    clearActive();
    jsonCache.clear();
    batchedRenderer.removeFromParent();
    controls.dispose();
    renderer.dispose();
  }

  return {
    previewEffect,
    setActive,
    resize,
    update,
    dispose,
  };
}
