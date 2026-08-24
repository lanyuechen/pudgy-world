import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';
import { loadPlayerModel } from './loadPlayer.js';
import { createPlayerController } from './playerController.js';
import { createPlayerAnimator } from './playerAnimator.js';
import { createSnowballSystem } from './snowball.js';
import { createPlayerCamera } from '../camera/playerCamera.js';
import { createPlayerInput } from '../input/playerInput.js';
import { createSnowballHitCounter } from '../ui/snowballHitCounter.js';

function collectColliders(root) {
  const meshes = [];
  root?.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  return meshes;
}

function findHandBone(root) {
  const names = PLAYER.snowballHandBones ?? ['R_Arm_02_end', 'R_Arm_02'];
  let found = null;
  root.traverse((obj) => {
    if (found) return;
    if (names.includes(obj.name)) found = obj;
  });
  return found;
}

/**
 * Spawn local player + follow camera + locomotion clips + snowball throw.
 * Throw matches Player.cs Simulate / ThrowSnowball + Snowball.cs.
 */
export async function createPlayerSystem({
  scene,
  camera,
  canvas,
  collisionRoot,
  loadingManager,
  spawn = PLAYER.spawn,
} = {}) {
  const { root: model, fbx, animations } = await loadPlayerModel(loadingManager);
  const playerRoot = new THREE.Group();
  playerRoot.name = 'Player';
  playerRoot.add(model);
  playerRoot.position.set(spawn.x, spawn.y, spawn.z);
  scene.add(playerRoot);

  const colliders = collectColliders(collisionRoot);
  const controller = createPlayerController(playerRoot, { colliders });
  if (!controller.snapToGroundIfNeeded()) {
    console.warn('[player] ground snap failed at', playerRoot.position.toArray());
    playerRoot.position.y = 1;
  }

  const animator = createPlayerAnimator(fbx, animations);
  const playerCamera = createPlayerCamera(camera);
  playerCamera.bind(playerRoot);
  const handBone = findHandBone(playerRoot);
  const hitCounter = createSnowballHitCounter();
  hitCounter.setVisible(true);
  hitCounter.reset();

  const _handPos = new THREE.Vector3();
  const snowballs = createSnowballSystem(scene, {
    getColliders: () => colliders,
    isSourceObject: (obj) => {
      let p = obj;
      while (p) {
        if (p === playerRoot) return true;
        p = p.parent;
      }
      return false;
    },
    onHit: () => hitCounter.onHit(),
  });

  const input = createPlayerInput(canvas);
  let throwCooldown = 0;

  console.info(
    '[player] spawned at',
    playerRoot.position.toArray(),
    'hand',
    handBone?.name ?? '(fallback)',
    'clips',
    animations.map((a) => a.name),
  );

  function getHandWorldPosition(out) {
    if (handBone) {
      handBone.getWorldPosition(out);
      return out;
    }
    // Fallback if bone missing: roughly right-hand height in front of chest
    out.set(0.25, 1.0, 0.2);
    playerRoot.localToWorld(out);
    return out;
  }

  /**
   * Player.cs ThrowSnowball
   */
  function throwSnowball() {
    getHandWorldPosition(_handPos);
    snowballs.spawn(_handPos, playerRoot.quaternion);
  }

  function update(dt) {
    const frame = input.consume();

    // Player.cs Simulate — throw before / with movement
    let throwStarted = false;
    if (frame.throwSnowball && throwCooldown <= 0) {
      throwCooldown = PLAYER.throwCooldown;
      throwSnowball();
      throwStarted = true;
    }
    throwCooldown = Math.max(0, throwCooldown - dt);

    const status = controller.update(
      dt,
      frame,
      playerCamera.getForward(),
      playerCamera.getRight(),
    );
    status.throwStarted = throwStarted;

    playerCamera.applyLook(dt, frame, status);
    animator.update(dt, status);
    snowballs.update(dt);
    playerCamera.follow(dt);
  }

  function dispose() {
    input.dispose();
    snowballs.dispose();
    hitCounter.setVisible(false);
    scene.remove(playerRoot);
  }

  return {
    playerRoot,
    controller,
    playerCamera,
    animator,
    hitCounter,
    update,
    dispose,
  };
}
