import * as THREE from 'three';

const _axis = new THREE.Vector3();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _corner = new THREE.Vector3();

/** @type {WeakMap<THREE.Object3D, THREE.Vector3>} */
const restPositions = new WeakMap();

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function isLightTarget(obj, scene) {
  for (const child of scene.children) {
    if (child.isLight && child.target === obj) return true;
  }
  return false;
}

/**
 * Content roots that should slide during scene change (not sky / lights).
 * @param {object|null} world
 * @param {THREE.Object3D[]} [extras]
 * @returns {THREE.Object3D[]}
 */
export function getWorldSlideRoots(world, extras = []) {
  /** @type {Set<THREE.Object3D>} */
  const set = new Set();
  const add = (obj) => {
    if (obj) set.add(obj);
  };

  add(world?.collisionRoot);
  add(world?.root);
  add(world?.land);
  add(world?.plaza);
  add(world?.towns);
  add(world?.water?.mesh);
  add(world?.snow?.points);
  add(world?.fishingHoles?.group);
  add(world?.npcs?.group);

  if (set.size === 0 && world?.scene) {
    for (const child of world.scene.children) {
      if (child.isLight) continue;
      if (child.name === 'ProceduralSky') continue;
      if (isLightTarget(child, world.scene)) continue;
      set.add(child);
    }
  }

  for (const extra of extras) add(extra);
  return [...set];
}

function rememberRest(root) {
  if (!restPositions.has(root)) {
    restPositions.set(root, root.position.clone());
  }
  return restPositions.get(root);
}

/** Restore roots to their pre-transition local positions (for cache reuse). */
export function resetSlideRoots(roots) {
  for (const root of roots) {
    if (!root) continue;
    root.position.copy(rememberRest(root));
  }
}

/** Screen-space vertical axis in world space. sign +1 = up, -1 = down. */
export function getCameraVerticalAxis(camera, out = new THREE.Vector3(), sign = 1) {
  return out.set(0, sign, 0).applyQuaternion(camera.quaternion).normalize();
}

/**
 * Distance along axis to clear the current frustum (AABB + FOV margin).
 * @param {THREE.Object3D[]} roots
 * @param {THREE.Camera} camera
 * @param {THREE.Vector3} axisDown
 */
export function estimateSlideDistance(roots, camera, axisDown) {
  _box.makeEmpty();
  for (const root of roots) {
    if (!root) continue;
    root.updateMatrixWorld(true);
    _box.expandByObject(root);
  }
  if (_box.isEmpty()) return 48;

  _box.getCenter(_center);
  _box.getSize(_size);
  const dist = Math.max(1, camera.position.distanceTo(_center));
  const vFov = THREE.MathUtils.degToRad(camera.fov ?? 60);
  const halfH = Math.tan(vFov / 2) * dist;

  let minP = Infinity;
  let maxP = -Infinity;
  for (let i = 0; i < 8; i++) {
    _corner.set(
      i & 1 ? _box.max.x : _box.min.x,
      i & 2 ? _box.max.y : _box.min.y,
      i & 4 ? _box.max.z : _box.min.z,
    );
    const p = _corner.dot(axisDown);
    minP = Math.min(minP, p);
    maxP = Math.max(maxP, p);
  }
  const extent = Math.max(1, maxP - minP);
  return extent + halfH * 2.2 + Math.max(8, _size.length() * 0.05);
}

/**
 * Slide scene content along the camera vertical axis for scene switches.
 */
export function createSceneTransition() {
  /**
   * @type {null | {
   *   roots: THREE.Object3D[],
   *   rests: THREE.Vector3[],
   *   axis: THREE.Vector3,
   *   fromDist: number,
   *   toDist: number,
   *   duration: number,
   *   elapsed: number,
   *   resolve: () => void,
   * }}
   */
  let anim = null;

  function finishAnim() {
    if (!anim) return;
    const { roots, rests, axis, toDist, resolve } = anim;
    for (let i = 0; i < roots.length; i++) {
      roots[i].position.copy(rests[i]).addScaledVector(axis, toDist);
    }
    anim = null;
    resolve();
  }

  function update(dt) {
    if (!anim) return;
    anim.elapsed += dt;
    const t = Math.min(1, anim.elapsed / anim.duration);
    const e = easeInOutCubic(t);
    const d = anim.fromDist + (anim.toDist - anim.fromDist) * e;
    for (let i = 0; i < anim.roots.length; i++) {
      anim.roots[i].position.copy(anim.rests[i]).addScaledVector(anim.axis, d);
    }
    if (t >= 1) finishAnim();
  }

  /**
   * @param {THREE.Object3D[]} roots
   * @param {THREE.Camera} camera
   * @param {{ duration?: number }} [opts]
   */
  function slideOut(roots, camera, opts = {}) {
    const duration = opts.duration ?? 0.85;
    return new Promise((resolve) => {
      if (anim) finishAnim();
      const valid = roots.filter(Boolean);
      if (!valid.length) {
        resolve();
        return;
      }
      const axis = getCameraVerticalAxis(camera, _axis, -1).clone();
      const rests = valid.map((r) => rememberRest(r).clone());
      for (let i = 0; i < valid.length; i++) {
        valid[i].position.copy(rests[i]);
      }
      const distance = estimateSlideDistance(valid, camera, axis);
      anim = {
        roots: valid,
        rests,
        axis,
        fromDist: 0,
        toDist: distance,
        duration,
        elapsed: 0,
        resolve,
      };
    });
  }

  /**
   * Park roots above the current view (opposite of screen-down).
   * @returns {{ roots: THREE.Object3D[], axis: THREE.Vector3, distance: number }}
   */
  function placeAbove(roots, camera) {
    const valid = roots.filter(Boolean);
    resetSlideRoots(valid);
    const axis = getCameraVerticalAxis(camera, new THREE.Vector3(), -1);
    const distance = estimateSlideDistance(valid, camera, axis);
    for (const root of valid) {
      root.position.copy(rememberRest(root)).addScaledVector(axis, -distance);
    }
    return { roots: valid, axis, distance };
  }

  /**
   * @param {{ roots: THREE.Object3D[], axis: THREE.Vector3, distance: number }} prepared
   * @param {{ duration?: number }} [opts]
   */
  function slideIn(prepared, opts = {}) {
    const duration = opts.duration ?? 0.85;
    return new Promise((resolve) => {
      if (anim) finishAnim();
      const { roots, axis, distance } = prepared;
      if (!roots.length) {
        resolve();
        return;
      }
      const rests = roots.map((r) => rememberRest(r).clone());
      for (let i = 0; i < roots.length; i++) {
        roots[i].position.copy(rests[i]).addScaledVector(axis, -distance);
      }
      anim = {
        roots,
        rests,
        axis: axis.clone(),
        fromDist: -distance,
        toDist: 0,
        duration,
        elapsed: 0,
        resolve,
      };
    });
  }

  function cancel() {
    if (!anim) return;
    const { resolve } = anim;
    anim = null;
    resolve();
  }

  return {
    update,
    slideOut,
    placeAbove,
    slideIn,
    cancel,
    get active() {
      return Boolean(anim);
    },
  };
}
