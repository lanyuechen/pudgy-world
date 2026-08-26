import * as THREE from 'three';
import { PLAYER, CONTROL } from '../config/playerConfig.js';
import { loadPlayerModel } from './loadPlayer.js';
import { createCharacterController } from '../control/characterController.js';
import { createSpringArmCamera } from '../control/springArmCamera.js';
import { createControlInput } from '../control/playerInput.js';
import { createPlayerAnimator } from './playerAnimator.js';
import { createSnowballSystem } from './snowball.js';
import { createSnowballHitCounter } from '../ui/snowballHitCounter.js';
import { createFishingSession } from '../fishing/fishingSession.js';
import { createFishingPrompt } from '../ui/fishingPrompt.js';
import { createTraitEquipper } from './traitEquipper.js';
import { createSlideFx } from './slideFx.js';
import { createCatchPresenter } from '../fishing/catchPresenter.js';
import { loadSavedCosmeticTraitLoadout } from '../config/traitPersistence.js';
import { TRAIT_TYPE } from '../config/traitsConfig.js';
import { FISHING } from '../config/fishingConfig.js';
import { CATCH_HOLD_DURATION } from '../config/fishConfig.js';
import { initRapier, createPhysicsWorld } from '../physics/createPhysicsWorld.js';

function collectColliders(root) {
  const meshes = [];
  root?.traverse((child) => {
    if (!child.isMesh) return;
    // Hull outlines / FX should not block the player.
    if (child.userData?.isHullOutlineMesh || child.userData?.skipCollision) return;
    if (child.userData?.isSnowball || child.userData?.isFishingHole) return;
    meshes.push(child);
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

  // Three.js meshes: snowballs / fishing align. Rapier: player locomotion.
  const colliders = collectColliders(collisionRoot);

  await initRapier();
  const physics = createPhysicsWorld();
  physics.addStaticMeshes(colliders);
  physics.createPlayerCapsule(spawn.x, spawn.y, spawn.z);

  // docs: CharacterFixedTick + CameraLateUpdate (new control layer)
  const controller = createCharacterController(playerRoot, { physics });
  if (!controller.snapToGroundIfNeeded()) {
    console.warn('[player] ground snap failed at', playerRoot.position.toArray());
    playerRoot.position.y = 1;
    physics.setPlayerFeetPosition(playerRoot.position.x, 1, playerRoot.position.z);
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
  const playerCamera = createSpringArmCamera(camera);
  playerCamera.setObstacles(colliders);
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

  const catchPresenter = createCatchPresenter({ playerRoot, loadingManager });
  let catchDismissTimer = 0;
  /** True from cast start until fishing fully ends (includes catch present). */
  let fishingBusy = false;

  const fishingSession = createFishingSession({
    onStepAnim: (clipName) => animator.setFishingClip(clipName),
    onComplete: () => {
      void presentCatchAndFinish();
    },
    onExit: () => endFishing(),
  });

  const input = createControlInput(canvas);
  let throwCooldown = 0;
  let logicAccum = 0;
  /** Space edge latched until one jump attempt is made (or timeout). */
  let pendingJump = false;
  let pendingJumpAge = 0;
  let lastStatus = {
    grounded: true,
    moving: false,
    turning: false,
    sliding: false,
    jumpStarted: false,
    velocity: new THREE.Vector3(),
    facingYawDeg: 0,
  };

  function setInputLocked(locked) {
    input.setUiOpen(locked);
    playerCamera.setUiOpen(locked);
  }

  /**
   * Config panel camera / move lock.
   * @param {null | 'skin' | 'scene' | 'showcase' | 'controls'} mode
   * @param {{ box?: import('three').Box3 }} [opts]
   */
  function setConfigMode(mode, opts = {}) {
    if (mode === 'skin') {
      input.setMoveLocked(true);
      input.setLookLocked(false);
      playerCamera.setUiOpen(false);
      playerCamera.enterSkinPreview();
      return;
    }
    if (mode === 'controls') {
      input.setMoveLocked(false);
      input.setLookLocked(false);
      playerCamera.setUiOpen(false);
      playerCamera.enterSkinPreview();
      return;
    }
    if (mode === 'scene') {
      input.setMoveLocked(true);
      input.setLookLocked(false);
      playerCamera.setUiOpen(false);
      if (opts.box) playerCamera.enterScenePreview(opts.box);
      return;
    }
    if (mode === 'showcase') {
      input.setMoveLocked(true);
      input.setLookLocked(true);
      playerCamera.setUiOpen(false);
      playerCamera.exitConfigPreview();
      return;
    }
    input.setMoveLocked(false);
    input.setLookLocked(false);
    playerCamera.setUiOpen(false);
    playerCamera.exitConfigPreview();
  }

  async function presentCatchAndFinish() {
    traitEquipper.unequipFishingSet();
    const duration = CATCH_HOLD_DURATION ?? FISHING.catchPoseHold ?? 2.4;
    // Pose first so FishingRod socket is in HoldingFish before the fish attaches.
    animator.beginCatchPresentation(duration);
    try {
      const result = await catchPresenter.presentCatch();
      if (result?.fish) fishingPrompt.showCatch(result.fish);
      window.clearTimeout(catchDismissTimer);
      catchDismissTimer = window.setTimeout(() => endFishing(), duration * 1000);
    } catch (err) {
      console.error('[fishing] catch present failed', err);
      endFishing();
    }
  }

  function endFishing() {
    window.clearTimeout(catchDismissTimer);
    catchDismissTimer = 0;
    fishingBusy = false;
    setInputLocked(false);
    catchPresenter.dismiss();
    traitEquipper.unequipFishingSet();
    if (fishingSession.active) fishingSession.exit();
    animator.exitFishing();
    fishingPrompt.hide();
  }

  function beginFishing(hole) {
    fishingBusy = true;
    setInputLocked(true);
    traitEquipper.equipFishingSet();
    animator.enterFishing();
    fishingSession.start(hole.id);
    fishingPrompt.showFishing(fishingSession.step);
    console.info('[fishing] started', hole.id, fishingSession.step);
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
    if (!fishingHoles || fishingBusy || fishingSession.active) return;

    const ray = buildInteractRay(frame.interactClick);
    if (!ray) return;

    fishingHoles.updateRange(playerRoot);
    const hole = fishingHoles.raycastInteract(ray);
    if (hole) beginFishing(hole);
  }

  function update(dt) {
    const frame = input.consume();
    const fixedDt = CONTROL.fixedDt;

    if (!fishingBusy && !fishingSession.active && frame.interactClick) {
      tryInteract(frame);
    }

    if (fishingBusy || fishingSession.active || animator.isFishing) {
      if (frame.returnPressed) {
        endFishing();
      } else if (fishingSession.active && frame.interactClick) {
        fishingSession.registerStruggleClick();
      }

      if (fishingSession.active) {
        fishingSession.update(dt);
        fishingPrompt.showFishing(
          fishingSession.step,
          fishingSession.struggleClicks,
          fishingSession.struggleTarget,
        );
      }

      animator.update(dt, { fishingMode: true });
      playerCamera.lateUpdate(dt, frame, {});
      return;
    }

    let throwStarted = false;
    if (frame.throwSnowball && throwCooldown <= 0) {
      throwCooldown = PLAYER.throwCooldown;
      throwSnowball();
      throwStarted = true;
    }
    throwCooldown = Math.max(0, throwCooldown - dt);

    // Jump: latch Space edge → try once on next grounded tick (≤0.2s).
    if (frame.jump) {
      pendingJump = true;
      pendingJumpAge = 0;
    }
    if (pendingJump) {
      pendingJumpAge += dt;
      if (pendingJumpAge > 0.2) pendingJump = false;
    }

    logicAccum += Math.min(dt, 0.1);
    let status = lastStatus;
    let jumpedThisFrame = false;
    let steps = 0;
    while (logicAccum >= fixedDt && steps < 5) {
      status = controller.fixedTick(
        fixedDt,
        { ...frame, jump: pendingJump },
        playerCamera.getYawRad(),
        { uiOpen: frame.uiOpen },
      );
      if (status.jumpStarted) {
        pendingJump = false;
        jumpedThisFrame = true;
      }
      logicAccum -= fixedDt;
      steps += 1;
    }
    status = {
      ...status,
      jumpStarted: jumpedThisFrame,
      throwStarted,
      sliding: !!(status.moving && frame.run),
    };
    lastStatus = status;

    animator.update(dt, status);
    slideFx.update(dt, status);
    snowballs.update(dt);
    playerCamera.lateUpdate(dt, frame, status);

    if (fishingHoles) {
      const inRange = fishingHoles.updateRange(playerRoot);
      if (inRange) fishingPrompt.showNearHole();
      else fishingPrompt.hide();
    }
  }

  function dispose() {
    window.clearTimeout(catchDismissTimer);
    input.dispose();
    snowballs.dispose();
    slideFx.dispose();
    catchPresenter.dispose();
    traitEquipper.dispose();
    physics.dispose();
    hitCounter.setVisible(false);
    fishingPrompt.hide();
    scene.remove(playerRoot);
  }

  return {
    playerRoot,
    controller,
    physics,
    playerCamera,
    animator,
    hitCounter,
    fishingSession,
    traitEquipper,
    setInputLocked,
    setConfigMode,
    update,
    dispose,
  };
}
