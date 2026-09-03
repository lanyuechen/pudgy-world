import * as THREE from 'three';
import { PLAYER, CONTROL } from '../config/playerConfig.js';
import { loadPlayerModel } from './loadPlayer.js';
import { createCharacterController } from '../control/characterController.js';
import { createSpringArmCamera } from '../control/springArmCamera.js';
import { createControlInput } from '../control/playerInput.js';
import { createVirtualJoystick } from '../ui/virtualJoystick.js';
import { createPlayerAnimator } from './playerAnimator.js';
import { createSnowballSystem } from './snowball.js';
import { createMinimap } from '../ui/minimap.js';
import { createSkillBar } from '../ui/skillBar.js';
import { createPlayerSkillSystem } from '../combat/playerSkills.js';
import { createCombatHud } from '../ui/combatHud.js';
import { createCombatHitFeedback } from '../ui/combatHitFeedback.js';
import { createPlayerHpBar } from '../ui/playerHpBar.js';
import { pitchTToLaunchSin, computeLockedThrowVelocity } from '../combat/targetSnap.js';
import { COMBAT } from '../config/combatConfig.js';
import { chargeLevelToSpeed, predictCrosshairTarget, solveLockOnBallistic, applyAccuracyElevationJitter } from '../combat/ballisticAim.js';
import {
  moveSpeedMultiplier,
  playerMaxHp,
  playerSnowballDamage,
  throwSpeedMultiplier,
} from '../config/playerStats.js';
import { createTrajectoryPreview } from '../combat/trajectoryPreview.js';
import { createFishingSession } from '../fishing/fishingSession.js';
import { createFishingPrompt } from '../ui/fishingPrompt.js';
import { createTraitEquipper } from './traitEquipper.js';
import { createSlideFx } from './slideFx.js';
import { createCatchPresenter } from '../fishing/catchPresenter.js';
import { createQuarksFx } from '../effects/createQuarksFx.js';
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

function collectPlayerMeshes(root) {
  const meshes = [];
  root?.traverse((child) => {
    if (child.isMesh && !child.userData?.isHullOutlineMesh) meshes.push(child);
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
  enemies = null,
  spawn = PLAYER.spawn,
  /** When false, leave the current camera pose (e.g. after scene slide) until setConfigMode. */
  syncCamera = true,
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
    console.warn('[player] ground snap failed at', controller.getPhysicsFeet().toArray());
    controller.getPhysicsFeet().set(spawn.x, 1, spawn.z);
    physics.setPlayerFeetPosition(spawn.x, 1, spawn.z);
    controller.snapDisplayPosition();
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
  playerCamera.bind(playerRoot, { syncCamera });
  const handBone = findHandBone(playerRoot);
  const minimap = createMinimap({ mapRoot: collisionRoot });
  const combatHud = createCombatHud();
  const combatHitFeedback = createCombatHitFeedback();
  const combatActive = Boolean(enemies);
  const playerHpBar = createPlayerHpBar(document.getElementById('player-hp-bar'));
  let maxHp = playerMaxHp();
  let hp = maxHp;
  playerHpBar.set(hp, maxHp);
  playerHpBar.setVisible(true);
  const quarksFx = combatActive ? await createQuarksFx(scene, loadingManager) : null;
  minimap.setVisible(combatActive);
  combatHud.setVisible(combatActive);
  combatHitFeedback.setVisible(combatActive);
  if (combatActive) combatHud.reset(enemies.getWaveTargetCount());
  const trajectoryPreview = combatActive
    ? createTrajectoryPreview(scene, { getColliders: () => colliders })
    : null;
  const fishingPrompt = createFishingPrompt();

  const _handPos = new THREE.Vector3();
  const _aimDir = new THREE.Vector3();
  const _aimPoint = new THREE.Vector3();
  const _launchVel = new THREE.Vector3();
  const _cameraRight = new THREE.Vector3();
  const _camFwd = new THREE.Vector3();
  const _lockNdc = new THREE.Vector3();
  const _lockLosDir = new THREE.Vector3();
  const _mouseNdc = new THREE.Vector2();
  const interactRay = new THREE.Raycaster();
  let aimYawRad = null;
  /** @type {THREE.Vector3 | null} */
  let chargeAimPoint = null;
  /** @type {THREE.Vector3 | null} */
  let chargeBaseAimPoint = null;
  let throwPitchT = 0.5;
  let throwChargeStartNX = 0;
  let throwChargeStartNY = 0;
  let wasThrowCharging = false;
  let playerHitCooldown = 0;
  /** True while any config tab is open — ignore enemy snowball hits. */
  let configInvincible = false;
  const playerMeshes = collectPlayerMeshes(playerRoot);

  function syncHpFromVitality() {
    const nextMax = playerMaxHp();
    if (nextMax === maxHp) return;
    const delta = nextMax - maxHp;
    maxHp = nextMax;
    if (delta > 0) hp += delta;
    else hp = Math.min(hp, maxHp);
    playerHpBar.set(hp, maxHp);
  }

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
    getEntityTargets: () => (enemies ? enemies.getEntityTargets() : []),
    getPlayerTarget: () =>
      combatActive
        ? {
            id: 'player',
            alive: hp > 0 && !configInvincible && playerHitCooldown <= 0,
            sourceRoot: playerRoot,
            meshes: playerMeshes,
          }
        : null,
    onEnvironmentHit: () => {},
    onEntityHit: (target, ball, hitPoint) => {
      if (ball?.sourceId !== 'player') return;
      const result = enemies?.applyDamage(
        target,
        ball.damage ?? COMBAT.snowballDamage,
        ball,
      );
      // Killing blow: death FX only (no hit bang).
      if (hitPoint && result?.applied && !result.killed) {
        quarksFx?.playHitAt(hitPoint);
      }
    },
    onPlayerHit: (ball) => {
      if (configInvincible || hp <= 0) return;
      if (ball?.sourceId === 'player' || playerHitCooldown > 0) return;
      applyPlayerHit(
        ball?.sourceRoot ?? null,
        ball?.velocity ?? null,
        ball?.damage ?? COMBAT.snowballDamage,
      );
    },
  });

  function applyPlayerHit(sourceRoot = null, velocity = null, damageAmount = COMBAT.snowballDamage) {
    if (configInvincible || playerHitCooldown > 0 || hp <= 0) return;
    playerHitCooldown = COMBAT.playerHitInvuln ?? 0.55;
    const dmg = Math.max(0, Number(damageAmount) || 0);
    if (dmg > 0) {
      hp = Math.max(0, hp - dmg);
      playerHpBar.set(hp, maxHp);
    }
    const dir = velocity?.clone?.() ?? new THREE.Vector3();
    dir.y = 0;
    if (dir.lengthSq() < 1e-6 && sourceRoot) {
      dir.set(
        playerRoot.position.x - sourceRoot.position.x,
        0,
        playerRoot.position.z - sourceRoot.position.z,
      );
    }
    if (dir.lengthSq() > 1e-6) {
      dir.normalize();
      controller.applyKnockback(dir.x, dir.z, COMBAT.playerKnockbackSpeed ?? 6);
    }
    combatHitFeedback.pulse();
    playerCamera.addShake(
      COMBAT.playerHitShake ?? 0.1,
      COMBAT.playerHitShakeDuration ?? 0.22,
    );
  }

  if (enemies) {
    enemies.bindCombat({
      spawnEnemySnowball: (origin, opts) => snowballs.spawn(origin, opts),
      onKill: () => combatHud.addKill(),
      onWaveStart: (total) => combatHud.resetWave(total),
      onEnemyDeath: (position) => quarksFx?.playDeathAt(position),
      onPlayerContact: (enemy) =>
        applyPlayerHit(enemy?.root ?? null, null, COMBAT.enemyMeleeDamage ?? 1),
      physics,
    });
  }

  const skills = createPlayerSkillSystem({
    snowballs,
    getHandWorldPosition,
    buildThrowVelocity,
  });

  let preferBallisticAim = false;
  let pendingThrowAnim = false;

  const skillBar = createSkillBar({
    onSelectSkill: (id) => {
      if (skills.getSelected() === id) skills.selectNormal();
      else skills.selectSkill(id);
      skillBar.sync(skills.getUiState());
    },
    onAttack: () => {
      performAutoAttack();
    },
  });
  skillBar.setVisible(combatActive);

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
  input.setThrowChargeEnabled(combatActive);
  const joystick = createVirtualJoystick({
    onMove: (x, y) => input.setStick(x, y),
  });
  joystick.setVisible(true);
  let throwCooldown = 0;
  let logicAccum = 0;
  let framePointerX = window.innerWidth * 0.5;
  let framePointerY = window.innerHeight * 0.5;
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

  function syncJoystickVisible() {
    const show = !configInvincible && !input.uiOpen;
    joystick.setVisible(show);
    if (!show) input.setStick(0, 0);
  }

  function setInputLocked(locked) {
    input.setUiOpen(locked);
    playerCamera.setUiOpen(locked);
    syncJoystickVisible();
  }

  /**
   * Config panel camera / move lock.
   * @param {null | 'player' | 'skin' | 'scene' | 'showcase' | 'effects' | 'controls' | 'settings' | 'skills'} mode
   * @param {{ box?: import('three').Box3, snap?: boolean, fromCurrent?: boolean }} [opts]
   */
  function setConfigMode(mode, opts = {}) {
    configInvincible = mode != null;
    syncJoystickVisible();
    if (mode === 'skin') {
      input.setMoveLocked(true);
      input.setLookLocked(false);
      playerCamera.setUiOpen(false);
      playerCamera.enterSkinPreview();
      return;
    }
    if (mode === 'player' || mode === 'controls' || mode === 'settings' || mode === 'skills') {
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
      if (opts.box) {
        playerCamera.enterScenePreview(opts.box, {
          snap: Boolean(opts.snap),
          fromCurrent: Boolean(opts.fromCurrent),
        });
      }
      return;
    }
    if (mode === 'showcase' || mode === 'effects') {
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

  function buildPointerRay(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _mouseNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    interactRay.setFromCamera(_mouseNdc, camera);
    return interactRay;
  }

  function predictAimTarget(clientX, clientY, out) {
    getHandWorldPosition(_handPos);
    return predictCrosshairTarget({
      origin: _handPos,
      camera,
      canvas,
      clientX,
      clientY,
      colliders,
      out,
    });
  }

  function updateChargeAim(frame) {
    if (!chargeAimPoint || !chargeBaseAimPoint) return;

    getHandWorldPosition(_handPos);
    const deltaNX = frame.pointerNX - throwChargeStartNX;
    const yawSpan = COMBAT.aimYawSensitivity ?? 12;
    const aimXSign = CONTROL.invertLookX ? -1 : 1;
    const minY = _handPos.y + (COMBAT.minTargetYOffset ?? 0.08);

    _cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _cameraRight.y = 0;
    if (_cameraRight.lengthSq() < 1e-6) _cameraRight.set(1, 0, 0);
    else _cameraRight.normalize();

    chargeAimPoint.copy(chargeBaseAimPoint);
    chargeAimPoint.addScaledVector(_cameraRight, deltaNX * yawSpan * aimXSign);
    if (chargeAimPoint.y < minY) chargeAimPoint.y = minY;
  }

  function beginChargeAim(clientX, clientY) {
    chargeBaseAimPoint = predictAimTarget(clientX, clientY, new THREE.Vector3());
    chargeAimPoint = chargeBaseAimPoint.clone();
  }

  function updateThrowPitch(frame) {
    if (!frame.isCharging || !chargeAimPoint) {
      wasThrowCharging = false;
      return;
    }
    if (!wasThrowCharging) {
      throwChargeStartNX = frame.pointerNX;
      throwChargeStartNY = frame.pointerNY;
      throwPitchT = 0.5;
    }
    const delta = frame.pointerNY - throwChargeStartNY;
    throwPitchT = THREE.MathUtils.clamp(
      0.5 + delta * (COMBAT.pitchSensitivity ?? 1.4),
      0,
      1,
    );
    wasThrowCharging = true;
  }

  function getChargeAimPoint(out) {
    return out.copy(chargeAimPoint);
  }

  function buildThrowVelocity(chargeLevel, out) {
    getHandWorldPosition(_handPos);
    const strengthMul = throwSpeedMultiplier();
    const speed = chargeLevelToSpeed(chargeLevel) * strengthMul;
    getChargeAimPoint(_aimPoint);
    if (preferBallisticAim) {
      const vmax = (COMBAT.throwSpeedMax ?? 22) * strengthMul;
      solveLockOnBallistic(_handPos, _aimPoint, out, PLAYER.gravity, vmax);
      return out;
    }
    const pitchSin = pitchTToLaunchSin(throwPitchT);
    computeLockedThrowVelocity(_handPos, _aimPoint, speed, pitchSin, out);
    return out;
  }

  function isUnderObject(obj, root) {
    if (!root || !obj) return false;
    let p = obj;
    while (p) {
      if (p === root) return true;
      p = p.parent;
    }
    return false;
  }

  /**
   * Lock target must be on-screen (camera frustum) and have clear LOS from the camera.
   */
  function isEnemyInSight(enemy) {
    const root = enemy?.sourceRoot;
    if (!root) return false;

    const body = (COMBAT.enemyAimHeight ?? 1.4) * 0.55;
    _aimPoint.set(root.position.x, root.position.y + body, root.position.z);

    camera.updateMatrixWorld(true);
    _lockNdc.copy(_aimPoint).project(camera);
    // Outside NDC rectangle / behind camera clip
    if (
      !Number.isFinite(_lockNdc.x) ||
      !Number.isFinite(_lockNdc.y) ||
      !Number.isFinite(_lockNdc.z) ||
      Math.abs(_lockNdc.x) > 1.02 ||
      Math.abs(_lockNdc.y) > 1.02 ||
      _lockNdc.z < -1 ||
      _lockNdc.z > 1
    ) {
      return false;
    }

    camera.getWorldDirection(_camFwd);
    _lockLosDir.subVectors(_aimPoint, camera.position);
    const dist = _lockLosDir.length();
    if (dist < 0.15) return true;
    if (_lockLosDir.dot(_camFwd) <= 0) return false;

    if (!colliders.length) return true;

    _lockLosDir.multiplyScalar(1 / dist);
    interactRay.set(camera.position, _lockLosDir);
    interactRay.near = 0.08;
    interactRay.far = Math.max(0.1, dist - 0.4);
    const hits = interactRay.intersectObjects(colliders, false);
    for (const hit of hits) {
      const obj = hit.object;
      if (isUnderObject(obj, playerRoot)) continue;
      if (isUnderObject(obj, root)) continue;
      if (enemy.meshes?.some((m) => obj === m || isUnderObject(obj, m))) continue;
      return false;
    }
    return true;
  }

  function findNearestEnemyTarget() {
    if (!enemies) return null;
    const targets = enemies.getEntityTargets?.() ?? [];
    const px = playerRoot.position.x;
    const py = playerRoot.position.y;
    const pz = playerRoot.position.z;
    let best = null;
    let bestDist = Infinity;
    for (const t of targets) {
      if (!t?.alive || !t.sourceRoot) continue;
      if (!isEnemyInSight(t)) continue;
      const p = t.sourceRoot.position;
      const d = Math.hypot(p.x - px, p.y - py, p.z - pz);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  function aimPointAtEnemy(enemy, out) {
    const p = enemy.sourceRoot.position;
    const body = (COMBAT.enemyAimHeight ?? 1.4) * 0.55;
    out.set(p.x, p.y + body, p.z);
    return out;
  }

  function faceTowardAim(aim) {
    const dx = aim.x - playerRoot.position.x;
    const dz = aim.z - playerRoot.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    playerRoot.rotation.y = Math.atan2(dx, dz);
  }

  /**
   * Attack button: lock nearest enemy, throw snowball or cast selected skill.
   * No attack cooldown — skill CDs still apply (falls back to normal throw).
   */
  function performAutoAttack() {
    if (!combatActive || configInvincible) return;
    if (fishingBusy || fishingSession.active || animator.isFishing) return;
    if (skills.isExecuting()) return;

    const enemy = findNearestEnemyTarget();
    if (!enemy) return;

    // Face first so hand bone / throw origin match aim direction.
    aimPointAtEnemy(enemy, _aimPoint);
    faceTowardAim(_aimPoint);
    playerRoot.updateMatrixWorld(true);

    aimPointAtEnemy(enemy, _aimPoint);
    chargeAimPoint = _aimPoint.clone();
    chargeBaseAimPoint = chargeAimPoint.clone();
    preferBallisticAim = true;

    // Skills still take a charge hint; lock-on snowball uses solveLockOnBallistic (≤ full charge).
    const chargeLevel = 1;

    const skillId = skills.getSelected();
    let usedSkill = false;
    if (skillId) {
      usedSkill = skills.tryCast({
        skillId,
        chargeLevel,
        aimPoint: chargeAimPoint.clone(),
        sourceRoot: playerRoot,
      });
    }
    if (!usedSkill) {
      throwSnowball(chargeLevel);
    }

    pendingThrowAnim = true;
    preferBallisticAim = false;
    chargeAimPoint = null;
    chargeBaseAimPoint = null;
    skillBar.sync(skills.getUiState());
  }

  function updateTrajectoryPreview(chargeLevel) {
    if (!trajectoryPreview || !chargeAimPoint) {
      trajectoryPreview?.setVisible(false);
      return;
    }
    buildThrowVelocity(chargeLevel, _launchVel);
    trajectoryPreview.update({ origin: _handPos, velocity: _launchVel, visible: true });
  }

  function getAimYawFromCharge() {
    getHandWorldPosition(_handPos);
    getChargeAimPoint(_aimPoint);
    _aimDir.subVectors(_aimPoint, _handPos);
    _aimDir.y = 0;
    if (_aimDir.lengthSq() < 1e-6) return playerRoot.rotation.y;
    return Math.atan2(_aimDir.x, _aimDir.z);
  }

  /** @param {number} chargeLevel 0–1 */
  function throwSnowball(chargeLevel = 0) {
    if (!chargeAimPoint) return;
    buildThrowVelocity(chargeLevel, _launchVel);
    applyAccuracyElevationJitter(_launchVel);
    getHandWorldPosition(_handPos);
    snowballs.spawn(_handPos, {
      velocity: _launchVel,
      sourceId: 'player',
      sourceRoot: playerRoot,
      damage: playerSnowballDamage(),
    });
  }

  function tryThrowSkill(chargeLevel) {
    const skillId = skills.getSelected();
    if (!skillId || !chargeAimPoint) return false;
    return skills.tryCast({
      skillId,
      chargeLevel,
      aimPoint: chargeAimPoint,
      sourceRoot: playerRoot,
    });
  }

  function buildInteractRay(click) {
    if (!click) return null;
    return buildPointerRay(click.clientX, click.clientY);
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

    controller.setMoveSpeedScale(moveSpeedMultiplier());
    syncHpFromVitality();

    if (frame.pointerOnCanvas || frame.isCharging || frame.pointerDown) {
      framePointerX = frame.pointerClientX;
      framePointerY = frame.pointerClientY;
    }

    if (combatActive && (frame.pointerOnCanvas || frame.isCharging)) {
      if (frame.isCharging && !chargeAimPoint) {
        beginChargeAim(framePointerX, framePointerY);
      }

      updateThrowPitch(frame);

      if (frame.isCharging && chargeAimPoint) {
        updateChargeAim(frame);
      }

      if (frame.isCharging && chargeAimPoint) {
        updateTrajectoryPreview(frame.chargeLevel ?? 0);
      } else {
        trajectoryPreview?.setVisible(false);
      }
    } else if (combatActive) {
      trajectoryPreview?.setVisible(false);
    }

    aimYawRad = frame.isCharging && chargeAimPoint ? getAimYawFromCharge() : null;

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
      controller.updateDisplayPosition(dt, { grounded: lastStatus.grounded });
      playerCamera.lateUpdate(dt, frame, {});
      return;
    }

    let throwStarted = false;
    if (pendingThrowAnim) {
      throwStarted = true;
      pendingThrowAnim = false;
    } else if (frame.chargeRelease && throwCooldown <= 0 && chargeAimPoint) {
      throwCooldown = PLAYER.throwCooldown;
      if (tryThrowSkill(frame.chargeRelease.chargeLevel)) {
        throwStarted = true;
      } else {
        throwSnowball(frame.chargeRelease.chargeLevel);
        throwStarted = true;
      }
      chargeAimPoint = null;
      chargeBaseAimPoint = null;
    } else if (frame.throwSnowball && throwCooldown <= 0) {
      throwCooldown = PLAYER.throwCooldown;
      if (!chargeAimPoint) beginChargeAim(framePointerX, framePointerY);
      throwPitchT = 0.5;
      if (tryThrowSkill(0)) {
        throwStarted = true;
      } else {
        throwSnowball(0);
        throwStarted = true;
      }
      chargeAimPoint = null;
      chargeBaseAimPoint = null;
    } else if (!frame.isCharging && !frame.pointerDown) {
      chargeAimPoint = null;
      chargeBaseAimPoint = null;
    }
    throwCooldown = Math.max(0, throwCooldown - dt);
    skills.update(dt);
    skillBar.sync(skills.getUiState());

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
        {
          ...frame,
          jump: pendingJump,
          faceYawRad: aimYawRad,
        },
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

    controller.updateDisplayPosition(dt, {
      grounded: status.grounded,
      jumpStarted: status.jumpStarted,
    });
    animator.update(dt, status);
    slideFx.update(dt, status);
    snowballs.update(dt);
    quarksFx?.update(dt);
    combatHitFeedback.update(dt);
    playerHitCooldown = Math.max(0, playerHitCooldown - dt);
    combatHud.update();
    playerCamera.lateUpdate(dt, frame, status);
    if (CONTROL.thirdPersonYawMode === 'cameraFollow' && aimYawRad == null) {
      controller.syncFacingToCamera(playerCamera.getViewYawRad(), dt);
    }
    if (enemies) {
      enemies.update(dt, {
        playerPos: playerRoot.position,
        playerBalls: snowballs.getPlayerProjectiles(),
      });
      minimap.update(
        {
          x: playerRoot.position.x,
          z: playerRoot.position.z,
          yaw: playerRoot.rotation.y,
        },
        enemies.getAliveMarkers(),
      );
    }

    if (fishingHoles) {
      const inRange = fishingHoles.updateRange(playerRoot);
      if (inRange) fishingPrompt.showNearHole();
      else fishingPrompt.hide();
    }
  }

  function dispose() {
    joystick.dispose();
    window.clearTimeout(catchDismissTimer);
    input.dispose();
    snowballs.dispose();
    quarksFx?.dispose();
    slideFx.dispose();
    catchPresenter.dispose();
    traitEquipper.dispose();
    skills.dispose();
    skillBar.dispose();
    trajectoryPreview?.dispose();
    minimap.dispose();
    combatHud.dispose();
    combatHitFeedback.dispose();
    playerHpBar.dispose();
    physics.dispose();
    minimap.setVisible(false);
    combatHud.setVisible(false);
    playerHpBar.setVisible(false);
    fishingPrompt.hide();
    scene.remove(playerRoot);
  }

  return {
    playerRoot,
    fbx,
    controller,
    physics,
    playerCamera,
    animator,
    fishingSession,
    traitEquipper,
    setInputLocked,
    setConfigMode,
    update,
    dispose,
  };
}
