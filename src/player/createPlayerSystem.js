import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';
import { loadPlayerModel } from './loadPlayer.js';
import { createPlayerController } from './playerController.js';
import { createPlayerAnimator } from './playerAnimator.js';
import { createPlayerCamera } from '../camera/playerCamera.js';
import { createPlayerInput } from '../input/playerInput.js';

function collectColliders(root) {
  const meshes = [];
  root?.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  return meshes;
}

/**
 * Spawn local player + follow camera + locomotion clips.
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

  const input = createPlayerInput(canvas);
  console.info(
    '[player] spawned at',
    playerRoot.position.toArray(),
    'clips',
    animations.map((a) => a.name),
  );

  function update(dt) {
    const frame = input.consume();
    playerCamera.applyLook(dt, frame);
    const status = controller.update(
      dt,
      frame,
      playerCamera.getForward(),
      playerCamera.getRight(),
    );
    animator.update(dt, status);
    playerCamera.follow(dt);
  }

  function dispose() {
    input.dispose();
    scene.remove(playerRoot);
  }

  return {
    playerRoot,
    controller,
    playerCamera,
    animator,
    update,
    dispose,
  };
}
