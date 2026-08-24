import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';

/**
 * Camera-relative locomotion matching UnrestrictedMovementState + Rigidbody:
 *
 *   targetVel = moveDir * moveSpeed
 *   v += targetVel * acceleration * dt          // AddForce Force, mass 1
 *   if jump && grounded: v.y += jumpForce        // Impulse
 *   v.xz -= v.xz * horizontalDamping * dt
 *   if |v.xz| > moveSpeed: v.xz = targetVel.xz   // snap, not magnitude clamp
 *   v.y += gravity * dt
 *
 * Airborne keeps last grounded moveSpeed (Unity state.moveSpeed).
 */
export function createPlayerController(playerRoot, { colliders = [] } = {}) {
  const velocity = new THREE.Vector3();
  let grounded = false;
  let facing = 0;
  let moveSpeed = PLAYER.walkSpeed;

  const down = new THREE.Vector3(0, -1, 0);
  const raycaster = new THREE.Raycaster();
  const _origin = new THREE.Vector3();
  const _move = new THREE.Vector3();
  const _targetVel = new THREE.Vector3();
  const _horizontal = new THREE.Vector3();

  function setColliders(meshes) {
    colliders = meshes;
  }

  function raycastGround(fromY, maxDist) {
    _origin.set(playerRoot.position.x, fromY, playerRoot.position.z);
    raycaster.set(_origin, down);
    raycaster.far = maxDist;
    const hits = raycaster.intersectObjects(colliders, false);
    return hits[0] ?? null;
  }

  /** Unity IsGrounded: short ray from feet. */
  function unityGrounded() {
    const hit = raycastGround(
      playerRoot.position.y + PLAYER.groundRayStartHeight,
      PLAYER.groundRayRange,
    );
    return !!hit;
  }

  function snapToGroundIfNeeded() {
    const hit = raycastGround(playerRoot.position.y + 100, 300);
    if (!hit) return false;
    playerRoot.position.y = hit.point.y + PLAYER.skinWidth;
    velocity.set(0, 0, 0);
    grounded = true;
    moveSpeed = PLAYER.walkSpeed;
    return true;
  }

  function update(dt, input, cameraForward, cameraRight) {
    // --- Ground state (probe + Unity short ray) ---
    const probe = raycastGround(
      playerRoot.position.y + PLAYER.centerY,
      PLAYER.centerY + PLAYER.groundSnapProbe,
    );
    const nearGround =
      !!probe &&
      playerRoot.position.y <= probe.point.y + PLAYER.skinWidth + 0.08 &&
      velocity.y <= 0.05;
    grounded = nearGround || unityGrounded();

    // --- Speed (Unity: airborne keeps state.moveSpeed) ---
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
      // Unity: snap to targetVelocity xz (not magnitude clamp)
      velocity.x = _targetVel.x;
      velocity.z = _targetVel.z;
    }

    velocity.y += PLAYER.gravity * dt;

    playerRoot.position.x += velocity.x * dt;
    playerRoot.position.y += velocity.y * dt;
    playerRoot.position.z += velocity.z * dt;

    // --- Land / stick ---
    const landHit = raycastGround(
      playerRoot.position.y + PLAYER.centerY,
      PLAYER.centerY + PLAYER.groundSnapProbe,
    );
    if (
      landHit &&
      velocity.y <= 0 &&
      playerRoot.position.y <= landHit.point.y + PLAYER.skinWidth + 0.05
    ) {
      playerRoot.position.y = landHit.point.y + PLAYER.skinWidth;
      velocity.y = 0;
      grounded = true;
    } else if (!unityGrounded() && !(landHit && playerRoot.position.y <= landHit.point.y + 0.1)) {
      grounded = false;
    }

    if (playerRoot.position.y < -40) {
      playerRoot.position.set(PLAYER.spawn.x, PLAYER.spawn.y, PLAYER.spawn.z);
      velocity.set(0, 0, 0);
      snapToGroundIfNeeded();
    }

    const moving = _horizontal.set(velocity.x, 0, velocity.z).length() >= 1; // Unity _movingThreshold
    return {
      grounded,
      moving,
      turning,
      // Unity: isSliding = grounded && slidePressed (no move required)
      sliding: grounded && !!input.slide,
      jumpStarted,
      velocity: velocity.clone(),
      facingYawDeg: THREE.MathUtils.radToDeg(facing),
    };
  }

  return {
    update,
    setColliders,
    snapToGroundIfNeeded,
    get grounded() {
      return grounded;
    },
    get velocity() {
      return velocity;
    },
  };
}
