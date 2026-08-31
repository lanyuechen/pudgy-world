import * as THREE from 'three';
import { clone as cloneSkinnedRoot } from 'three/addons/utils/SkeletonUtils.js';

const PORTRAIT_SIZE = 40;

function meshCount(root) {
  let count = 0;
  root?.traverse((o) => {
    if (o.isMesh) count += 1;
  });
  return count;
}

function syncSkinnedPose(sourceRoot, destRoot) {
  const srcByName = new Map();
  sourceRoot.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) srcByName.set(o.name, o);
  });

  destRoot.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    const src = srcByName.get(o.name);
    if (!src?.skeleton) return;

    const bones = o.skeleton.bones;
    const srcBones = src.skeleton.bones;
    const n = Math.min(bones.length, srcBones.length);
    for (let i = 0; i < n; i++) {
      bones[i].quaternion.copy(srcBones[i].quaternion);
      bones[i].position.copy(srcBones[i].position);
      bones[i].scale.copy(srcBones[i].scale);
    }
    o.skeleton.update();
  });
}

function syncMeshState(sourceRoot, destRoot) {
  const srcByName = new Map();
  sourceRoot.traverse((o) => {
    if (o.isMesh) srcByName.set(o.name, o);
  });

  destRoot.traverse((o) => {
    const src = srcByName.get(o.name);
    if (!src) return;
    o.visible = src.visible;
    if (src.isBone || o.isBone) return;
    if (o.isSkinnedMesh) return;
    if (o.isMesh) {
      o.position.copy(src.position);
      o.quaternion.copy(src.quaternion);
      o.scale.copy(src.scale);
    }
  });
}

/**
 * Renders a circular live player portrait — syncs pose & cosmetics from the game model.
 */
export function createPlayerPortrait(canvas, sourceRoot) {
  const dpr = () => Math.min(window.devicePixelRatio, 2);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(dpr());
  renderer.setSize(PORTRAIT_SIZE, PORTRAIT_SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);

  const hemi = new THREE.HemisphereLight(0xb8e8ff, 0x3a5870, 0.95);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(1.2, 2.4, 2.8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9ec8ff, 0.42);
  fill.position.set(-2.2, 0.6, 1.4);
  scene.add(fill);

  /** @type {THREE.Object3D | null} */
  let liveSource = sourceRoot ?? null;
  /** @type {THREE.Object3D | null} */
  let portraitRoot = null;
  let sourceMeshCount = 0;
  let needsReframe = true;

  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _focus = new THREE.Vector3();

  function framePortrait() {
    if (!portraitRoot) return;

    portraitRoot.updateWorldMatrix(true, true);
    _box.setFromObject(portraitRoot);
    if (_box.isEmpty()) return;

    _box.getSize(_size);
    const focusY = _box.min.y + _size.y * 0.60;
    const focusX = _size.x * 0.09;
    _focus.set(focusX, focusY, 0);

    const halfH = _size.y * 0.5;
    const halfW = Math.max(_size.x, _size.z) * 0.5;
    const fill = 1.2;

    camera.fov = 38;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const distY = (halfH / Math.tan(vFov * 0.5)) * fill;
    const hFov = 2 * Math.atan(Math.tan(vFov * 0.5));
    const distW = (halfW / Math.tan(hFov * 0.5)) * fill;
    const dist = Math.max(distY, distW, 2.8);

    camera.position.set(focusX, focusY + _size.y * 0.07, dist);
    camera.lookAt(_focus);
    camera.updateProjectionMatrix();
  }

  function disposePortraitRoot() {
    if (!portraitRoot) return;
    portraitRoot.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose?.();
    });
    scene.remove(portraitRoot);
    portraitRoot = null;
  }

  function setSource(root) {
    disposePortraitRoot();
    if (!root) {
      liveSource = null;
      sourceMeshCount = 0;
      return;
    }
    liveSource = root;
    portraitRoot = cloneSkinnedRoot(root);
    portraitRoot.rotation.y = 0;
    scene.add(portraitRoot);
    sourceMeshCount = meshCount(root);
    needsReframe = true;
  }

  function syncFromSource() {
    if (!liveSource || !portraitRoot) return;

    const liveCount = meshCount(liveSource);
    if (liveCount !== sourceMeshCount) {
      setSource(liveSource);
      return;
    }

    syncSkinnedPose(liveSource, portraitRoot);
    syncMeshState(liveSource, portraitRoot);
  }

  function update() {
    syncFromSource();
    if (!portraitRoot) return;
    if (needsReframe) {
      framePortrait();
      needsReframe = false;
    }
    renderer.render(scene, camera);
  }

  function dispose() {
    disposePortraitRoot();
    renderer.dispose();
  }

  if (sourceRoot) setSource(sourceRoot);

  return { setSource, update, dispose };
}
