import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';

/**
 * Third-person camera matching PlayerCamera.cs + PlayerCamera.prefab,
 * plus screen-position soft look (capped yaw/pitch offset from pointer vs center).
 */
export function createPlayerCamera(camera) {
  const pivot = new THREE.Object3D();
  pivot.name = 'PlayerCameraPivot';

  let yaw = 0;
  let pitch = 10;
  let softYaw = 0;
  let softPitch = 0;
  let distance = PLAYER.cameraDistanceMin;
  let distanceTarget = PLAYER.cameraDistanceMin;
  let target = null;

  const _refLocal = new THREE.Vector3(
    PLAYER.cameraReference.x,
    PLAYER.cameraReference.y,
    PLAYER.cameraReference.z,
  );
  const _desired = new THREE.Vector3();
  const _offset = new THREE.Vector3();
  const _forward = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

  function placeCamera() {
    _euler.set(
      THREE.MathUtils.degToRad(pitch + softPitch),
      THREE.MathUtils.degToRad(yaw + softYaw),
      0,
      'YXZ',
    );
    _offset.set(0, 0, -distance).applyEuler(_euler);
    camera.position.copy(pivot.position).add(_offset);
    camera.lookAt(pivot.position);
    camera.updateMatrixWorld(true);
  }

  function getReferenceWorld(out) {
    if (!target) {
      out.set(0, 0, 0);
      return out;
    }
    out.copy(_refLocal);
    target.localToWorld(out);
    return out;
  }

  function bind(targetObject3D) {
    target = targetObject3D;
    yaw = THREE.MathUtils.radToDeg(target.rotation.y);
    pitch = 10;
    softYaw = 0;
    softPitch = 0;
    distance = PLAYER.cameraDistanceMin;
    distanceTarget = PLAYER.cameraDistanceMin;
    getReferenceWorld(_desired);
    pivot.position.copy(_desired);
    placeCamera();
  }

  function applySoftLook(dt, pointerNX = 0, pointerNY = 0, enabled = true) {
    let targetYaw = 0;
    let targetPitch = 0;
    if (enabled) {
      const dz = PLAYER.softLookDeadzone ?? 0;
      let nx = pointerNX;
      let ny = pointerNY;
      if (Math.abs(nx) < dz) nx = 0;
      else nx = Math.sign(nx) * ((Math.abs(nx) - dz) / (1 - dz));
      if (Math.abs(ny) < dz) ny = 0;
      else ny = Math.sign(ny) * ((Math.abs(ny) - dz) / (1 - dz));

      // Screen-left (nx < 0) → positive soft yaw so view turns left (Three.js RH)
      targetYaw = -nx * PLAYER.softLookYawDeg;
      targetPitch = -ny * PLAYER.softLookPitchDeg;
    }

    const t = 1 - Math.exp(-PLAYER.softLookFollowSpeed * dt);
    softYaw += (targetYaw - softYaw) * t;
    softPitch += (targetPitch - softPitch) * t;
  }

  /**
   * @param {number} dt
   * @param {{ lookX: number, lookY: number, rotateCamera: boolean, pointerNX?: number, pointerNY?: number, zoomDelta?: number }} input
   * @param {{ moving?: boolean, facingYawDeg?: number, velocity?: { length: () => number } }} [status]
   */
  function applyLook(dt, input, status = {}) {
    const zoomDelta = input.zoomDelta ?? 0;
    if (zoomDelta !== 0) {
      distanceTarget = THREE.MathUtils.clamp(
        distanceTarget + zoomDelta * PLAYER.cameraZoomSpeed,
        PLAYER.cameraDistanceMin,
        PLAYER.cameraDistanceMax,
      );
    }
    const zoomT = 1 - Math.exp(-PLAYER.cameraZoomFollowSpeed * dt);
    distance += (distanceTarget - distance) * zoomT;

    const speed =
      status.velocity?.length?.() ??
      (status.moving ? 1 : 0);
    const isMoving = speed > 1e-3;

    function bakeSoftLook() {
      if (softYaw === 0 && softPitch === 0) return;
      yaw += softYaw;
      pitch += softPitch;
      pitch = THREE.MathUtils.clamp(pitch, PLAYER.minPitch, PLAYER.maxPitch);
      softYaw = 0;
      softPitch = 0;
    }

    if (input.rotateCamera) {
      bakeSoftLook();
      yaw += input.lookX * PLAYER.mouseSensitivityX * dt;
      pitch -= input.lookY * PLAYER.mouseSensitivityY * dt;
      pitch = THREE.MathUtils.clamp(pitch, PLAYER.minPitch, PLAYER.maxPitch);
      return;
    }

    if (isMoving) {
      // Bake first so current view is preserved, then auto-yaw from that angle
      bakeSoftLook();
      if (status.facingYawDeg != null) {
        const maxStep = PLAYER.autoYawSpeed * dt;
        let delta = status.facingYawDeg - yaw;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        yaw += Math.abs(delta) <= maxStep ? delta : Math.sign(delta) * maxStep;
      }
    } else {
      applySoftLook(dt, input.pointerNX ?? 0, input.pointerNY ?? 0, true);
    }
  }

  function follow(dt) {
    if (!target) return;
    getReferenceWorld(_desired);
    const t = Math.min(1, PLAYER.cameraFollowSpeed * dt);
    pivot.position.lerp(_desired, t);
    placeCamera();
  }

  function getForward() {
    camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() < 1e-8) _forward.set(0, 0, 1);
    else _forward.normalize();
    return _forward;
  }

  function getRight() {
    camera.matrixWorld.extractBasis(_right, _up, _offset);
    _right.y = 0;
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    return _right;
  }

  return { pivot, bind, applyLook, follow, getForward, getRight };
}
