import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';

/**
 * Camera-relative movement matching UnrestrictedMovementState:
 * moveDir = cameraForward * input.y + cameraRight * input.x
 * W/S → forward/back, A/D → strafe. Player faces move dir; camera is independent.
 */
export function createPlayerController(playerRoot, { colliders = [] } = {}) {
  const velocity = new THREE.Vector3();
  let grounded = false;
  let facing = 0;

  const down = new THREE.Vector3(0, -1, 0);
  const raycaster = new THREE.Raycaster();
  const _move = new THREE.Vector3();
  const _target = new THREE.Vector3();
  const _horizontal = new THREE.Vector3();

  function setColliders(meshes) {
    colliders = meshes;
  }

  function raycastGround(fromY, maxDist) {
    raycaster.set(
      new THREE.Vector3(playerRoot.position.x, fromY, playerRoot.position.z),
      down,
    );
    raycaster.far = maxDist;
    return raycaster.intersectObjects(colliders, false)[0] ?? null;
  }

  function snapToGroundIfNeeded() {
    const hit = raycastGround(playerRoot.position.y + 100, 300);
    if (!hit) return false;
    playerRoot.position.y = hit.point.y + PLAYER.skinWidth;
    velocity.set(0, 0, 0);
    grounded = true;
    return true;
  }

  function update(dt, input, cameraForward, cameraRight) {
    // Exact Unity formula
    _move
      .set(0, 0, 0)
      .addScaledVector(cameraForward, input.moveY)
      .addScaledVector(cameraRight, input.moveX);
    _move.y = 0;
    if (_move.lengthSq() > 1) _move.normalize();

    const speed = grounded
      ? input.slide
        ? PLAYER.slideSpeed
        : PLAYER.walkSpeed
      : Math.max(Math.hypot(velocity.x, velocity.z), PLAYER.walkSpeed * 0.5);

    _target.copy(_move).multiplyScalar(speed);

    _horizontal.set(velocity.x, 0, velocity.z);
    const t = 1 - Math.exp(-PLAYER.acceleration * dt);
    _horizontal.lerp(_target, t);

    if (_move.lengthSq() < 1e-6) {
      _horizontal.multiplyScalar(1 / (1 + PLAYER.horizontalDamping * dt));
    }

    const hLen = _horizontal.length();
    if (hLen > speed && speed > 1e-6) _horizontal.multiplyScalar(speed / hLen);

    velocity.x = _horizontal.x;
    velocity.z = _horizontal.z;

    // Face travel direction only — does NOT drive the camera
    if (_move.lengthSq() > 1e-4) {
      const targetFacing = Math.atan2(_move.x, _move.z);
      const maxStep = THREE.MathUtils.degToRad(PLAYER.rotationSpeed) * dt;
      let delta = targetFacing - facing;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      facing += Math.abs(delta) <= maxStep ? delta : Math.sign(delta) * maxStep;
      playerRoot.rotation.y = facing;
    }

    let jumpStarted = false;
    if (input.jump && grounded) {
      velocity.y = PLAYER.jumpForce;
      grounded = false;
      jumpStarted = true;
    }

    velocity.y += PLAYER.gravity * dt;
    playerRoot.position.x += velocity.x * dt;
    playerRoot.position.y += velocity.y * dt;
    playerRoot.position.z += velocity.z * dt;

    const hit = raycastGround(playerRoot.position.y + 0.5, 2.5);
    if (hit && velocity.y <= 0 && playerRoot.position.y <= hit.point.y + 0.4) {
      playerRoot.position.y = hit.point.y + PLAYER.skinWidth;
      velocity.y = 0;
      grounded = true;
    } else if (!hit || playerRoot.position.y > (hit?.point.y ?? 0) + 0.4) {
      grounded = false;
    }

    if (playerRoot.position.y < -40) {
      playerRoot.position.set(PLAYER.spawn.x, PLAYER.spawn.y, PLAYER.spawn.z);
      velocity.set(0, 0, 0);
      snapToGroundIfNeeded();
    }

    const moving = _move.lengthSq() > 1e-4;
    return {
      grounded,
      moving,
      sliding: grounded && moving && !!input.slide,
      jumpStarted,
    };
  }

  return {
    update,
    setColliders,
    snapToGroundIfNeeded,
    get grounded() {
      return grounded;
    },
  };
}
