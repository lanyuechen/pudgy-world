import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';

/**
 * Camera-relative locomotion matching UnrestrictedMovementState + Rigidbody.
 * Horizontal/vertical displacement is resolved by Rapier CharacterController
 * (capsule vs static scene trimeshes), similar to Unity PhysX.
 */
export function createPlayerController(playerRoot, { physics } = {}) {
  const velocity = new THREE.Vector3();
  let grounded = false;
  let facing = 0;
  let moveSpeed = PLAYER.walkSpeed;

  const _move = new THREE.Vector3();
  const _targetVel = new THREE.Vector3();
  const _horizontal = new THREE.Vector3();
  const _feet = { x: 0, y: 0, z: 0 };
  const wallSlopeLimit = PLAYER.wallSlopeLimit ?? 0.55;

  function syncRootFromPhysics() {
    if (!physics) return;
    physics.getPlayerFeetPosition(_feet);
    playerRoot.position.set(_feet.x, _feet.y, _feet.z);
  }

  function syncPhysicsFromRoot() {
    if (!physics) return;
    const p = playerRoot.position;
    physics.setPlayerFeetPosition(p.x, p.y, p.z);
  }

  /** Unity IsGrounded: short downward cast from capsule. */
  function unityGrounded() {
    if (!physics) return false;
    const hit = physics.castGround(PLAYER.centerY + PLAYER.groundRayRange + 0.05);
    if (!hit) return false;
    // Capsule center → ground distance ≈ centerY when standing on surface
    const feetClearance = hit.toi - PLAYER.centerY;
    return feetClearance <= PLAYER.groundRayStartHeight + PLAYER.groundRayRange + 0.02;
  }

  /**
   * Remove only the velocity component into wall contacts (keep tangential speed
   * so walk anim / slide-along-wall stay responsive). Do not scale by moved/desired
   * ratio — that crushed speed on steps and killed locomotion clips.
   */
  function applyWallVelocityResponse() {
    const cc = physics?.characterController;
    if (!cc) return;
    const n = cc.numComputedCollisions();
    for (let i = 0; i < n; i += 1) {
      const col = cc.computedCollision(i);
      const normal = col?.normal1;
      if (!normal) continue;
      // Floors / ceilings — leave vertical to grounded / gravity handling.
      if (Math.abs(normal.y) >= wallSlopeLimit) continue;
      const vn = velocity.x * normal.x + velocity.z * normal.z;
      if (vn < 0) {
        velocity.x -= normal.x * vn;
        velocity.z -= normal.z * vn;
      }
    }
  }

  function snapToGroundIfNeeded() {
    if (!physics) return false;
    syncPhysicsFromRoot();
    const hit = physics.castGround(300);
    if (!hit) return false;
    const feetY = hit.pointY + PLAYER.skinWidth;
    playerRoot.position.y = feetY;
    physics.setPlayerFeetPosition(playerRoot.position.x, feetY, playerRoot.position.z);
    velocity.set(0, 0, 0);
    grounded = true;
    moveSpeed = PLAYER.walkSpeed;
    return true;
  }

  function update(dt, input, cameraForward, cameraRight) {
    syncPhysicsFromRoot();

    // --- Ground state (cast; refined after Rapier move) ---
    grounded = unityGrounded();

    if (grounded) {
      moveSpeed = input.slide ? PLAYER.slideSpeed : PLAYER.walkSpeed;
    }

    // --- Camera-relative move dir ---
    _move
      .set(0, 0, 0)
      .addScaledVector(cameraForward, input.moveY)
      .addScaledVector(cameraRight, input.moveX);
    _move.y = 0;
    if (_move.lengthSq() > 1) _move.normalize();

    _targetVel.copy(_move).multiplyScalar(moveSpeed);

    // --- Face move direction (RotateTowards 600°/s) ---
    let turning = false;
    if (_move.lengthSq() > 1e-6) {
      const targetFacing = Math.atan2(_move.x, _move.z);
      const maxStep = THREE.MathUtils.degToRad(PLAYER.rotationSpeed) * dt;
      let delta = targetFacing - facing;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      if (Math.abs(delta) > 1e-5) {
        facing += Math.abs(delta) <= maxStep ? delta : Math.sign(delta) * maxStep;
        playerRoot.rotation.y = facing;
        turning = true;
      }
    }

    // --- Forces (mass 1) ---
    velocity.x += _targetVel.x * PLAYER.acceleration * dt;
    velocity.z += _targetVel.z * PLAYER.acceleration * dt;

    let jumpStarted = false;
    if (input.jump && grounded) {
      velocity.y += PLAYER.jumpForce;
      grounded = false;
      jumpStarted = true;
    }

    _horizontal.set(velocity.x, 0, velocity.z);
    velocity.x -= _horizontal.x * PLAYER.horizontalDamping * dt;
    velocity.z -= _horizontal.z * PLAYER.horizontalDamping * dt;

    _horizontal.set(velocity.x, 0, velocity.z);
    if (_horizontal.length() > moveSpeed) {
      velocity.x = _targetVel.x;
      velocity.z = _targetVel.z;
    }

    // Critical for Rapier autostep: do not push into the floor every frame while
    // grounded — a constant downward delta cancels step-up on low obstacles.
    if (grounded && !jumpStarted && velocity.y <= 0) {
      velocity.y = 0;
    } else {
      velocity.y += PLAYER.gravity * dt;
    }

    const dx = velocity.x * dt;
    const dy = velocity.y * dt;
    const dz = velocity.z * dt;

    if (physics) {
      const moved = physics.movePlayer(dx, dy, dz);
      syncRootFromPhysics();
      grounded = moved.grounded || unityGrounded();

      if (grounded && velocity.y < 0) {
        velocity.y = 0;
      }

      applyWallVelocityResponse();
    } else {
      playerRoot.position.x += dx;
      playerRoot.position.y += dy;
      playerRoot.position.z += dz;
    }

    if (playerRoot.position.y < -40) {
      playerRoot.position.set(PLAYER.spawn.x, PLAYER.spawn.y, PLAYER.spawn.z);
      velocity.set(0, 0, 0);
      if (physics) {
        physics.createPlayerCapsule(
          playerRoot.position.x,
          playerRoot.position.y,
          playerRoot.position.z,
        );
      }
      snapToGroundIfNeeded();
    }

    // Input intent keeps walk playing while pressing into / stepping onto props;
    // velocity threshold matches prior locomotion (was crushed by moved/desired ratio).
    const speedH = _horizontal.set(velocity.x, 0, velocity.z).length();
    const moving = _move.lengthSq() > 1e-4 ? speedH >= 0.35 : speedH >= 1;
    return {
      grounded,
      moving,
      turning,
      sliding: grounded && !!input.slide,
      jumpStarted,
      velocity: velocity.clone(),
      facingYawDeg: THREE.MathUtils.radToDeg(facing),
    };
  }

  return {
    update,
    snapToGroundIfNeeded,
    get grounded() {
      return grounded;
    },
    get velocity() {
      return velocity;
    },
  };
}
