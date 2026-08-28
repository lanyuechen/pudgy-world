import * as THREE from 'three';
import { CATCH_HOLD_DURATION, pickRandomFish } from '../config/fishConfig.js';
import { loadModelRoot } from '../loaders/loadModel.js';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

/** Hand prop socket used by fishing gear (under R_Arm_02). */
const CATCH_BONE_NAMES = ['FishingRod', 'R_Arm_02'];

function findCatchBone(root) {
  if (!root) return null;
  for (const name of CATCH_BONE_NAMES) {
    let hit = null;
    root.traverse((obj) => {
      if (hit || !obj.isBone) return;
      if (obj.name === name) hit = obj;
    });
    if (hit) return hit;
  }
  return null;
}

/**
 * Spawn a caught fish on the FishingRod hand socket during HoldingFish.
 */
export function createCatchPresenter({ playerRoot, loadingManager } = {}) {
  /** @type {Map<string, THREE.Object3D>} */
  const cache = new Map();
  /** @type {THREE.Object3D | null} */
  let activeRoot = null;
  let holdTimer = 0;
  /** @type {ReturnType<typeof pickRandomFish>} */
  let lastCatch = null;

  async function ensureLoaded(def) {
    if (cache.has(def.id)) return cache.get(def.id);
    const fbx = await loadModelRoot(def.fbx, { loadingManager });
    fbx.name = `Catch_${def.id}`;
    fbx.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = false;
      child.frustumCulled = false;
    });

    // Center mesh at origin so the grip sits in the palm socket.
    _box.setFromObject(fbx);
    _box.getCenter(_center);
    _box.getSize(_size);
    fbx.position.sub(_center);

    const longest = Math.max(_size.x, _size.y, _size.z, 0.001);
    const target = 0.45;
    const wrap = new THREE.Group();
    wrap.name = `CatchWrap_${def.id}`;
    wrap.add(fbx);
    wrap.scale.setScalar(target / longest);

    cache.set(def.id, wrap);
    return wrap;
  }

  function clearActive() {
    if (!activeRoot) return;
    activeRoot.removeFromParent();
    activeRoot = null;
  }

  /**
   * @returns {Promise<{ fish: NonNullable<ReturnType<typeof pickRandomFish>>, duration: number } | null>}
   */
  async function presentCatch() {
    clearActive();
    const def = pickRandomFish();
    const bone = findCatchBone(playerRoot);
    if (!def || !bone) {
      lastCatch = def;
      return def ? { fish: def, duration: CATCH_HOLD_DURATION } : null;
    }

    const template = await ensureLoaded(def);
    const instance = template.clone(true);
    // Held up from the FishingRod socket (same attach point as the rod grip).
    instance.position.set(0, 0.02, -0.04);
    instance.rotation.set(Math.PI * 0.5, Math.PI * 0.15, Math.PI * 0.35);
    bone.add(instance);
    activeRoot = instance;
    lastCatch = def;
    holdTimer = CATCH_HOLD_DURATION;
    return { fish: def, duration: CATCH_HOLD_DURATION };
  }

  function update(dt) {
    if (holdTimer <= 0) return false;
    holdTimer = Math.max(0, holdTimer - dt);
    if (holdTimer <= 0) {
      clearActive();
      return true;
    }
    return false;
  }

  function dismiss() {
    holdTimer = 0;
    clearActive();
  }

  function dispose() {
    dismiss();
    for (const root of cache.values()) {
      root.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose?.();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) m?.dispose?.();
        }
      });
    }
    cache.clear();
  }

  return {
    presentCatch,
    update,
    dismiss,
    dispose,
    get lastCatch() {
      return lastCatch;
    },
    get holding() {
      return holdTimer > 0;
    },
  };
}
