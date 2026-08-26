import * as THREE from 'three';
import { CONTROL, PLAYER } from '../config/playerConfig.js';

/**
 * Character controller — docs §3 / §6.1
 * Fixed 50Hz. Simple jump: grounded + one Space edge → one takeoff.
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
    if (!physics) return character.position.y <= 0.05;
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

  function snapToGroundIfNeeded() {
    if (!physics) return false;
    physics.setPlayerFeetPosition(
      character.position.x,
      character.position.y,
      character.position.z,
    );
    const hit = physics.castGround(300);
    if (!hit) return false;
    const y = hit.pointY + CONTROL.skinWidth;
    character.position.y = y;
    physics.setPlayerFeetPosition(character.position.x, y, character.position.z);
    velocity.set(0, 0, 0);
    airborne = false;
    grounded = true;
    return true;
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
      physics.setPlayerFeetPosition(
        character.position.x,
        character.position.y,
        character.position.z,
      );
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
      character.position.set(_feet.x, _feet.y, _feet.z);

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
      character.position.x += dx;
      character.position.y += dy;
      character.position.z += dz;
      if (airborne && velocity.y <= 0 && character.position.y <= 0.05) {
        airborne = false;
        grounded = true;
        velocity.y = 0;
        character.position.y = 0;
      }
    }

    if (character.position.y < -40) {
      character.position.set(PLAYER.spawn.x, PLAYER.spawn.y, PLAYER.spawn.z);
      velocity.set(0, 0, 0);
      airborne = false;
      grounded = true;
      if (physics) {
        physics.createPlayerCapsule(
          character.position.x,
          character.position.y,
          character.position.z,
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
