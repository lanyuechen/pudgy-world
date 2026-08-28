import * as THREE from 'three';
import { CONTROL, PLAYER } from '../config/playerConfig.js';

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

/**
 * Character controller — docs §3 / §6.1
 * Fixed 50Hz. Simple jump: grounded + one Space edge → one takeoff.
 *
 * Physics feet live in `_physicsFeet`; `character.position` is the smoothed display pose.
 */
export function createCharacterController(character, { physics } = {}) {
  const velocity = new THREE.Vector3();
  let yaw = character.rotation.y;
  let isMoving = false;
  /** True from takeoff until we land (velocity.y ≤ 0 and grounded). */
  let airborne = false;
  let grounded = true;

  const _inputDir = new THREE.Vector2();
  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _worldMove = new THREE.Vector3();
  const _feet = { x: 0, y: 0, z: 0 };
  const _physicsFeet = new THREE.Vector3().copy(character.position);
  const _displayVel = new THREE.Vector3();

  function yawToWorldForward(yawRad, out) {
    out.set(Math.sin(yawRad), 0, Math.cos(yawRad));
    return out;
  }

  function yawToWorldRight(yawRad, out) {
    out.set(Math.cos(yawRad), 0, -Math.sin(yawRad));
    return out;
  }

  function lerpAngle(current, target, t) {
    let d = target - current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return current + d * THREE.MathUtils.clamp(t, 0, 1);
  }

  function rayGrounded() {
    if (!physics) return _physicsFeet.y <= 0.05;
    const hit = physics.castGround(CONTROL.capsuleCenterY + 0.4);
    if (!hit) return false;
    // Walk / props: enough slack for trimesh noise, not for jump landing
    return hit.toi - CONTROL.capsuleCenterY <= 0.15;
  }

  /** Feet almost on surface (landing fallback only). */
  function rayAlmostTouching() {
    if (!physics) return false;
    const hit = physics.castGround(CONTROL.capsuleCenterY + 0.15);
    if (!hit) return false;
    return hit.toi - CONTROL.capsuleCenterY <= CONTROL.skinWidth + 0.03;
  }

  function snapDisplayPosition() {
    character.position.copy(_physicsFeet);
    _displayVel.set(0, 0, 0);
  }

  function snapToGroundIfNeeded() {
    if (!physics) return false;
    physics.setPlayerFeetPosition(_physicsFeet.x, _physicsFeet.y, _physicsFeet.z);
    const hit = physics.castGround(300);
    if (!hit) return false;
    const y = hit.pointY + CONTROL.skinWidth;
    _physicsFeet.set(_physicsFeet.x, y, _physicsFeet.z);
    physics.setPlayerFeetPosition(_physicsFeet.x, y, _physicsFeet.z);
    snapDisplayPosition();
    velocity.set(0, 0, 0);
    airborne = false;
    grounded = true;
    return true;
  }

  /**
   * Smooth display mesh toward physics feet (call once per render frame).
   * @param {number} dt
   * @param {{ grounded?: boolean, jumpStarted?: boolean }} [opts]
   */
  function updateDisplayPosition(dt, { grounded: isGrounded = true, jumpStarted = false } = {}) {
    const smoothTime =
      jumpStarted || !isGrounded
        ? (CONTROL.playerDisplaySmoothDampAir ?? 0.03)
        : (CONTROL.playerDisplaySmoothDamp ?? 0.08);
    smoothDampVec3(character.position, _physicsFeet, _displayVel, smoothTime, dt);
  }

  /**
   * @param {number} fixedDelta
   * @param {{ moveX:number, moveY:number, jump:boolean, run?:boolean }} input
   *   `jump` must be true for at most one fixed tick per Space press (caller clears it).
   * @param {number} cameraYawRad
   * @param {{ uiOpen?: boolean }} [flags]
   */
  function fixedTick(fixedDelta, input, cameraYawRad, flags = {}) {
    if (flags.uiOpen) {
      isMoving = false;
      return status(false);
    }

    _inputDir.set(input.moveX || 0, input.moveY || 0);
    if (_inputDir.lengthSq() > 1) _inputDir.normalize();

    yawToWorldForward(cameraYawRad, _fwd);
    yawToWorldRight(cameraYawRad, _right);
    _worldMove
      .set(0, 0, 0)
      .addScaledVector(_fwd, _inputDir.y)
      .addScaledVector(_right, -_inputDir.x);
    if (_worldMove.lengthSq() > 1e-8) _worldMove.normalize();
    else _worldMove.set(0, 0, 0);

    isMoving = _worldMove.lengthSq() > 0.0001;
    if (isMoving) {
      const targetYaw = Math.atan2(_worldMove.x, _worldMove.z);
      yaw = lerpAngle(yaw, targetYaw, CONTROL.rotateSmooth * fixedDelta);
      character.rotation.y = yaw;
    }

    if (physics) {
      physics.setPlayerFeetPosition(_physicsFeet.x, _physicsFeet.y, _physicsFeet.z);
    }

    // --- Jump (simple): only on ground, only when caller passes jump once ---
    let jumpStarted = false;
    if (input.jump && !airborne && grounded) {
      velocity.y = CONTROL.jumpForce;
      airborne = true;
      grounded = false;
      jumpStarted = true;
    }

    const speed = input.run ? CONTROL.runSpeed : CONTROL.walkSpeed;
    let dx;
    let dy;
    let dz;

    if (!airborne) {
      velocity.y = 0;
      velocity.x = _worldMove.x * speed;
      velocity.z = _worldMove.z * speed;
      dx = velocity.x * fixedDelta;
      dz = velocity.z * fixedDelta;
      // No constant downward stick — it sank players slowly through building meshes (~0.15m/s)
      dy = 0;
    } else {
      velocity.y += CONTROL.gravity * fixedDelta;
      if (isMoving) {
        velocity.x = _worldMove.x * speed;
        velocity.z = _worldMove.z * speed;
      }
      dx = velocity.x * fixedDelta;
      dy = velocity.y * fixedDelta;
      dz = velocity.z * fixedDelta;
    }

    if (physics) {
      // Snap only while walking on ground; never while jumping/falling
      const moved = physics.movePlayer(dx, dy, dz, {
        allowSnap: !airborne,
      });
      physics.getPlayerFeetPosition(_feet);
      _physicsFeet.set(_feet.x, _feet.y, _feet.z);

      if (airborne) {
        if (velocity.y <= 0 && (moved.grounded || rayAlmostTouching())) {
          airborne = false;
          grounded = true;
          velocity.y = 0;
        } else {
          grounded = false;
        }
      } else {
        grounded = moved.grounded || rayGrounded();
        // Lost contact (ledge / bad prop hit) → real fall, not grounded micro-sink
        if (!grounded) {
          airborne = true;
        }
      }
    } else {
      _physicsFeet.x += dx;
      _physicsFeet.y += dy;
      _physicsFeet.z += dz;
      if (airborne && velocity.y <= 0 && _physicsFeet.y <= 0.05) {
        airborne = false;
        grounded = true;
        velocity.y = 0;
        _physicsFeet.y = 0;
      }
    }

    if (_physicsFeet.y < -40) {
      _physicsFeet.set(PLAYER.spawn.x, PLAYER.spawn.y, PLAYER.spawn.z);
      velocity.set(0, 0, 0);
      airborne = false;
      grounded = true;
      if (physics) {
        physics.createPlayerCapsule(
          _physicsFeet.x,
          _physicsFeet.y,
          _physicsFeet.z,
        );
      }
      snapToGroundIfNeeded();
    }

    return status(jumpStarted);
  }

  function status(jumpStarted = false) {
    return {
      grounded: grounded && !airborne,
      moving: isMoving,
      turning: isMoving,
      sliding: false,
      jumpStarted,
      velocity: velocity.clone(),
      facingYawDeg: THREE.MathUtils.radToDeg(yaw),
    };
  }

  return {
    fixedTick,
    snapToGroundIfNeeded,
    snapDisplayPosition,
    updateDisplayPosition,
    getPhysicsFeet: () => _physicsFeet,
    get isGrounded() {
      return grounded && !airborne;
    },
    get isMoving() {
      return isMoving;
    },
    get velocity() {
      return velocity;
    },
  };
}
