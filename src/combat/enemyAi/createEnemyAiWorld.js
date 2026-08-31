import * as THREE from 'three';
import {
  ArriveBehavior,
  EntityManager,
  FleeBehavior,
  MemorySystem,
  MovingEntity,
  PursuitBehavior,
  SeparationBehavior,
  State,
  StateMachine,
  Vehicle,
  WanderBehavior,
  Vector3,
} from 'yuka';
import { COMBAT } from '../../config/combatConfig.js';

const _steeringForce = new Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _losOrigin = new THREE.Vector3();
const _losTarget = new THREE.Vector3();
const _tmpSide = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function pickWanderPoint(homeX, homeZ, radius, out) {
  const ang = Math.random() * Math.PI * 2;
  const dist = radius * (0.35 + Math.random() * 0.65);
  out.set(homeX + Math.cos(ang) * dist, 0, homeZ + Math.sin(ang) * dist);
  return out;
}

function setEngageRingTarget(ex, ez, playerX, playerZ, preferred, out) {
  const dx = ex - playerX;
  const dz = ez - playerZ;
  const dist = Math.hypot(dx, dz) || 1;
  out.set(playerX + (dx / dist) * preferred, 0, playerZ + (dz / dist) * preferred);
  return out;
}

function hasLineOfSight(fromX, fromY, fromZ, toX, toY, toZ, colliders) {
  if (!colliders?.length) return true;
  _losOrigin.set(fromX, fromY + 1.05, fromZ);
  _losTarget.set(toX, toY + 1.05, toZ);
  const dx = _losTarget.x - _losOrigin.x;
  const dy = _losTarget.y - _losOrigin.y;
  const dz = _losTarget.z - _losOrigin.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.05) return true;
  _rayDir.set(dx / len, dy / len, dz / len);
  _raycaster.set(_losOrigin, _rayDir);
  _raycaster.far = Math.max(0.1, len - 0.45);
  const hits = _raycaster.intersectObjects(colliders, false);
  return hits.length === 0;
}

/**
 * Convert steering force → desired velocity for Rapier.
 * We zero velocity before calculate so Arrive/Seek force ≈ desiredVel.
 */
function applySteeringAsVelocity(vehicle, dt) {
  vehicle.velocity.set(0, 0, 0);
  vehicle.steering.calculate(dt, _steeringForce);
  _steeringForce.y = 0;

  const fLen = _steeringForce.length();
  if (fLen < 0.08) {
    vehicle.velocity.set(0, 0, 0);
    return;
  }

  const t = Math.min(1, fLen / Math.max(vehicle.maxForce * 0.35, 1));
  const speed = vehicle.maxSpeed * Math.max(0.4, t);
  vehicle.velocity.copy(_steeringForce).normalize().multiplyScalar(speed);
}

function pickDodgeStyle(threat, controller) {
  const urgency = threat?.urgency ?? 0.5;
  const styles = COMBAT.enemyDodgeStyles ?? {
    sidestep: 0.35,
    retreat: 0.25,
    jump: 0.2,
    slide: 0.2,
  };

  const weights = { ...styles };
  if (urgency > 0.7) {
    weights.jump *= 1.4;
    weights.slide *= 1.3;
  } else if (urgency < 0.35) {
    weights.sidestep *= 1.4;
    weights.retreat *= 1.2;
    weights.jump *= 0.6;
  }

  if (!controller.grounded || controller.airborne || controller.jumpCooldown > 0) {
    weights.jump = 0;
  }

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total <= 0) return 'sidestep';

  let r = Math.random() * total;
  for (const [style, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return style;
  }
  return 'sidestep';
}

function setDodgeThreatTarget(owner, threat, style) {
  const b = owner.userData.brain;
  const ex = owner.position.x;
  const ez = owner.position.z;
  const retreatDist = 8;
  const sidestepDist = 7;

  if (!threat) {
    b.threatTarget.set(ex, 0, ez);
    return;
  }

  const ballDirX = threat.ballDirX ?? -threat.x;
  const ballDirZ = threat.ballDirZ ?? -threat.z;

  switch (style) {
    case 'retreat':
      b.threatTarget.set(
        ex - ballDirX * retreatDist,
        0,
        ez - ballDirZ * retreatDist,
      );
      break;
    case 'sidestep':
      b.threatTarget.set(
        ex + threat.x * sidestepDist,
        0,
        ez + threat.z * sidestepDist,
      );
      break;
    case 'slide':
      b.threatTarget.set(
        ex + threat.x * sidestepDist * 1.1 - ballDirX * 2.5,
        0,
        ez + threat.z * sidestepDist * 1.1 - ballDirZ * 2.5,
      );
      break;
    case 'jump':
    default:
      b.threatTarget.set(
        ex - threat.x * 6 - ballDirX * 3,
        0,
        ez - threat.z * 6 - ballDirZ * 3,
      );
      break;
  }
}

function applyObstacleAvoidance(vehicle, colliders) {
  const vx = vehicle.velocity.x;
  const vz = vehicle.velocity.z;
  const speed = Math.hypot(vx, vz);
  if (speed < 0.08 || !colliders?.length) return;

  const look = COMBAT.enemyObstacleLookAhead ?? 2.8;
  const c = vehicle.userData.brain.controller;
  const y = c?.root?.position?.y ?? 0;
  _rayOrigin.set(vehicle.position.x, y + 0.9, vehicle.position.z);
  const fx = vx / speed;
  const fz = vz / speed;
  _rayDir.set(fx, 0, fz);
  _raycaster.set(_rayOrigin, _rayDir);
  _raycaster.far = look;
  const hits = _raycaster.intersectObjects(colliders, false);
  if (!hits.length || hits[0].distance > look * 0.92) return;

  _tmpSide.set(-fz, 0, fx);
  _raycaster.set(_rayOrigin, _tmpSide);
  _raycaster.far = look * 0.75;
  const leftHits = _raycaster.intersectObjects(colliders, false);
  _tmpSide.set(fz, 0, -fx);
  _raycaster.set(_rayOrigin, _tmpSide);
  const rightHits = _raycaster.intersectObjects(colliders, false);

  const leftClear = leftHits.length ? leftHits[0].distance : look;
  const rightClear = rightHits.length ? rightHits[0].distance : look;
  const useLeft = leftClear >= rightClear;
  const sx = useLeft ? -fz : fz;
  const sz = useLeft ? fx : -fx;

  const urgency = 1 - clamp(hits[0].distance / look, 0, 1);
  const nx = fx * (1 - urgency * 0.9) + sx * urgency;
  const nz = fz * (1 - urgency * 0.9) + sz * urgency;
  const nlen = Math.hypot(nx, nz) || 1;
  vehicle.velocity.set((nx / nlen) * speed, 0, (nz / nlen) * speed);
}

class WanderState extends State {
  enter(owner) {
    const b = owner.userData.brain;
    owner.steering.clear();
    b.wander.weight = 0.45;
    b.arriveWander.weight = 0.85;
    owner.steering.add(b.wander);
    owner.steering.add(b.arriveWander);
    owner.maxSpeed = COMBAT.enemyWalkSpeed ?? 2.4;
    pickWanderPoint(
      b.controller.homeX,
      b.controller.homeZ,
      b.controller.wanderRadius,
      b.wanderTarget,
    );
  }

  execute(owner) {
    const b = owner.userData.brain;
    if (owner.position.distanceTo(b.wanderTarget) < 0.75) {
      pickWanderPoint(
        b.controller.homeX,
        b.controller.homeZ,
        b.controller.wanderRadius,
        b.wanderTarget,
      );
    }
  }
}

class EngageState extends State {
  enter(owner) {
    const b = owner.userData.brain;
    owner.steering.clear();
    b.arriveEngage.weight = 1;
    b.pursuit.weight = 0.75;
    b.separation.weight = 0.4;
    b.wander.weight = 0.12;
    owner.steering.add(b.arriveEngage);
    owner.steering.add(b.pursuit);
    owner.steering.add(b.separation);
    owner.steering.add(b.wander);
    owner.maxSpeed = COMBAT.enemyCombatSpeed ?? 3.4;
  }

  execute(owner) {
    const b = owner.userData.brain;
    const ctx = b.world._ctx;
    const preferred = COMBAT.enemyPreferredRange ?? 10;
    const dist = Math.hypot(
      ctx.playerX - owner.position.x,
      ctx.playerZ - owner.position.z,
    );

    // Far: chase predicted player. Near: hold preferred ring.
    if (dist > preferred + 2.5) {
      b.pursuit.active = true;
      b.arriveEngage.active = false;
    } else {
      b.pursuit.active = false;
      b.arriveEngage.active = true;
      setEngageRingTarget(
        owner.position.x,
        owner.position.z,
        ctx.playerX,
        ctx.playerZ,
        preferred,
        b.engageTarget,
      );
    }
  }
}

class SearchState extends State {
  enter(owner) {
    const b = owner.userData.brain;
    owner.steering.clear();
    b.arriveSearch.weight = 1.1;
    b.separation.weight = 0.35;
    b.wander.weight = 0.2;
    owner.steering.add(b.arriveSearch);
    owner.steering.add(b.separation);
    owner.steering.add(b.wander);
    owner.maxSpeed = COMBAT.enemyWalkSpeed ?? 2.4;
    if (b.lastKnownValid) {
      b.searchTarget.set(b.lastKnownX, 0, b.lastKnownZ);
    }
  }

  execute(owner) {
    const b = owner.userData.brain;
    if (b.lastKnownValid) {
      b.searchTarget.set(b.lastKnownX, 0, b.lastKnownZ);
    }
  }
}

class FleeState extends State {
  enter(owner) {
    const b = owner.userData.brain;
    owner.steering.clear();
    b.fleePlayer.weight = 1.5;
    owner.steering.add(b.fleePlayer);
    owner.maxSpeed = COMBAT.enemyRunSpeed ?? 3.8;
  }
}

class DodgeState extends State {
  enter(owner) {
    const b = owner.userData.brain;
    owner.steering.clear();
    b.fleeThreat.weight = 2;
    owner.steering.add(b.fleeThreat);

    const threat = b.world._ctx.dodgeThreat;
    const style = pickDodgeStyle(threat, b.controller);
    b.controller.dodgeStyle = style;
    b.controller.pendingDodgeJump = style === 'jump';

    const baseDur = COMBAT.enemyDodgeDuration ?? 0.38;
    const runSpeed = COMBAT.enemyRunSpeed ?? 3.8;
    switch (style) {
      case 'sidestep':
        b.dodgeTimeLeft = baseDur * 0.95;
        owner.maxSpeed = runSpeed * 1.05;
        break;
      case 'retreat':
        b.dodgeTimeLeft = baseDur * 1.15;
        owner.maxSpeed = runSpeed * 0.95;
        break;
      case 'jump':
        b.dodgeTimeLeft = baseDur * 0.85;
        owner.maxSpeed = runSpeed * 0.75;
        break;
      case 'slide':
        b.dodgeTimeLeft = baseDur * 0.72;
        owner.maxSpeed = runSpeed * 1.35;
        break;
      default:
        b.dodgeTimeLeft = baseDur;
        owner.maxSpeed = runSpeed;
    }

    setDodgeThreatTarget(owner, threat, style);
  }

  execute(owner) {
    const b = owner.userData.brain;
    b.dodgeTimeLeft -= b.world._ctx.dt;
    const threat = b.world._ctx.dodgeThreat;
    setDodgeThreatTarget(owner, threat, b.controller.dodgeStyle ?? 'sidestep');
  }

  exit(owner) {
    const c = owner.userData.brain.controller;
    c.pendingDodgeJump = false;
    c.dodgeStyle = null;
  }
}

/**
 * Phase 2 Yuka AI: Pursuit, Memory/SEARCH, LOS gating, obstacle avoidance.
 * Outputs move direction/speed for Rapier; does not integrate world position.
 */
export function createEnemyAiWorld() {
  const entityManager = new EntityManager();
  const playerTarget = new Vector3();
  /** @type {Map<string, object>} */
  const brains = new Map();
  /** @type {THREE.Object3D[]} */
  let colliders = [];

  const playerEntity = new MovingEntity();
  playerEntity.name = 'player';
  playerEntity.maxSpeed = 14;
  playerEntity.updateOrientation = false;
  entityManager.add(playerEntity);

  const _ctx = {
    playerX: 0,
    playerY: 0,
    playerZ: 0,
    playerVelX: 0,
    playerVelZ: 0,
    dodgeThreat: null,
    dt: 0,
  };

  const wanderState = new WanderState();
  const engageState = new EngageState();
  const searchState = new SearchState();
  const fleeState = new FleeState();
  const dodgeState = new DodgeState();

  function syncPlayerEntity() {
    playerEntity.position.set(_ctx.playerX, 0, _ctx.playerZ);
    playerEntity.velocity.set(_ctx.playerVelX, 0, _ctx.playerVelZ);
    playerTarget.set(_ctx.playerX, 0, _ctx.playerZ);
  }

  function updateVision(brain) {
    const c = brain.controller;
    const ex = c.root.position.x;
    const ey = c.root.position.y;
    const ez = c.root.position.z;
    const dist = Math.hypot(_ctx.playerX - ex, _ctx.playerZ - ez);
    const detect = COMBAT.enemyDetectRange ?? 28;

    let visible = false;
    if (dist <= detect) {
      visible = hasLineOfSight(
        ex,
        ey,
        ez,
        _ctx.playerX,
        _ctx.playerY,
        _ctx.playerZ,
        colliders,
      );
    }
    brain.canSeePlayer = visible;

    if (visible) {
      brain.lastKnownValid = true;
      brain.lastKnownX = _ctx.playerX;
      brain.lastKnownZ = _ctx.playerZ;
      brain.memoryAge = 0;
      if (!brain.memory.hasRecord(playerEntity)) {
        brain.memory.createRecord(playerEntity);
      }
      const record = brain.memory.getRecord(playerEntity);
      if (record) {
        record.visible = true;
        record.timeLastSensed = performance.now() * 0.001;
        record.lastSensedPosition.copy(playerEntity.position);
      }
    } else if (brain.lastKnownValid) {
      brain.memoryAge += _ctx.dt;
    }
  }

  function attach(controller) {
    if (brains.has(controller.id)) return brains.get(controller.id);

    const vehicle = new Vehicle();
    vehicle.name = controller.id;
    vehicle.updateOrientation = false;
    vehicle.maxSpeed = COMBAT.enemyWalkSpeed ?? 2.4;
    vehicle.maxForce = 40;
    vehicle.mass = 1;
    vehicle.neighborhoodRadius = 3.5;
    vehicle.updateNeighborhood = true;

    const wanderTarget = new Vector3();
    const engageTarget = new Vector3();
    const searchTarget = new Vector3();
    const threatTarget = new Vector3();

    const wander = new WanderBehavior(1.6, 4, 2.5);
    const arriveWander = new ArriveBehavior(wanderTarget, 2, 0.45);
    const arriveEngage = new ArriveBehavior(engageTarget, 2.2, 0.8);
    const arriveSearch = new ArriveBehavior(searchTarget, 2.4, 0.9);
    const fleePlayer = new FleeBehavior(
      playerTarget,
      (COMBAT.enemyDetectRange ?? 28) + 4,
    );
    const fleeThreat = new FleeBehavior(threatTarget, 14);
    const separation = new SeparationBehavior();
    const pursuit = new PursuitBehavior(playerEntity, 0.85);

    const memory = new MemorySystem();
    memory.memorySpan = COMBAT.enemyMemorySpan ?? 4;

    const fsm = new StateMachine(vehicle);
    fsm.add('WANDER', wanderState);
    fsm.add('ENGAGE', engageState);
    fsm.add('SEARCH', searchState);
    fsm.add('FLEE', fleeState);
    fsm.add('DODGE', dodgeState);

    const brain = {
      controller,
      vehicle,
      fsm,
      wanderTarget,
      engageTarget,
      searchTarget,
      threatTarget,
      wander,
      arriveWander,
      arriveEngage,
      arriveSearch,
      fleePlayer,
      fleeThreat,
      separation,
      pursuit,
      memory,
      dodgeTimeLeft: 0,
      canSeePlayer: false,
      lastKnownValid: false,
      lastKnownX: 0,
      lastKnownZ: 0,
      memoryAge: 0,
      world: null,
    };
    vehicle.userData = { brain };
    brain.world = { _ctx, entityManager };

    entityManager.add(vehicle);
    brains.set(controller.id, brain);
    fsm.changeTo('WANDER');
    return brain;
  }

  function detach(controller) {
    const brain = brains.get(controller.id);
    if (!brain) return;
    entityManager.remove(brain.vehicle);
    brains.delete(controller.id);
  }

  function syncVehicleFromController(brain) {
    const c = brain.controller;
    brain.vehicle.position.set(c.root.position.x, 0, c.root.position.z);
  }

  function combatFallbackState(brain, dist) {
    if (brain.canSeePlayer && dist <= (COMBAT.enemyDetectRange ?? 28)) {
      return 'ENGAGE';
    }
    if (brain.lastKnownValid && brain.memoryAge <= (COMBAT.enemyMemorySpan ?? 4)) {
      return 'SEARCH';
    }
    return 'WANDER';
  }

  function evaluateTransitions(brain) {
    const c = brain.controller;
    const ctx = _ctx;
    const ex = c.root.position.x;
    const ez = c.root.position.z;
    const dist = Math.hypot(ctx.playerX - ex, ctx.playerZ - ez);
    const fleeHp = (COMBAT.enemyFleeHpRatio ?? 0.34) * COMBAT.enemyHp;
    const detect = COMBAT.enemyDetectRange ?? 28;
    const memorySpan = COMBAT.enemyMemorySpan ?? 4;

    if (ctx.dodgeThreat) {
      if (!brain.fsm.in('DODGE')) brain.fsm.changeTo('DODGE');
      return;
    }

    if (brain.fsm.in('DODGE')) {
      if (brain.dodgeTimeLeft > 0) return;
      brain.fsm.changeTo(combatFallbackState(brain, dist));
      return;
    }

    if (dist <= (COMBAT.enemyFleeRange ?? 4) || c.hp <= fleeHp) {
      if (!brain.fsm.in('FLEE')) brain.fsm.changeTo('FLEE');
      return;
    }

    if (brain.fsm.in('FLEE')) {
      // Stay fleeing until clear of melee / recovered HP, then re-acquire.
      if (dist > (COMBAT.enemyMinRange ?? 6) && c.hp > fleeHp) {
        brain.fsm.changeTo(combatFallbackState(brain, dist));
      }
      return;
    }

    if (brain.canSeePlayer && dist <= detect) {
      if (!brain.fsm.in('ENGAGE')) brain.fsm.changeTo('ENGAGE');
      return;
    }

    if (brain.fsm.in('ENGAGE')) {
      // Lost LOS — hunt last known position instead of instantly wandering.
      if (brain.lastKnownValid && brain.memoryAge <= memorySpan) {
        brain.fsm.changeTo('SEARCH');
      } else {
        brain.fsm.changeTo('WANDER');
      }
      return;
    }

    if (brain.fsm.in('SEARCH')) {
      if (!brain.lastKnownValid || brain.memoryAge > memorySpan) {
        brain.lastKnownValid = false;
        brain.fsm.changeTo('WANDER');
        return;
      }
      const dMem = Math.hypot(brain.lastKnownX - ex, brain.lastKnownZ - ez);
      if (dMem < 1.4) {
        brain.lastKnownValid = false;
        brain.fsm.changeTo('WANDER');
      }
      return;
    }

    if (!brain.fsm.in('WANDER')) brain.fsm.changeTo('WANDER');
  }

  /**
   * @param {object} controller
   * @param {number} dt
   * @param {{ x: number, z: number } | null} [dodgeThreat]
   */
  function computeMove(controller, dt, dodgeThreat = null) {
    let brain = brains.get(controller.id);
    if (!brain && controller.alive) {
      brain = attach(controller);
    }
    if (!brain) {
      return {
        moveX: 0,
        moveZ: 0,
        speed: 0,
        wantThrow: false,
        wantJump: false,
        inCombat: false,
      };
    }

    _ctx.dt = dt;
    _ctx.dodgeThreat = dodgeThreat;
    syncPlayerEntity();
    syncVehicleFromController(brain);
    entityManager.updateNeighborhood(brain.vehicle);
    updateVision(brain);

    evaluateTransitions(brain);
    brain.fsm.update();
    applySteeringAsVelocity(brain.vehicle, dt);
    applyObstacleAvoidance(brain.vehicle, colliders);

    const vx = brain.vehicle.velocity.x;
    const vz = brain.vehicle.velocity.z;
    const speed = Math.hypot(vx, vz);
    const inCombat =
      brain.fsm.in('ENGAGE') ||
      brain.fsm.in('FLEE') ||
      brain.fsm.in('DODGE') ||
      brain.fsm.in('SEARCH');

    const dist = Math.hypot(
      _ctx.playerX - controller.root.position.x,
      _ctx.playerZ - controller.root.position.z,
    );
    const wantThrow =
      brain.fsm.in('ENGAGE') &&
      brain.canSeePlayer &&
      dist <= (COMBAT.enemyAttackRange ?? 24) &&
      controller.attackCooldown <= 0;

    const dodging = brain.fsm.in('DODGE');
    const wantJump = !!(dodging && controller.pendingDodgeJump);
    if (wantJump) controller.pendingDodgeJump = false;

    return {
      moveX: speed > 1e-4 ? vx / speed : 0,
      moveZ: speed > 1e-4 ? vz / speed : 0,
      speed,
      wantThrow,
      wantJump,
      inCombat,
      canSeePlayer: brain.canSeePlayer,
      dodgeStyle: dodging ? controller.dodgeStyle : null,
    };
  }

  function setContext({ playerPos, playerVel }) {
    _ctx.playerX = playerPos.x;
    _ctx.playerY = playerPos.y ?? 0;
    _ctx.playerZ = playerPos.z;
    _ctx.playerVelX = playerVel?.x ?? 0;
    _ctx.playerVelZ = playerVel?.z ?? 0;
  }

  function setColliders(next) {
    colliders = Array.isArray(next) ? next : [];
  }

  function dispose() {
    for (const id of [...brains.keys()]) {
      const brain = brains.get(id);
      if (brain) entityManager.remove(brain.vehicle);
    }
    brains.clear();
    entityManager.remove(playerEntity);
  }

  return { attach, detach, computeMove, setContext, setColliders, dispose };
}
