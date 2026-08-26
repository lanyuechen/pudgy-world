import * as THREE from 'three';
import { CONTROL } from '../config/playerConfig.js';

/**
 * Spring-arm camera — docs §4 / §6.2
 * Slow boom pull / spring-back / smoothDamp; auto-yaw follows character while moving.
 */
export function createSpringArmCamera(camera) {
  let yaw = 0;
  let pitch = 15;
  let targetDistance = CONTROL.camDefaultDistance;
  let realDistance = targetDistance;
  let boomSticky = null;
  let uiOpen = false;
  let softYaw = 0;
  let softPitch = 0;
  /** @type {THREE.Object3D|null} */
  let character = null;
  /** @type {THREE.Object3D[]} */
  let obstacles = [];

  const _pivot = new THREE.Vector3();
  const _pivotSmooth = new THREE.Vector3();
  const _ideal = new THREE.Vector3();
  const _final = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _vel = new THREE.Vector3();
  const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const raycaster = new THREE.Raycaster();
  let pivotReady = false;

  function setObstacles(meshes) {
    obstacles = meshes ?? [];
  }

  function setUiOpen(v) {
    uiOpen = !!v;
  }

  function bind(characterObject) {
    character = characterObject;
    yaw = THREE.MathUtils.radToDeg(character.rotation.y);
    pitch = 15;
    targetDistance = CONTROL.camDefaultDistance;
    realDistance = targetDistance;
    boomSticky = null;
    _vel.set(0, 0, 0);
    pivotReady = false;
    lateUpdate(1 / 60, { lookX: 0, lookY: 0, zoomDelta: 0, rotateCamera: false }, {});
  }

  function getYawRad() {
    return THREE.MathUtils.degToRad(yaw);
  }

  function getYawDeg() {
    return yaw;
  }

  function calculateOrbitPosition(pivotPos, yawDeg, pitchDeg, dist, out) {
    _euler.set(
      THREE.MathUtils.degToRad(pitchDeg),
      THREE.MathUtils.degToRad(yawDeg),
      0,
      'YXZ',
    );
    _dir.set(0, 0, -dist).applyEuler(_euler);
    out.copy(pivotPos).add(_dir);
    return out;
  }

  function updateSoftLook(dt, input, enabled) {
    let targetYaw = 0;
    let targetPitch = 0;
    if (enabled) {
      const dz = CONTROL.softLookDeadzone ?? 0;
      let nx = input.pointerNX ?? 0;
      let ny = input.pointerNY ?? 0;
      if (Math.abs(nx) < dz) nx = 0;
      else nx = Math.sign(nx) * ((Math.abs(nx) - dz) / Math.max(1e-6, 1 - dz));
      if (Math.abs(ny) < dz) ny = 0;
      else ny = Math.sign(ny) * ((Math.abs(ny) - dz) / Math.max(1e-6, 1 - dz));

      // Screen-left (nx < 0) → look left; edge ≈ ±softLookYawDeg
      targetYaw = -nx * (CONTROL.softLookYawDeg ?? 10);
      targetPitch = -ny * (CONTROL.softLookPitchDeg ?? 6);
    }
    const t = 1 - Math.exp(-(CONTROL.softLookFollowSpeed ?? 6) * dt);
    softYaw += (targetYaw - softYaw) * t;
    softPitch += (targetPitch - softPitch) * t;
  }

  function bakeSoftLook() {
    if (softYaw === 0 && softPitch === 0) return;
    yaw += softYaw;
    pitch = THREE.MathUtils.clamp(
      pitch + softPitch,
      CONTROL.pitchMin,
      CONTROL.pitchMax,
    );
    softYaw = 0;
    softPitch = 0;
  }

  function smoothDampVec3(current, target, velocity, smoothTime, dt) {
    const st = Math.max(0.0001, smoothTime);
    const omega = 2 / st;
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

    const changeX = current.x - target.x;
    const changeY = current.y - target.y;
    const changeZ = current.z - target.z;

    const tempX = (velocity.x + omega * changeX) * dt;
    const tempY = (velocity.y + omega * changeY) * dt;
    const tempZ = (velocity.z + omega * changeZ) * dt;

    velocity.x = (velocity.x - omega * tempX) * exp;
    velocity.y = (velocity.y - omega * tempY) * exp;
    velocity.z = (velocity.z - omega * tempZ) * exp;

    current.x = target.x + (changeX + tempX) * exp;
    current.y = target.y + (changeY + tempY) * exp;
    current.z = target.z + (changeZ + tempZ) * exp;
  }

  function lerpAngleDeg(current, target, maxStep) {
    let d = target - current;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (Math.abs(d) <= maxStep) return target;
    return current + Math.sign(d) * maxStep;
  }

  function raycastBoom(pivotPos) {
    const viewYaw = yaw + softYaw;
    const viewPitch = pitch + softPitch;
    calculateOrbitPosition(pivotPos, viewYaw, viewPitch, targetDistance, _ideal);
    _dir.copy(_ideal).sub(pivotPos);
    const maxDist = _dir.length();
    if (maxDist < 1e-4 || obstacles.length === 0) return null;

    _dir.multiplyScalar(1 / maxDist);
    raycaster.set(pivotPos, _dir);
    raycaster.near = 0.08;
    raycaster.far = maxDist;
    const hits = raycaster.intersectObjects(obstacles, false);
    const pad = CONTROL.cameraCollisionPad;
    for (const hit of hits) {
      if (hit.object?.userData?.isSnowball || hit.object?.userData?.isFishingHole) continue;
      if (character) {
        let p = hit.object;
        while (p) {
          if (p === character) return null;
          p = p.parent;
        }
      }
      if (hit.distance < 0.35) continue;
      return Math.max(CONTROL.camMinDistance * 0.5, hit.distance - pad);
    }
    return null;
  }

  /**
   * @param {number} deltaTime
   * @param {{ lookX:number, lookY:number, zoomDelta:number, rotateCamera:boolean, pointerNX?:number, pointerNY?:number, moveY?:number }} input
   * @param {{ moving?: boolean, facingYawDeg?: number }} [status]
   */
  function lateUpdate(deltaTime, input, status = {}) {
    if (!character) return;

    const dt = Math.min(deltaTime, 0.05);

    if (!uiOpen) {
      const sens = CONTROL.mouseSensitivity;

      if (input.rotateCamera) {
        bakeSoftLook();
        yaw -= input.lookX * sens;
        pitch = THREE.MathUtils.clamp(
          pitch + input.lookY * sens,
          CONTROL.pitchMin,
          CONTROL.pitchMax,
        );
        updateSoftLook(dt, input, false);
      } else {
        if (
          status.moving &&
          status.facingYawDeg != null &&
          !(input.moveY < -0.01)
        ) {
          const maxStep = (CONTROL.autoYawSpeed ?? 70) * dt;
          yaw = lerpAngleDeg(yaw, status.facingYawDeg, maxStep);
        }
        // No LMB: mouse position on screen → capped soft look (±10° yaw at edges)
        updateSoftLook(dt, input, true);
      }

      if (input.zoomDelta) {
        targetDistance = THREE.MathUtils.clamp(
          targetDistance + input.zoomDelta * 0.01,
          CONTROL.camMinDistance,
          CONTROL.camMaxDistance,
        );
      }
    } else {
      updateSoftLook(dt, input, false);
    }

    // Pivot: hard XZ, soft Y (kills foot-snap flicker)
    _pivot.set(
      character.position.x,
      character.position.y + CONTROL.cameraOffsetY,
      character.position.z,
    );
    if (!pivotReady) {
      _pivotSmooth.copy(_pivot);
      pivotReady = true;
    } else {
      _pivotSmooth.x = _pivot.x;
      _pivotSmooth.z = _pivot.z;
      _pivotSmooth.y += (_pivot.y - _pivotSmooth.y) * Math.min(1, 12 * dt);
    }

    // Boom: sticky + slow pull / spring (no hard snap → no flicker)
    const hitDist = uiOpen ? null : raycastBoom(_pivotSmooth);
    if (hitDist != null) {
      if (boomSticky == null || hitDist < boomSticky - 0.08) boomSticky = hitDist;
      else if (hitDist > boomSticky + 0.2) boomSticky = hitDist;
      const pull = Math.min(1, (CONTROL.boomPullSpeed ?? 4) * dt);
      if (boomSticky < realDistance) {
        realDistance += (boomSticky - realDistance) * pull;
      }
    } else {
      boomSticky = null;
      const k = Math.min(1, CONTROL.springBackSpeed * dt);
      realDistance += (targetDistance - realDistance) * k;
    }

    const viewYaw = yaw + softYaw;
    const viewPitch = THREE.MathUtils.clamp(
      pitch + softPitch,
      CONTROL.pitchMin,
      CONTROL.pitchMax,
    );
    calculateOrbitPosition(_pivotSmooth, viewYaw, viewPitch, realDistance, _final);
    smoothDampVec3(camera.position, _final, _vel, CONTROL.camSmoothDamp, dt);
    camera.lookAt(_pivotSmooth);
    camera.updateMatrixWorld(true);
  }

  return {
    bind,
    setObstacles,
    setUiOpen,
    lateUpdate,
    getYawRad,
    getYawDeg,
  };
}
