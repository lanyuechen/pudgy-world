import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';

/**
 * Third-person camera. Mouse orbits only while LMB held.
 * No auto-yaw toward player (that caused WASD spin feedback).
 */
export function createPlayerCamera(camera) {
  const pivot = new THREE.Object3D();
  pivot.name = 'PlayerCameraPivot';

  let yaw = 0;
  let pitch = 20;
  let target = null;

  const _offset = new THREE.Vector3();
  const _forward = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _spherical = new THREE.Spherical();
  const _desired = new THREE.Vector3();

  function placeCamera() {
    _spherical.set(
      PLAYER.cameraDistance,
      THREE.MathUtils.degToRad(90 - pitch),
      THREE.MathUtils.degToRad(yaw),
    );
    _offset.setFromSpherical(_spherical);
    camera.position.copy(pivot.position).add(_offset);
    camera.lookAt(pivot.position);
  }

  function bind(targetObject3D) {
    target = targetObject3D;
    yaw = 0;
    pitch = 20;
    target.getWorldPosition(_desired);
    _desired.y += 1;
    pivot.position.copy(_desired);
    placeCamera();
  }

  function applyLook(dt, input) {
    if (!input.rotateCamera) return;
    yaw -= input.lookX * PLAYER.mouseSensitivityX * dt;
    pitch -= input.lookY * PLAYER.mouseSensitivityY * dt;
    pitch = THREE.MathUtils.clamp(pitch, PLAYER.minPitch, PLAYER.maxPitch);
  }

  function follow(dt) {
    if (!target) return;
    target.getWorldPosition(_desired);
    _desired.y += 1;
    const alpha = dt <= 0 ? 1 : 1 - Math.exp(-PLAYER.cameraFollowSpeed * dt);
    pivot.position.lerp(_desired, alpha);
    placeCamera();
  }

  /** Horizontal camera look dir (Unity cameraForward flattened). */
  function getForward() {
    const r = THREE.MathUtils.degToRad(yaw);
    // yaw 0 → camera on +Z looking at -Z → forward is -Z
    _forward.set(-Math.sin(r), 0, -Math.cos(r));
    return _forward.clone();
  }

  function getRight() {
    const r = THREE.MathUtils.degToRad(yaw);
    // yaw 0 → +X
    _right.set(Math.cos(r), 0, -Math.sin(r));
    return _right.clone();
  }

  return { pivot, bind, applyLook, follow, getForward, getRight };
}
