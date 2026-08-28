/**
 * Fullscreen 动画 tab preview — default player mesh + selected external clip.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadModelRoot } from '../loaders/loadModel.js';
import { sanitizeCharacterClip } from '../loaders/sanitizeCharacterClip.js';
import { loadPlayerModel } from '../player/loadPlayer.js';
import { createLights } from '../scene/lights.js';
import { syncToonLightDirection } from '../rendering/toonMaterial.js';
import { applyPreviewCanvasSize, syncPreviewCanvasSize } from './previewCanvasSize.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {THREE.LoadingManager} loadingManager
 * @param {{ statusEl?: HTMLElement | null }} [opts]
 */
export function createAnimPreview(canvas, loadingManager, { statusEl = null } = {}) {
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
  camera.position.set(3.5, 2.2, 5.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1;
  controls.maxDistance = 40;
  controls.target.set(0, 1, 0);
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.45;
  controls.update();

  /** @type {THREE.DirectionalLight|null} */
  let sun = null;
  /** @type {THREE.Group|null} */
  let playerRoot = null;
  /** @type {THREE.Object3D|null} */
  let playerFbx = null;
  /** @type {THREE.AnimationClip[]} */
  let embeddedClips = [];
  /** @type {THREE.AnimationMixer|null} */
  let mixer = null;
  /** @type {THREE.AnimationAction|null} */
  let currentAction = null;
  /** @type {Map<string, THREE.AnimationClip[]>} */
  const clipCache = new Map();
  let busy = false;
  let active = false;
  /** @type {string|null} */
  let selectedId = null;
  /** @type {Promise<void>|null} */
  let playerLoadPromise = null;

  const canvasCtx = () => ({ canvas, renderer, camera, getPixelRatio });

  function setStatus(msg) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
  }

  /** @returns {boolean} true when the drawing buffer size changed */
  function syncCanvasSize() {
    return syncPreviewCanvasSize(canvasCtx());
  }

  function framePlayer() {
    if (!playerRoot) return;
    playerRoot.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(playerRoot);
    if (box.isEmpty()) return;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const dist = Math.max(maxDim * 2.4, 4);
    center.y += size.y * 0.05;
    controls.target.copy(center);
    // Player rest pose faces -Z; orbit from +Z so the belly faces the viewer.
    camera.position.set(center.x + dist * 0.55, center.y + dist * 0.35, center.z + dist * 0.85);
    controls.minDistance = Math.max(1, maxDim * 0.4);
    controls.maxDistance = Math.max(20, dist * 4);
    camera.near = Math.max(0.05, dist / 200);
    camera.far = Math.max(200, dist * 20);
    camera.updateProjectionMatrix();
    controls.update();

    if (sun) {
      sun.position.set(center.x + 10, center.y + 16, center.z + 8);
      sun.target.position.copy(center);
      sun.target.updateMatrixWorld();
    }
  }

  /** Keep skinned mesh in a valid pose when no catalog clip is playing. */
  function playEmbeddedIdle() {
    if (!mixer || !playerFbx) return;
    const idle =
      embeddedClips.find((c) => /idle/i.test(c.name) && !/afk|fish|throw|walk|slide|air|jump/i.test(c.name)) ??
      embeddedClips.find((c) => /idle/i.test(c.name)) ??
      embeddedClips[0];
    if (!idle) {
      playerFbx.traverse((child) => {
        if (child.isSkinnedMesh && child.skeleton) {
          child.skeleton.pose();
          child.skeleton.update();
        }
      });
      return;
    }
    mixer.stopAllAction();
    const action = mixer.clipAction(sanitizeCharacterClip(idle));
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    currentAction = action;
  }

  async function ensurePlayer() {
    if (playerRoot) return;
    if (playerLoadPromise) {
      await playerLoadPromise;
      return;
    }
    playerLoadPromise = (async () => {
      setStatus('加载默认角色…');
      const { root, fbx, animations } = await loadPlayerModel(loadingManager);
      playerRoot = root;
      playerFbx = fbx;
      embeddedClips = animations ?? fbx.animations ?? [];
      mixer = new THREE.AnimationMixer(fbx);
      scene.add(root);

      if (!sun) {
        const lights = createLights(scene, {
          target: { x: 0, y: 1, z: 0 },
          castShadow: true,
          sunDistance: 30,
        });
        sun = lights.sun;
      }
      syncToonLightDirection(root, sun);
      syncCanvasSize();
      playEmbeddedIdle();
      // One mixer tick so skinned bind pose resolves before framing.
      mixer.update(1 / 60);
      framePlayer();
      setStatus('');
    })();
    try {
      await playerLoadPromise;
    } finally {
      playerLoadPromise = null;
    }
  }

  async function loadClips(url) {
    if (clipCache.has(url)) return clipCache.get(url);
    const root = await loadModelRoot(url, loadingManager);
    const clips = (root.animations ?? []).map((clip) => {
      const c = clip.clone();
      if (!c.name || c.name === 'CINEMA_4D_Main') {
        c.name = url.split('/').pop()?.replace(/\.(fbx|glb)$/i, '') || 'clip';
      }
      return sanitizeCharacterClip(c);
    });
    clipCache.set(url, clips);
    return clips;
  }

  function stopAction() {
    if (currentAction) {
      currentAction.stop();
      currentAction = null;
    }
    mixer?.stopAllAction();
  }

  /**
   * @param {import('../config/animConfig.js').AnimOption | null | undefined} option
   */
  async function previewAnim(option) {
    if (!option) return;
    selectedId = option.id;
    busy = true;
    try {
      await ensurePlayer();
      if (selectedId !== option.id) return;

      syncCanvasSize();
      framePlayer();

      setStatus(`加载 ${option.label}…`);
      const clips = await loadClips(option.url);
      if (selectedId !== option.id) return;

      const clip = clips.find((c) => c.tracks.length > 0) ?? clips[0];
      if (!clip || !clip.tracks.length) {
        playEmbeddedIdle();
        mixer?.update(1 / 60);
        framePlayer();
        setStatus(`${option.label}：无可播放轨道（可能是旧版 FBX 或不兼容骨骼）`);
        return;
      }

      stopAction();
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.play();
      currentAction = action;
      mixer.update(1 / 60);
      setStatus(option.label);
      syncToonLightDirection(playerRoot, sun);
      framePlayer();
    } catch (err) {
      console.error('[anim-preview]', option.id, err);
      playEmbeddedIdle();
      mixer?.update(1 / 60);
      framePlayer();
      const msg = String(err?.message || err);
      if (/version not supported|6100/i.test(msg)) {
        setStatus(`${option.label}：FBX 版本不受支持`);
      } else {
        setStatus(`${option.label}：加载失败`);
      }
    } finally {
      busy = false;
    }
  }

  function resize(width, height) {
    applyPreviewCanvasSize(canvasCtx(), Math.round(width), Math.round(height));
  }

  function setActive(on) {
    active = Boolean(on);
    canvas.hidden = !active;
    if (active) {
      // Layout may not be ready on the same frame the panel expands.
      requestAnimationFrame(() => {
        if (!active) return;
        if (syncCanvasSize() && playerRoot) framePlayer();
        else if (playerRoot) framePlayer();
      });
      if (playerRoot) {
        if (!currentAction) playEmbeddedIdle();
        mixer?.update(1 / 60);
      }
    }
  }

  function update(dt) {
    if (!active) return;
    // Fix first-frame stretch: buffer often starts at default 300×150 until layout settles.
    if (syncCanvasSize() && playerRoot) framePlayer();
    controls.update();
    if (mixer) mixer.update(dt);
    if (playerRoot && sun) syncToonLightDirection(playerRoot, sun);
    renderer.render(scene, camera);
  }

  return {
    previewAnim,
    resize,
    setActive,
    update,
    getSelectedId: () => selectedId,
    ensurePlayer,
  };
}
