import * as THREE from 'three';
import { COMBAT } from '../config/combatConfig.js';
import { PLAYER } from '../config/playerConfig.js';
import { SKILLS, SKILL_IDS } from '../config/skillConfig.js';

const _vel = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _spreadVel = new THREE.Vector3();

/**
 * Player combat skills — volley, meteor shower, titan snowball.
 */
export function createPlayerSkillSystem({
  snowballs,
  getHandWorldPosition,
  buildThrowVelocity,
} = {}) {
  /** @type {SkillId | null} */
  let selectedSkill = null;
  /** @type {Record<string, number>} */
  const cooldowns = Object.fromEntries(SKILL_IDS.map((id) => [id, 0]));
  /** @type {Array<{ at: number, fn: () => void }>} */
  const queue = [];
  let clock = 0;
  let executing = false;

  function selectSkill(id) {
    if (!SKILLS[id] || cooldowns[id] > 0 || executing) return false;
    selectedSkill = id;
    return true;
  }

  function selectNormal() {
    selectedSkill = null;
  }

  function getSelected() {
    return selectedSkill;
  }

  function isExecuting() {
    return executing;
  }

  function schedule(delay, fn) {
    queue.push({ at: clock + delay, fn });
    queue.sort((a, b) => a.at - b.at);
  }

  function spreadVelocity(baseVel, yawDeg, pitchDeg) {
    const speed = baseVel.length();
    if (speed < 1e-4) return baseVel.clone();
    const yaw = Math.atan2(baseVel.x, baseVel.z) + THREE.MathUtils.degToRad(yawDeg);
    const horiz = Math.hypot(baseVel.x, baseVel.z) || 1;
    const pitch = Math.asin(THREE.MathUtils.clamp(baseVel.y / speed, -1, 1));
    const nextPitch = pitch + THREE.MathUtils.degToRad(pitchDeg);
    const cosP = Math.cos(nextPitch);
    _spreadVel.set(
      Math.sin(yaw) * cosP * speed,
      Math.sin(nextPitch) * speed,
      Math.cos(yaw) * cosP * speed,
    );
    return _spreadVel.clone();
  }

  function spawnPlayerBall(origin, velocity, opts = {}) {
    snowballs.spawn(origin, {
      velocity,
      sourceId: 'player',
      sourceRoot: opts.sourceRoot,
      radius: opts.radius,
      damage: opts.damage,
    });
  }

  function castVolley({ chargeLevel, aimPoint, sourceRoot }) {
    const cfg = SKILLS.volley;
    buildThrowVelocity(chargeLevel, _vel);
    const interval = cfg.duration / cfg.count;
    for (let i = 0; i < cfg.count; i++) {
      schedule(i * interval, () => {
        getHandWorldPosition(_origin);
        const spreadYaw = (Math.random() - 0.5) * 2 * cfg.spreadYawDeg;
        const spreadPitch = (Math.random() - 0.5) * 2 * cfg.spreadPitchDeg;
        spawnPlayerBall(_origin, spreadVelocity(_vel, spreadYaw, spreadPitch), { sourceRoot });
      });
    }
    schedule(cfg.duration, () => {
      executing = false;
    });
  }

  function castMeteor({ aimPoint, sourceRoot }) {
    const cfg = SKILLS.meteor;
    const interval = cfg.duration / cfg.count;
    for (let i = 0; i < cfg.count; i++) {
      schedule(i * interval, () => {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * cfg.radius;
        _origin.set(
          aimPoint.x + Math.cos(ang) * dist,
          aimPoint.y + cfg.dropHeight + Math.random() * 4,
          aimPoint.z + Math.sin(ang) * dist,
        );
        const drift = cfg.driftSpeed ?? 0.35;
        _vel.set(
          (Math.random() - 0.5) * 2 * drift,
          -(10 + Math.random() * 8),
          (Math.random() - 0.5) * 2 * drift,
        );
        spawnPlayerBall(_origin, _vel.clone(), { sourceRoot });
      });
    }
    schedule(cfg.duration, () => {
      executing = false;
    });
  }

  function castTitan({ chargeLevel, sourceRoot }) {
    const cfg = SKILLS.titan;
    buildThrowVelocity(chargeLevel, _vel);
    getHandWorldPosition(_origin);
    spawnPlayerBall(_origin, _vel.clone(), {
      sourceRoot,
      radius: PLAYER.snowballRadius * cfg.sizeScale,
      damage: COMBAT.snowballDamage * cfg.damageScale,
    });
    executing = false;
  }

  /**
   * @param {{ skillId: string, chargeLevel: number, aimPoint: THREE.Vector3, sourceRoot: THREE.Object3D }} ctx
   */
  function tryCast(ctx) {
    const { skillId, chargeLevel, aimPoint, sourceRoot } = ctx;
    if (!SKILLS[skillId] || cooldowns[skillId] > 0 || executing) return false;

    cooldowns[skillId] = SKILLS[skillId].cooldown;
    executing = true;
    selectedSkill = null;

    switch (skillId) {
      case 'volley':
        castVolley({ chargeLevel, aimPoint, sourceRoot });
        break;
      case 'meteor':
        castMeteor({ aimPoint, sourceRoot });
        break;
      case 'titan':
        castTitan({ chargeLevel, sourceRoot });
        break;
      default:
        executing = false;
        return false;
    }
    return true;
  }

  function update(dt) {
    clock += dt;
    for (const id of SKILL_IDS) {
      cooldowns[id] = Math.max(0, cooldowns[id] - dt);
    }
    while (queue.length && queue[0].at <= clock) {
      const item = queue.shift();
      item?.fn?.();
    }
  }

  function getUiState() {
    return {
      selected: selectedSkill,
      cooldowns: { ...cooldowns },
      executing,
    };
  }

  function dispose() {
    queue.length = 0;
    executing = false;
    selectedSkill = null;
    for (const id of SKILL_IDS) cooldowns[id] = 0;
  }

  return {
    selectSkill,
    selectNormal,
    getSelected,
    isExecuting,
    tryCast,
    update,
    getUiState,
    dispose,
  };
}
