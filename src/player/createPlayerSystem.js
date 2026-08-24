import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';
import { loadPlayerModel } from './loadPlayer.js';
import { createPlayerController } from './playerController.js';
import { createPlayerAnimator } from './playerAnimator.js';
import { createSnowballSystem } from './snowball.js';
import { createPlayerCamera } from '../camera/playerCamera.js';
import { createPlayerInput } from '../input/playerInput.js';
import { createSnowballHitCounter } from '../ui/snowballHitCounter.js';
import { createFishingSession } from '../fishing/fishingSession.js';
import { createFishingPrompt } from '../ui/fishingPrompt.js';
import { createTraitEquipper } from './traitEquipper.js';
import { createSlideFx } from './slideFx.js';
import { loadSavedCosmeticTraitLoadout } from '../config/traitPersistence.js';
import { TRAIT_TYPE } from '../config/traitsConfig.js';

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
 * Spawn local player + follow camera + locomotion + snowball throw + fishing.
 */
export async function createPlayerSystem({
  scene,
  camera,
  canvas,
  collisionRoot,
  loadingManager,
  fishingHoles = null,
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

  if (fishingHoles) {
    const groundY = playerRoot.position.y - PLAYER.skinWidth;
    fishingHoles.alignToColliders(colliders, groundY);
  }

  const animator = createPlayerAnimator(fbx, animations);
  const textureLoader = new THREE.TextureLoader(loadingManager);
  const [traitEquipper, slideFxTexture] = await Promise.all([
    createTraitEquipper(fbx, loadingManager),
    PLAYER.slideFx?.texture ? textureLoader.loadAsync(PLAYER.slideFx.texture) : Promise.resolve(null),
  ]);

  // Apply locally saved cosmetic loadout.
  // Order matters due to conflict rules: Head/Body should win over FullBody.
  const saved = loadSavedCosmeticTraitLoadout();
  if (saved) {
    // Skin/Face don't conflict, apply them first.
    const applyIf = async (type) => {
      const id = saved[type];
      if (!id) return;
      await traitEquipper.equipTrait(id);
    };

    // Head/Body priority: equip FullBody first, then Head/Body.
    await applyIf(TRAIT_TYPE.Skin);
    await applyIf(TRAIT_TYPE.Face);
    await applyIf(TRAIT_TYPE.FullBody);
    await applyIf(TRAIT_TYPE.Head);
    await applyIf(TRAIT_TYPE.Body);
  }

  const slideFx = createSlideFx(scene, playerRoot, slideFxTexture);
  const playerCamera = createPlayerCamera(camera);
  playerCamera.bind(playerRoot);
  const handBone = findHandBone(playerRoot);
  const hitCounter = createSnowballHitCounter();
  hitCounter.setVisible(true);
  hitCounter.reset();
  const fishingPrompt = createFishingPrompt();

  const _handPos = new THREE.Vector3();
  const _rayOrigin = new THREE.Vector3();
  const _rayDir = new THREE.Vector3();
  const _mouseNdc = new THREE.Vector2();
  const interactRay = new THREE.Raycaster();

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

  const fishingSession = createFishingSession({
    onStepAnim: (clipName) => animator.setFishingClip(clipName),
    onComplete: () => {
      if (animator.actions.holdingFish) {
        animator.playOverride('holdingFish', 0.8);
        setTimeout(() => endFishing(), 800);
      } else {
        endFishing();
      }
    },
    onExit: () => endFishing(),
  });

  const input = createPlayerInput(canvas);
  let throwCooldown = 0;

  function endFishing() {
    traitEquipper.unequipFishingSet();
    if (!fishingSession.active) {
      animator.exitFishing();
      fishingPrompt.hide();
      return;
    }
    fishingSession.exit();
    animator.exitFishing();
    fishingPrompt.hide();
  }

  function beginFishing(hole) {
    traitEquipper.equipFishingSet();
    animator.enterFishing();
    fishingSession.start(hole.id);
    fishingPrompt.showFishing(fishingSession.step);
    console.info('[fishing] started at', hole.id, fishingSession.step);
  }

  function getHandWorldPosition(out) {
    if (handBone) {
      handBone.getWorldPosition(out);
      return out;
    }
    out.set(0.25, 1.0, 0.2);
    playerRoot.localToWorld(out);
    return out;
  }

  function throwSnowball() {
    getHandWorldPosition(_handPos);
    snowballs.spawn(_handPos, playerRoot.quaternion);
  }

  function buildInteractRay(click) {
    if (!click) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _mouseNdc.x = ((click.clientX - rect.left) / rect.width) * 2 - 1;
    _mouseNdc.y = -(((click.clientY - rect.top) / rect.height) * 2 - 1);
    interactRay.setFromCamera(_mouseNdc, camera);
    return interactRay;
  }

  function tryInteract(frame) {
    if (!fishingHoles || fishingSession.active) return;

    const ray = buildInteractRay(frame.interactClick);
    if (!ray) return;

    fishingHoles.updateRange(playerRoot);
    const hole = fishingHoles.raycastInteract(ray);
    if (hole) beginFishing(hole);
  }

  function update(dt) {
    const frame = input.consume();

    if (!fishingSession.active && frame.interactClick) {
      tryInteract(frame);
    }

    if (fishingSession.active) {
      if (frame.returnPressed) {
        endFishing();
      } else if (frame.interactClick) {
        fishingSession.registerStruggleClick();
      }

      fishingSession.update(dt);
      fishingPrompt.showFishing(
        fishingSession.step,
        fishingSession.struggleClicks,
        fishingSession.struggleTarget,
      );

      playerCamera.applyLook(dt, frame, {});
      animator.update(dt, { fishingMode: true });
      playerCamera.follow(dt);
      return;
    }

    if (frame.returnPressed) {
      // unrestricted — no-op
    }

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
    slideFx.update(dt, status);
    snowballs.update(dt);
    playerCamera.follow(dt);

    if (fishingHoles) {
      const inRange = fishingHoles.updateRange(playerRoot);
      if (inRange) fishingPrompt.showNearHole();
      else fishingPrompt.hide();
    }
  }

  function dispose() {
    input.dispose();
    snowballs.dispose();
    slideFx.dispose();
    traitEquipper.dispose();
    hitCounter.setVisible(false);
    fishingPrompt.hide();
    scene.remove(playerRoot);
  }

  return {
    playerRoot,
    controller,
    playerCamera,
    animator,
    hitCounter,
    fishingSession,
    traitEquipper,
    update,
    dispose,
  };
}
