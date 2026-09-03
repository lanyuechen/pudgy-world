import { NPC_ANIMS, NPC_MODELS } from './npcConfig.js';

/** Survival combat tuning. */
export const COMBAT = {
  enemyHp: 100,
  enemyAttackRange: 24,
  enemyDetectRange: 28,
  /** Max distance used to scale enemy throw charge 0–1 (m). */
  enemyThrowRange: 28,
  /** Preferred stand-off distance while fighting (m). */
  enemyPreferredRange: 10,
  /** Back away when closer than this (m). */
  enemyMinRange: 6,
  /** Full retreat when player is this close (m). */
  enemyFleeRange: 4,
  /** Flee when HP ≤ this ratio of max HP. */
  enemyFleeHpRatio: 0.34,
  /** Chance an enemy will dodge incoming snowballs (0–1). */
  enemyDodgeShare: 0.25,
  /** Chance an enemy uses ranged snowball throws; rest are melee. */
  enemyRangedShare: 0.25,
  /** Melee touch radius (m). */
  enemyMeleeRange: 1.35,
  /** Preferred stand-off for melee fighters (m). */
  enemyMeleePreferredRange: 1.15,
  enemyMeleeDamage: 1,
  enemyMeleeCooldown: 1.05,
  /** Ground locomotion (m/s) — same order of magnitude as player walk/run. */
  enemyWalkSpeed: 2.4,
  enemyRunSpeed: 3.8,
  enemyCombatSpeed: 3.4,
  enemyJumpForce: 7.0,
  /** Chance to hop when starting a snowball dodge. */
  /** @deprecated Use enemyDodgeStyles weights instead. */
  enemyJumpChanceOnDodge: 0.4,
  /** Relative weights for snowball dodge styles. */
  enemyDodgeStyles: {
    sidestep: 0.35,
    retreat: 0.25,
    jump: 0.2,
    slide: 0.2,
  },
  enemyAttackCooldown: 1.5,
  /** Horizontal hit capsule radius / height for snowball vs characters (m). */
  entityHitRadius: 0.8,
  entityHitHeight: 1.75,
  /** Horizontal knockback speed on hit (m/s). */
  enemyKnockbackSpeed: 8,
  enemyKnockbackDecay: 4.5,
  playerKnockbackSpeed: 6,
  /** Seconds before another enemy snowball can damage the player. */
  playerHitInvuln: 0.55,
  /** Camera shake magnitude (m) and duration (s). */
  playerHitShake: 0.1,
  playerHitShakeDuration: 0.22,
  /** Red vignette pulse duration (s). */
  playerHitVignetteDuration: 0.55,
  /** Dodge when a player snowball will pass within this radius (m). */
  snowballDodgeRadius: 2.4,
  /** Max time ahead to predict incoming snowballs (s). */
  snowballDodgeLookAhead: 0.55,
  enemyDodgeDuration: 0.38,
  /** Seconds to remember last-seen player position after LOS is lost. */
  enemyMemorySpan: 4,
  /** Forward look-ahead for obstacle avoidance (m). */
  enemyObstacleLookAhead: 2.8,
  /** Fixed wave size. */
  enemyCountMin: 10,
  enemyCountMax: 10,
  /** Default patrol radius when map size is unknown (m). */
  enemyWanderRadius: 48,
  /** Force a new patrol waypoint at least this often (s). */
  enemyPatrolRetargetSec: 7,
  /** Seconds of near-zero movement before treating as stuck. */
  enemyStuckSec: 1.15,
  respawnDelay: 3,

  chargeMinHold: 0.5,
  chargeMaxHold: 1.5,

  minimapRange: 50,
  /** Minimap display diameter (px). */
  minimapSize: 168,
  /** Top-down map bake resolution (px). */
  minimapBakeSize: 512,

  snowballDamage: 30,
  /** Initial speed at chargeLevel 0 / 1 (m/s). */
  throwSpeedMin: 8,
  throwSpeedMax: 22,
  /** Minimum pitch above horizontal (degrees). */
  minPitchDeg: 15,
  /** Maximum pitch (degrees). */
  maxPitchDeg: 55,
  /** Mouse Y → pitch: NDC delta multiplier while charging. */
  pitchSensitivity: 1.4,
  /** Chest/head height offset for damage popups (m). */
  enemyAimHeight: 1.4,
  /** Minimum upward launch angle (~18°). */
  minLaunchSin: 0.31,
  /** Ballistic target never below throw origin + this offset (m). */
  minTargetYOffset: 0.08,
  /** Ray fallback distance when crosshair misses geometry (m). */
  aimRayDistance: 80,
  /** Ignore ray hits closer than this to throw origin (m). */
  minAimDistance: 4,
  /** Fallback aim plane height above throw origin (m). */
  aimPlaneHeight: 1,
  /** Mouse X NDC delta → world horizontal target shift (m). */
  aimYawSensitivity: 12,
  /** LMB down grace before throw charge locks in (s); drag within window rotates camera. */
  cameraDragGrace: 0.15,
};

/**
 * Enemy spawn templates for playable islands.
 * position.x/z are offsets from the island collision AABB center.
 */
export const ENEMY_PLACEMENTS = [
  {
    id: 'enemy-breezy',
    model: 'breezy',
    skeleton: 'standard',
    clips: ['walk1', 'idle1', 'talk'],
    position: { x: 2.5, y: 0, z: 2 },
    yawDeg: 210,
    wanderRadius: 6,
  },
  {
    id: 'enemy-evie',
    model: 'evie',
    skeleton: 'standard',
    clips: ['walk2', 'idle3', 'wave'],
    position: { x: -2.5, y: 0, z: 1.5 },
    yawDeg: 140,
    wanderRadius: 6,
  },
  {
    id: 'enemy-bowlcut',
    model: 'bowlcut',
    skeleton: 'standard',
    clips: ['walk1', 'idle2', 'talk'],
    position: { x: 1.5, y: 0, z: -2.5 },
    yawDeg: 20,
    wanderRadius: 6,
  },
  {
    id: 'enemy-archer',
    model: 'archer',
    skeleton: 'standard',
    clips: ['walk1', 'idle1', 'talk'],
    position: { x: -3, y: 0, z: -2 },
    yawDeg: 45,
    wanderRadius: 5.5,
  },
  {
    id: 'enemy-puddles',
    model: 'puddles',
    skeleton: 'standard',
    clips: ['walk2', 'idle2', 'wave'],
    position: { x: 4, y: 0, z: -1 },
    yawDeg: 300,
    wanderRadius: 5.5,
  },
  {
    id: 'enemy-finch',
    model: 'finch',
    skeleton: 'standard',
    clips: ['walk1', 'idle3', 'talk'],
    position: { x: -1, y: 0, z: 3.5 },
    yawDeg: 180,
    wanderRadius: 5,
  },
  {
    id: 'enemy-coco',
    model: 'coco',
    skeleton: 'standard',
    clips: ['walk2', 'idle1', 'talkHappy'],
    position: { x: 3, y: 0, z: 3.5 },
    yawDeg: 225,
    wanderRadius: 5,
  },
  {
    id: 'enemy-hanzo',
    model: 'hanzo',
    skeleton: 'standard',
    clips: ['walk1', 'idle2', 'talk'],
    position: { x: -4, y: 0, z: 0.5 },
    yawDeg: 90,
    wanderRadius: 5.5,
  },
  {
    id: 'enemy-bailey',
    model: 'bailey',
    skeleton: 'standard',
    clips: ['walk2', 'idle1', 'wave'],
    position: { x: 2, y: 0, z: -4 },
    yawDeg: 15,
    wanderRadius: 5.5,
  },
  {
    id: 'enemy-bean',
    model: 'bean',
    skeleton: 'standard',
    clips: ['walk1', 'idle3', 'talkHappy'],
    position: { x: -2.5, y: 0, z: 4 },
    yawDeg: 200,
    wanderRadius: 5.5,
  },
];

export { NPC_ANIMS, NPC_MODELS };
