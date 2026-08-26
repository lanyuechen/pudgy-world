import * as THREE from 'three';

/**
 * World bounds for scene overview framing (prefer collision / root mesh).
 * @param {{ collisionRoot?: THREE.Object3D, root?: THREE.Object3D, scene?: THREE.Scene }|null} world
 */
export function getSceneBounds(world) {
  const root = world?.collisionRoot || world?.root || null;
  if (root) {
    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty()) return box;
  }
  if (world?.scene) {
    const box = new THREE.Box3();
    world.scene.traverse((obj) => {
      if (!obj.isMesh || obj.userData?.skipCollision) return;
      if (obj.userData?.isSnowball || obj.userData?.isFishingHole) return;
      const b = new THREE.Box3().setFromObject(obj);
      if (!b.isEmpty()) box.union(b);
    });
    if (!box.isEmpty()) return box;
  }
  return new THREE.Box3(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 10, 20));
}

/** LookAt / orbit center projects to the middle of the right half (NDC x=+0.5). */
export function setRightHalfViewOffset(camera, enabled) {
  if (!enabled) {
    camera.clearViewOffset();
    return;
  }
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  camera.setViewOffset(w, h, -w * 0.25, 0, w, h);
}

/**
 * Frame a Box3 into the right half of the viewport (left half reserved for UI).
 * @param {THREE.PerspectiveCamera} camera
 * @param {import('three/addons/controls/OrbitControls.js').OrbitControls} controls
 * @param {THREE.Box3} box
 */
export function frameExploreInRightHalf(camera, controls, box) {
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  center.y += size.y * 0.05;

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const usableHFov = hFov * 0.62;
  const fill = 0.9;
  const distY = size.y > 1e-4 ? (size.y * 0.5) / (Math.tan(vFov / 2) * fill) : 0;
  const distW = size.x > 1e-4 ? (size.x * 0.5) / Math.tan(usableHFov / 2) : 0;
  const distD = size.z > 1e-4 ? (size.z * 0.5) / Math.tan(usableHFov / 2) : 0;
  const distance = Math.max(distY, distW, distD, 6) * 0.72;

  const yaw = THREE.MathUtils.degToRad(40);
  const pitch = THREE.MathUtils.degToRad(28);
  const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
  const dir = new THREE.Vector3(0, 0, -distance).applyEuler(euler);

  setRightHalfViewOffset(camera, true);
  camera.position.copy(center).add(dir);
  controls.target.copy(center);
  controls.minDistance = Math.max(2, distance * 0.05);
  controls.maxDistance = Math.max(180, distance * 6);
  camera.far = Math.max(camera.far, distance * 20);
  camera.updateProjectionMatrix();
  controls.update();
}
