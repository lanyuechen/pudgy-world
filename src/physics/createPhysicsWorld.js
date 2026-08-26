import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';

let rapierReady = null;

/** Ensure Rapier WASM is initialized (idempotent). */
export function initRapier() {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

/**
 * Unity CapsuleCollider height includes hemispheres.
 * Rapier capsule halfHeight is the cylinder half-length only.
 */
export function capsuleHalfHeight(height = PLAYER.height, radius = PLAYER.radius) {
  return Math.max(0.01, (height - 2 * radius) * 0.5);
}

function meshToWorldTrimesh(mesh, _v = new THREE.Vector3()) {
  const geom = mesh.geometry;
  if (!geom?.attributes?.position) return null;

  mesh.updateWorldMatrix(true, false);
  const pos = geom.attributes.position;
  const vertCount = pos.count;
  if (vertCount < 3) return null;

  // Skip pathological meshes (keeps island load reasonable).
  const maxVerts = PLAYER.rapierMaxMeshVerts ?? 200_000;
  if (vertCount > maxVerts) {
    console.warn('[rapier] skip oversized mesh', mesh.name, vertCount);
    return null;
  }

  const vertices = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i += 1) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    vertices[i * 3] = _v.x;
    vertices[i * 3 + 1] = _v.y;
    vertices[i * 3 + 2] = _v.z;
  }

  let indices;
  if (geom.index) {
    const src = geom.index.array;
    indices = src instanceof Uint32Array ? src : new Uint32Array(src);
  } else {
    indices = new Uint32Array(vertCount);
    for (let i = 0; i < vertCount; i += 1) indices[i] = i;
  }

  if (indices.length < 3) return null;
  return { vertices, indices };
}

/**
 * Rapier world + static scene colliders + kinematic player capsule + character controller.
 * Locomotion forces stay in characterController; Rapier resolves collisions like Unity PhysX.
 */
export function createPhysicsWorld() {
  const gravityY = PLAYER.gravity ?? -9.81;
  const world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
  const staticBodies = [];
  const _v = new THREE.Vector3();

  const offset = PLAYER.collisionSkin ?? 0.02;
  const characterController = world.createCharacterController(offset);
  characterController.setApplyImpulsesToDynamicBodies(false);
  characterController.setSlideEnabled(true);
  characterController.setMaxSlopeClimbAngle(
    THREE.MathUtils.degToRad(PLAYER.maxSlopeAngle ?? 45),
  );
  characterController.enableAutostep(
    PLAYER.autostepMaxHeight ?? 0.55,
    PLAYER.autostepMinWidth ?? 0.2,
    true,
  );
  // Modest snap — large values fight autostep on low props.
  characterController.enableSnapToGround(PLAYER.characterSnapDist ?? 0.35);

  let playerBody = null;
  let playerCollider = null;

  function addStaticMeshes(meshes) {
    let added = 0;
    for (const mesh of meshes) {
      const data = meshToWorldTrimesh(mesh, _v);
      if (!data) continue;
      try {
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
        const desc = RAPIER.ColliderDesc.trimesh(data.vertices, data.indices)
          .setFriction(0.6)
          .setRestitution(0);
        world.createCollider(desc, body);
        staticBodies.push(body);
        added += 1;
      } catch (err) {
        console.warn('[rapier] trimesh failed', mesh.name, err);
      }
    }
    console.info('[rapier] static colliders', added, '/', meshes.length);
    // Warm broadphase so first casts / character moves see the meshes.
    world.step();
    return added;
  }

  /**
   * Create kinematic capsule. Body translation = capsule center
   * (= feet Y + PLAYER.centerY).
   */
  function createPlayerCapsule(feetX, feetY, feetZ) {
    if (playerBody) {
      world.removeRigidBody(playerBody);
      playerBody = null;
      playerCollider = null;
    }

    const halfH = capsuleHalfHeight();
    const cx = feetX;
    const cy = feetY + PLAYER.centerY;
    const cz = feetZ;

    playerBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(cx, cy, cz),
    );
    playerCollider = world.createCollider(
      RAPIER.ColliderDesc.capsule(halfH, PLAYER.radius)
        .setFriction(0)
        .setRestitution(0),
      playerBody,
    );
    return { playerBody, playerCollider };
  }

  function setPlayerFeetPosition(x, y, z) {
    if (!playerBody) return;
    playerBody.setNextKinematicTranslation({
      x,
      y: y + PLAYER.centerY,
      z,
    });
    // Apply immediately so casts see the new pose before next step.
    playerBody.setTranslation({ x, y: y + PLAYER.centerY, z }, true);
  }

  function getPlayerFeetPosition(out = { x: 0, y: 0, z: 0 }) {
    if (!playerBody) return out;
    const t = playerBody.translation();
    out.x = t.x;
    out.y = t.y - PLAYER.centerY;
    out.z = t.z;
    return out;
  }

  /**
   * Move the capsule by desired world delta.
   * @param {{ allowSnap?: boolean }} [opts] allowSnap false disables snap-to-ground (for jumps)
   */
  function movePlayer(dx, dy, dz, opts = {}) {
    if (!playerCollider || !playerBody) {
      return { x: dx, y: dy, z: dz, grounded: false };
    }

    const allowSnap = opts.allowSnap !== false;
    if (allowSnap) {
      characterController.enableSnapToGround(PLAYER.characterSnapDist ?? 0.35);
    } else {
      characterController.disableSnapToGround();
    }

    characterController.computeColliderMovement(playerCollider, { x: dx, y: dy, z: dz });
    const m = characterController.computedMovement();
    const grounded = characterController.computedGrounded();

    const t = playerBody.translation();
    const next = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
    playerBody.setNextKinematicTranslation(next);
    world.step();
    const after = playerBody.translation();
    return {
      x: after.x - t.x,
      y: after.y - t.y,
      z: after.z - t.z,
      grounded,
    };
  }

  /** Downward ray from capsule center for spawn snap / fallback grounded. */
  function castGround(maxDist = 300) {
    if (!playerBody) return null;
    const t = playerBody.translation();
    const origin = { x: t.x, y: t.y, z: t.z };
    const dir = { x: 0, y: -1, z: 0 };
    const ray = new RAPIER.Ray(origin, dir);
    const hit = world.castRayAndGetNormal(
      ray,
      maxDist,
      true,
      undefined,
      undefined,
      playerCollider,
    );
    if (!hit) return null;
    return {
      toi: hit.timeOfImpact,
      pointY: origin.y - hit.timeOfImpact,
      normalY: hit.normal?.y ?? 1,
    };
  }

  function dispose() {
    world.free();
    playerBody = null;
    playerCollider = null;
    staticBodies.length = 0;
  }

  return {
    world,
    characterController,
    addStaticMeshes,
    createPlayerCapsule,
    setPlayerFeetPosition,
    getPlayerFeetPosition,
    movePlayer,
    castGround,
    dispose,
    get playerBody() {
      return playerBody;
    },
    get playerCollider() {
      return playerCollider;
    },
  };
}
