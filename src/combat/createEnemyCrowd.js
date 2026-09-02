import * as THREE from 'three';
import { ASSET_LOAD_CONCURRENCY, mapPool } from '../util/mapPool.js';
import { bindNpcAnimations, loadNpcModel } from '../npc/loadNpc.js';
import { COMBAT } from '../config/combatConfig.js';
import { CONTROL, PLAYER } from '../config/playerConfig.js';
import { createEnemyAiWorld, rollEnemyPersonality } from './enemyAi/createEnemyAiWorld.js';
import { chargeLevelToSpeed, computeBallisticVelocity } from './ballisticAim.js';
import { pitchTToLaunchSin, computeLockedThrowVelocity } from './targetSnap.js';

const ENEMY_TURN_SPEED = THREE.MathUtils.degToRad(240);
const _feet = { x: 0, y: 0, z: 0 };
const _throwOrigin = new THREE.Vector3();
const _throwAim = new THREE.Vector3();
const _throwVel = new THREE.Vector3();

function detectSnowballThreat(ex, ez, balls) {
  const radius = COMBAT.snowballDodgeRadius ?? 2.4;
  const lookAhead = COMBAT.snowballDodgeLookAhead ?? 0.55;
  const maxDist = radius + 10;
  let best = null;
  let bestDist = maxDist;

  for (const b of balls) {
    const dx = ex - b.x;
    const dz = ez - b.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > maxDist * maxDist) continue;

    const pvx = b.vx;
    const pvz = b.vz;
    const speedSq = pvx * pvx + pvz * pvz;
    if (speedSq < 0.25) continue;

    const t = -((b.x - ex) * pvx + (b.z - ez) * pvz) / speedSq;
    if (t < 0 || t > lookAhead) continue;

    const cx = b.x + pvx * t - ex;
    const cz = b.z + pvz * t - ez;
    const miss = Math.hypot(cx, cz);
    if (miss >= radius) continue;
    if (miss < bestDist) {
      bestDist = miss;
      const len = Math.hypot(pvx, pvz) || 1;
      const ballDirX = pvx / len;
      const ballDirZ = pvz / len;
      const side = dx * pvz - dz * pvx >= 0 ? 1 : -1;
      best = {
        x: -ballDirZ * side,
        z: ballDirX * side,
        ballDirX,
        ballDirZ,
        urgency: 1 - miss / radius,
        miss,
      };
    }
  }
  return best;
}

function collectMeshes(root) {
  const meshes = [];
  root?.traverse((child) => {
    if (child.isMesh && !child.userData?.isHullOutlineMesh) meshes.push(child);
  });
  return meshes;
}

/**
 * High-sky downward ray — same approach as NPC placement.
 * Takes the topmost upward-facing surface near the island deck / player height
 * so enemies land on outdoor ground, not inside terrain or under roofs.
 * @returns {number | null}
 */
function findGroundY(colliders, x, z, refY, skyY = 250) {
  if (!colliders.length) return null;
  const ray = new THREE.Raycaster();
  const fromY = Math.max(skyY, refY + 80);
  ray.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
  ray.far = fromY + 50;
  const hits = ray.intersectObjects(colliders, false);
  if (!hits.length) return null;

  // Prefer outdoor deck: first (highest) hit within a band of the player/deck.
  const bandMin = refY - 8;
  const bandMax = refY + 6;
  for (const hit of hits) {
    const ny = hit.face?.normal
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y
      : 1;
    // Skip downward-facing / steep ceiling faces.
    if (ny < 0.35) continue;
    const y = hit.point.y;
    if (y >= bandMin && y <= bandMax) return y;
  }

  // Fallback: highest upward-facing hit (true top surface under the sky ray).
  for (const hit of hits) {
    const ny = hit.face?.normal
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y
      : 1;
    if (ny < 0.35) continue;
    return hit.point.y;
  }

  return hits[0].point.y;
}

function snapToWalkableGround(root, colliders, x, z, refY, fallbackY = 0, skyY = 250) {
  const y = findGroundY(colliders, x, z, refY, skyY);
  root.position.y = y ?? fallbackY;
  return y != null;
}

function pickWanderTarget(homeX, homeZ, radius) {
  const ang = Math.random() * Math.PI * 2;
  const dist = radius * (0.35 + Math.random() * 0.65);
  return {
    x: homeX + Math.cos(ang) * dist,
    z: homeZ + Math.sin(ang) * dist,
  };
}

function shortestAngleDelta(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function pickTargetCount() {
  const { enemyCountMin, enemyCountMax } = COMBAT;
  return enemyCountMin + Math.floor(Math.random() * (enemyCountMax - enemyCountMin + 1));
}

/**
 * Survival-mode enemy crowd — wander, throw snowballs at player, respawn waves.
 */
export async function createEnemyCrowd({
  parent,
  collisionRoot,
  placements,
  loadingManager,
  onProgress,
} = {}) {
  const group = new THREE.Group();
  group.name = 'Enemies';
  parent.add(group);

  collisionRoot?.updateMatrixWorld?.(true);
  const colliders = collectMeshes(collisionRoot);

  const box = new THREE.Box3();
  if (collisionRoot) box.setFromObject(collisionRoot);
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const groundFallback = box.isEmpty() ? 0 : box.min.y;
  /** Island walkable deck height — player spawn is the reliable reference. */
  const deckY = PLAYER.spawn?.y ?? center.y;
  /** High origin for downward ground rays (above island AABB). */
  const skyRayY = box.isEmpty() ? 250 : Math.max(250, box.max.y + 40);
  /** Updated each frame from the live player so enemies spawn on the same floor. */
  let refGroundY = deckY;
  const islandRadius = box.isEmpty()
    ? 8
    : Math.max(box.getSize(new THREE.Vector3()).x, box.getSize(new THREE.Vector3()).z) * 0.35;

  /** @type {Array<any>} */
  const controllers = [];
  const total = placements.length;
  let loaded = 0;

  let targetAlive = pickTargetCount();
  let respawnTimer = 0;
  let killCallback = null;
  let waveStartCallback = null;
  /** @type {null | ((enemy: object) => void)} */
  let playerContactCallback = null;
  /** @type {null | ((pos: THREE.Vector3, dir: THREE.Vector3) => void)} */
  let spawnSnowball = null;
  /** @type {null | ReturnType<import('../physics/createPhysicsWorld.js').createPhysicsWorld>} */
  let physics = null;
  const aiWorld = createEnemyAiWorld();
  aiWorld.setColliders(colliders);
  let lastPlayerX = 0;
  let lastPlayerZ = 0;
  let playerVelX = 0;
  let playerVelZ = 0;

  await mapPool(placements, ASSET_LOAD_CONCURRENCY, async (p) => {
    onProgress?.(`Loading enemy ${p.id}… (${loaded + 1}/${total})`, loaded / Math.max(total, 1));
    try {
      const { root, fbx } = await loadNpcModel(p.model, loadingManager);
      const x = center.x + (p.position?.x ?? 0);
      const z = center.z + (p.position?.z ?? 0);
      root.position.set(x, center.y + 5, z);
      root.rotation.y = THREE.MathUtils.degToRad(p.yawDeg ?? 0);
      snapToWalkableGround(root, colliders, x, z, deckY, deckY, skyRayY);
      root.name = p.id;
      root.userData.isEnemy = true;
      group.add(root);
      root.updateMatrixWorld(true);

      const anim = await bindNpcAnimations(fbx, {
        skeleton: p.skeleton ?? 'standard',
        clipKeys: p.clips,
        loadingManager,
      });
      anim.update(1 / 30);
      const walkKeys = anim.getWalkKeys();
      if (walkKeys.length) anim.setExternalControl(true);

      const meshes = collectMeshes(root);
      const flashMats = [];
      for (const mesh of meshes) {
        if (!mesh.material) continue;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat.emissive) {
            flashMats.push({ mat, base: mat.emissive.getHex(), baseInt: mat.emissiveIntensity ?? 1 });
          }
        }
      }

      controllers.push({
        id: p.id,
        root,
        anim,
        meshes,
        flashMats,
        flashTimer: 0,
        homeX: x,
        homeZ: z,
        wanderRadius: p.wanderRadius ?? 6,
        target: null,
        mode: 'idle',
        nextDecisionAt: 1.5 + Math.random() * 2.5,
        hp: COMBAT.enemyHp,
        alive: false,
        attackCooldown: 0,
        active: false,
        knockbackVx: 0,
        knockbackVz: 0,
        dodgeTimer: 0,
        dodgeX: 0,
        dodgeZ: 0,
        velY: 0,
        airborne: false,
        grounded: true,
        jumpCooldown: 0,
        ungroundedTimer: 0,
        pendingDodgeJump: false,
        dodgeStyle: null,
        personality: null,
      });
      root.visible = false;
    } catch (err) {
      console.error(`[enemy] failed to spawn ${p.id}`, err);
    } finally {
      loaded += 1;
      onProgress?.(`Loading enemies… (${loaded}/${total})`, loaded / Math.max(total, 1));
    }
  });

  function placeEnemyOnGround(c, x, z) {
    c.velY = 0;
    c.airborne = false;
    c.grounded = true;
    c.jumpCooldown = 0;
    c.ungroundedTimer = 0;

    const refY = refGroundY;
    // Always sky-cast first so feet sit on the outer surface, never inside the mesh.
    let y = findGroundY(colliders, x, z, refY, skyRayY);
    if (y == null) y = refY;
    y += CONTROL.skinWidth ?? 0.02;

    if (physics) {
      // Create capsule well above the hit, then snap feet to the surface.
      const spawnY = y + 2;
      physics.createCapsule(c.id, x, spawnY, z);
      physics.setFeetPosition(c.id, x, spawnY, z);
      const hit = physics.castGroundFor(c.id, 40);
      if (hit && Math.abs(hit.pointY - y) < 6) {
        y = hit.pointY + (CONTROL.skinWidth ?? 0.02);
      }
      physics.setFeetPosition(c.id, x, y, z);
    }

    c.root.position.set(x, y, z);
  }

  function rescueEnemyIfFallen(c) {
    // Only rescue when clearly below the walkable band — never teleport into mid-air.
    if (c.root.position.y >= refGroundY - 10) return;
    const x = c.homeX ?? c.root.position.x;
    const z = c.homeZ ?? c.root.position.z;
    const y = findGroundY(colliders, x, z, refGroundY, skyRayY);
    if (y == null) return;
    placeEnemyOnGround(c, x, z);
  }

  function activateEnemy(c, x, z) {
    c.alive = true;
    c.hp = COMBAT.enemyHp;
    c.attackCooldown = 1 + Math.random();
    c.mode = 'idle';
    c.target = null;
    c.nextDecisionAt = 1 + Math.random() * 2;
    c.knockbackVx = 0;
    c.knockbackVz = 0;
    c.dodgeTimer = 0;
    c.dodgeX = 0;
    c.dodgeZ = 0;
    c.pendingDodgeJump = false;
    c.dodgeStyle = null;
    c.personality = rollEnemyPersonality();
    c.homeX = x;
    c.homeZ = z;
    c.root.visible = true;
    placeEnemyOnGround(c, x, z);
    aiWorld.attach(c);
    const idle = c.anim.getIdleKey();
    if (idle) c.anim.play(idle, { loop: THREE.LoopRepeat });
  }

  let deathFxCallback = null;

  function deactivateEnemy(c, { playDespawnFx = false } = {}) {
    if (playDespawnFx) {
      deathFxCallback?.(
        new THREE.Vector3(
          c.root.position.x,
          c.root.position.y + (COMBAT.enemyAimHeight ?? 1.2),
          c.root.position.z,
        ),
      );
    }
    c.alive = false;
    c.root.visible = false;
    c.target = null;
    c.mode = 'idle';
    c.airborne = false;
    c.velY = 0;
    physics?.removeCapsule?.(c.id);
    aiWorld.detach(c);
  }

  function startWander(c) {
    const walks = c.anim.getWalkKeys();
    if (!walks.length) return;
    c.target = pickWanderTarget(c.homeX, c.homeZ, c.wanderRadius);
    c.mode = 'walk';
    c.anim.play(walks[(Math.random() * walks.length) | 0], { loop: THREE.LoopRepeat });
  }

  function startIdle(c) {
    c.target = null;
    c.mode = 'idle';
    const idle = c.anim.getIdleKey();
    if (idle) c.anim.play(idle, { loop: THREE.LoopRepeat });
    c.nextDecisionAt = 2 + Math.random() * 2.5;
  }

  function facePosition(c, x, z, dt) {
    const dx = x - c.root.position.x;
    const dz = z - c.root.position.z;
    const travelYaw = Math.atan2(dx, dz);
    const targetYaw = travelYaw + Math.PI;
    const delta = shortestAngleDelta(c.root.rotation.y, targetYaw);
    const step = Math.min(Math.abs(delta), ENEMY_TURN_SPEED * dt);
    c.root.rotation.y += Math.sign(delta) * step;
  }

  /**
   * Player-like throw: variable charge + pitch / ballistic arc toward a lead aim point.
   */
  function throwAtPlayer(c, playerPos) {
    if (!spawnSnowball) return;

    _throwOrigin.set(
      c.root.position.x,
      c.root.position.y + 1.0,
      c.root.position.z,
    );

    const dx = playerPos.x - _throwOrigin.x;
    const dz = playerPos.z - _throwOrigin.z;
    const dist = Math.hypot(dx, dz);
    const throwRange = COMBAT.enemyThrowRange ?? COMBAT.enemyAttackRange ?? 24;

    // Lead time scales with distance (and estimated flight time).
    const lead = THREE.MathUtils.clamp(dist / 32, 0.12, 0.6);
    _throwAim.set(
      playerPos.x + playerVelX * lead,
      playerPos.y + 0.85,
      playerPos.z + playerVelZ * lead,
    );

    // Charge by range: close = soft lob, far = full power (+ jitter).
    let charge = THREE.MathUtils.clamp(dist / throwRange, 0.18, 1);
    charge = THREE.MathUtils.clamp(charge + (Math.random() - 0.5) * 0.2, 0.12, 1);
    const speed = chargeLevelToSpeed(charge);

    // Mostly true ballistic aim; sometimes a deliberate higher lob like a charged player throw.
    if (Math.random() < 0.3) {
      const pitchT = THREE.MathUtils.clamp(
        0.25 + (dist / throwRange) * 0.55 + (Math.random() - 0.5) * 0.25,
        0,
        1,
      );
      computeLockedThrowVelocity(
        _throwOrigin,
        _throwAim,
        speed,
        pitchTToLaunchSin(pitchT),
        _throwVel,
      );
    } else {
      computeBallisticVelocity(
        _throwOrigin,
        _throwAim,
        speed,
        _throwVel,
        PLAYER.gravity,
      );
    }

    spawnSnowball(_throwOrigin, {
      velocity: _throwVel.clone(),
      sourceId: c.id,
      sourceRoot: c.root,
    });
  }

  function startCombatWalk(c, { timeScale = 1 } = {}) {
    const walks = c.anim.getWalkKeys();
    if (!walks.length) return;
    const key = walks[(Math.random() * walks.length) | 0];
    if (c.mode === 'combat' && c._walkKey === key) {
      c._walkTimeScale = timeScale;
      const action = c.anim.actions?.get(key);
      if (action) action.timeScale = timeScale;
      return;
    }
    c.mode = 'combat';
    c.target = null;
    c._walkKey = key;
    c._walkTimeScale = timeScale;
    c.anim.play(key, { loop: THREE.LoopRepeat });
    const action = c.anim.actions?.get(key);
    if (action) action.timeScale = timeScale;
  }

  /**
   * Player-like locomotion: Rapier capsule + gravity/jump/snap.
   * Stays grounded with snap by default; only goes airborne on intentional jump.
   */
  function tickEnemyPhysics(c, wishX, wishZ, dt, speed, { wantJump = false } = {}) {
    c.jumpCooldown = Math.max(0, c.jumpCooldown - dt);

    const len = Math.hypot(wishX, wishZ);
    const nx = len > 1e-6 ? wishX / len : 0;
    const nz = len > 1e-6 ? wishZ / len : 0;

    const kbDecay = Math.exp(-(COMBAT.enemyKnockbackDecay ?? 4.5) * dt);
    const kbX = c.knockbackVx;
    const kbZ = c.knockbackVz;
    c.knockbackVx *= kbDecay;
    c.knockbackVz *= kbDecay;
    if (c.knockbackVx * c.knockbackVx + c.knockbackVz * c.knockbackVz < 0.04) {
      c.knockbackVx = 0;
      c.knockbackVz = 0;
    }

    if (wantJump && c.grounded && !c.airborne && c.jumpCooldown <= 0) {
      c.velY = COMBAT.enemyJumpForce ?? CONTROL.jumpForce ?? 7;
      c.airborne = true;
      c.grounded = false;
      c.jumpCooldown = 0.85;
    }

    let dx;
    let dy;
    let dz;
    if (!c.airborne) {
      c.velY = 0;
      dx = (nx * speed + kbX) * dt;
      dz = (nz * speed + kbZ) * dt;
      dy = 0;
    } else {
      c.velY += (CONTROL.gravity ?? -19.8) * dt;
      dx = (nx * speed * 0.9 + kbX) * dt;
      dz = (nz * speed * 0.9 + kbZ) * dt;
      dy = c.velY * dt;
    }

    if (physics) {
      if (!physics.getAgent(c.id)) {
        physics.createCapsule(c.id, c.root.position.x, c.root.position.y, c.root.position.z);
      }
      physics.setFeetPosition(c.id, c.root.position.x, c.root.position.y, c.root.position.z);
      const moved = physics.moveCapsule(c.id, dx, dy, dz, {
        allowSnap: !c.airborne,
        step: false,
      });
      physics.getFeetPosition(c.id, _feet);
      c.root.position.set(_feet.x, _feet.y, _feet.z);

      if (c.airborne) {
        if (c.velY <= 0 && moved.grounded) {
          c.airborne = false;
          c.grounded = true;
          c.velY = 0;
          c.ungroundedTimer = 0;
        } else {
          c.grounded = false;
        }
      } else if (moved.grounded) {
        c.grounded = true;
        c.ungroundedTimer = 0;
      } else {
        // Soft ungrounded: try a short ground cast before entering free-fall.
        c.ungroundedTimer += dt;
        const hit = physics.castGroundFor(c.id, 2.5);
        if (hit && Math.abs(hit.pointY - c.root.position.y) < 2.2) {
          const snapY = hit.pointY + (CONTROL.skinWidth ?? 0.02);
          physics.setFeetPosition(c.id, c.root.position.x, snapY, c.root.position.z);
          c.root.position.y = snapY;
          c.grounded = true;
          c.ungroundedTimer = 0;
        } else if (c.ungroundedTimer > 0.45) {
          c.airborne = true;
          c.grounded = false;
        }
      }

      rescueEnemyIfFallen(c);
    } else {
      c.root.position.x += dx;
      c.root.position.z += dz;
      if (!c.airborne) {
        snapToWalkableGround(
          c.root,
          colliders,
          c.root.position.x,
          c.root.position.z,
          refGroundY,
          refGroundY,
          skyRayY,
        );
      } else {
        c.root.position.y += dy;
      }
    }

    if (len > 0.05) startCombatWalk(c);
    return len > 0.05;
  }

  function applyKnockback(c, ball) {
    const kb = COMBAT.enemyKnockbackSpeed ?? 8;
    let dx = 0;
    let dz = 0;
    if (ball?.velocity) {
      dx = ball.velocity.x;
      dz = ball.velocity.z;
    }
    if (dx * dx + dz * dz < 1e-6 && ball?.sourceRoot) {
      dx = c.root.position.x - ball.sourceRoot.position.x;
      dz = c.root.position.z - ball.sourceRoot.position.z;
    }
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    c.knockbackVx = (dx / len) * kb;
    c.knockbackVz = (dz / len) * kb;
  }

  function startFlash(c) {
    c.flashTimer = 0.15;
    for (const { mat, base, baseInt } of c.flashMats) {
      mat.emissive.setHex(0xffffff);
      mat.emissiveIntensity = 1.1;
    }
  }

  function updateFlash(c, dt) {
    if (c.flashTimer <= 0) return;
    c.flashTimer -= dt;
    if (c.flashTimer <= 0) {
      for (const { mat, base, baseInt } of c.flashMats) {
        mat.emissive.setHex(base);
        mat.emissiveIntensity = baseInt;
      }
    }
  }

  function updateEnemy(c, dt, playerPos, playerBalls = []) {
    if (!c.alive) return;
    c.attackCooldown = Math.max(0, c.attackCooldown - dt);
    updateFlash(c, dt);

    const dodge =
      c.personality?.canDodge
        ? detectSnowballThreat(c.root.position.x, c.root.position.z, playerBalls)
        : null;
    const move = aiWorld.computeMove(c, dt, dodge);
    const speed = move.speed;
    tickEnemyPhysics(c, move.moveX, move.moveZ, dt, speed, { wantJump: move.wantJump });

    if (move.dodgeStyle) {
      c.dodgeStyle = move.dodgeStyle;
      if (Math.hypot(move.moveX, move.moveZ) > 1e-4) {
        facePosition(
          c,
          c.root.position.x + move.moveX,
          c.root.position.z + move.moveZ,
          dt,
        );
      }
      if (move.dodgeStyle === 'slide') {
        startCombatWalk(c, { timeScale: 1.45 });
      } else if (move.dodgeStyle === 'jump' && c.airborne) {
        if (c.mode === 'combat' || c.mode === 'walk') startIdle(c);
      } else if (speed > 0.15) {
        startCombatWalk(c, {
          timeScale: move.dodgeStyle === 'retreat' ? 1.2 : 1.05,
        });
      }
    } else if (move.inCombat) {
      if (move.canSeePlayer) {
        facePosition(c, playerPos.x, playerPos.z, dt);
      } else if (Math.hypot(move.moveX, move.moveZ) > 1e-4) {
        facePosition(
          c,
          c.root.position.x + move.moveX,
          c.root.position.z + move.moveZ,
          dt,
        );
      }
      if (speed > 0.2) startCombatWalk(c);
      else if (!c.airborne) startIdle(c);

      if (move.wantThrow) {
        throwAtPlayer(c, playerPos);
        c.attackCooldown =
          COMBAT.enemyAttackCooldown * (0.85 + Math.random() * 0.35);
      } else if (move.wantMelee) {
        playerContactCallback?.(c);
        c.attackCooldown =
          (COMBAT.enemyMeleeCooldown ?? 1.05) * (0.9 + Math.random() * 0.25);
      }
    } else if (speed > 0.2) {
      // Face wander direction while patrolling.
      if (Math.hypot(move.moveX, move.moveZ) > 1e-4) {
        facePosition(
          c,
          c.root.position.x + move.moveX,
          c.root.position.z + move.moveZ,
          dt,
        );
      }
      if (c.mode !== 'walk' && c.mode !== 'combat') startWander(c);
    } else if (c.mode === 'combat' || c.mode === 'walk') {
      startIdle(c);
    }

    c.anim.update(dt);
  }

  function pickRespawnPoint() {
    const ang = Math.random() * Math.PI * 2;
    const dist = islandRadius * (0.45 + Math.random() * 0.5);
    return {
      x: center.x + Math.cos(ang) * dist,
      z: center.z + Math.sin(ang) * dist,
    };
  }

  function syncActiveEnemies() {
    const alive = controllers.filter((c) => c.alive);
    if (alive.length > targetAlive) {
      const extra = alive.slice(targetAlive);
      for (const c of extra) deactivateEnemy(c);
    }

    const aliveNow = controllers.filter((c) => c.alive);
    if (aliveNow.length >= targetAlive) return;

    const pool = controllers.filter((c) => !c.alive);
    let need = targetAlive - aliveNow.length;
    for (const c of pool) {
      if (need <= 0) break;
      const pt = pickRespawnPoint();
      c.active = true;
      activateEnemy(c, pt.x, pt.z);
      need -= 1;
    }
  }

  function applyDamage(target, amount = COMBAT.snowballDamage, ball = null) {
    const c = controllers.find((e) => e.id === target.id);
    if (!c?.alive) return { applied: false, killed: false };
    c.hp -= amount;
    startFlash(c);
    if (ball) applyKnockback(c, ball);

    if (c.hp <= 0) {
      deactivateEnemy(c, { playDespawnFx: true });
      killCallback?.();
      return { applied: true, killed: true };
    }
    return { applied: true, killed: false };
  }

  return {
    group,
    bindCombat({
      spawnEnemySnowball,
      onKill,
      onWaveStart,
      onEnemyDeath,
      onPlayerContact,
      physics: phys,
    }) {
      spawnSnowball = spawnEnemySnowball;
      killCallback = onKill;
      waveStartCallback = onWaveStart;
      deathFxCallback = onEnemyDeath ?? null;
      playerContactCallback = onPlayerContact ?? null;
      physics = phys ?? null;
      // Re-seat any already-alive enemies onto Rapier capsules.
      if (physics) {
        for (const c of controllers) {
          if (!c.alive) continue;
          placeEnemyOnGround(c, c.root.position.x, c.root.position.z);
        }
      }
    },
    getEntityTargets() {
      return controllers
        .filter((c) => c.alive)
        .map((c) => ({
          id: c.id,
          alive: c.alive,
          sourceRoot: c.root,
          meshes: c.meshes,
        }));
    },
    getAlivePositions() {
      return controllers
        .filter((c) => c.alive)
        .map((c) => ({ x: c.root.position.x, z: c.root.position.z }));
    },
    getAliveMarkers() {
      return controllers
        .filter((c) => c.alive)
        .map((c) => ({
          x: c.root.position.x,
          z: c.root.position.z,
          yaw: c.root.rotation.y,
        }));
    },
    getAliveCount() {
      return controllers.filter((c) => c.alive).length;
    },
    getWaveTargetCount() {
      return targetAlive;
    },
    applyDamage,
    resetWave() {
      targetAlive = pickTargetCount();
      waveStartCallback?.(targetAlive);
      for (const c of controllers) {
        c.active = false;
        deactivateEnemy(c);
      }
      syncActiveEnemies();
    },
    update(dt, { playerPos, playerBalls = [] } = {}) {
      if (!playerPos) {
        for (const c of controllers) {
          if (c.alive) c.anim.update(dt);
        }
        return;
      }

      if (Number.isFinite(playerPos.y)) refGroundY = playerPos.y;
      if (dt > 1e-6) {
        playerVelX = (playerPos.x - lastPlayerX) / dt;
        playerVelZ = (playerPos.z - lastPlayerZ) / dt;
      }
      lastPlayerX = playerPos.x;
      lastPlayerZ = playerPos.z;

      syncActiveEnemies();

      aiWorld.setContext({
        playerPos,
        playerVel: { x: playerVelX, z: playerVelZ },
      });

      for (const c of controllers) {
        if (c.alive) updateEnemy(c, dt, playerPos, playerBalls);
      }
      if (physics) {
        physics.stepSimulation?.();
        for (const c of controllers) {
          if (!c.alive || !physics.getAgent(c.id)) continue;
          physics.getFeetPosition(c.id, _feet);
          c.root.position.set(_feet.x, _feet.y, _feet.z);
        }
      }

      const aliveCount = controllers.filter((c) => c.alive).length;
      if (aliveCount === 0) {
        respawnTimer += dt;
        if (respawnTimer >= COMBAT.respawnDelay) {
          respawnTimer = 0;
          targetAlive = pickTargetCount();
          waveStartCallback?.(targetAlive);
          syncActiveEnemies();
        }
      } else {
        respawnTimer = 0;
      }
    },
    dispose() {
      aiWorld.dispose();
      for (const c of controllers) {
        physics?.removeCapsule?.(c.id);
        c.anim.dispose();
      }
      group.removeFromParent();
    },
  };
}
