/**
 * Player + control config.
 * CONTROL = locomotion / camera (active system in src/control/*)
 * PLAYER = assets + gameplay extras (+ thin aliases for physics / older call sites)
 */
import { assetUrl } from './assetUrl.js';

/** Active third-person control parameters */
export const CONTROL = {
  fixedDt: 0.02,

  walkSpeed: 4.0,
  runSpeed: 6.5,
  rotateSmooth: 8.0,
  gravity: -19.8,
  jumpForce: 7.5,
  maxSlopeAngle: 45,

  capsuleRadius: 0.4,
  capsuleHeight: 1.5,
  capsuleCenterY: 0.75,
  skinWidth: 0.02,
  collisionSkin: 0.02,
  autostepMaxHeight: 0.55,
  autostepMinWidth: 0.2,
  characterSnapDist: 0.2,
  rapierMaxMeshVerts: 200_000,

  camDefaultDistance: 6.0,
  camMinDistance: 2.5,
  camMaxDistance: 120.0,
  mouseSensitivity: 0.18,
  pitchMin: -20,
  pitchMax: 60,
  camSmoothDamp: 0.28,
  springBackSpeed: 1.6,
  boomPullSpeed: 4.0,
  cameraOffsetY: 1.2,
  cameraCollisionPad: 0.15,
  autoYawSpeed: 70,

  softLookYawDeg: 10,
  softLookPitchDeg: 6,
  softLookFollowSpeed: 0.5,
  softLookDeadzone: 0.04,
};

/** Assets + gameplay; spreads CONTROL for convenience */
export const PLAYER = {
  ...CONTROL,

  // Physics / legacy name aliases
  radius: CONTROL.capsuleRadius,
  height: CONTROL.capsuleHeight,
  centerY: CONTROL.capsuleCenterY,
  /** Used by slide FX as run-speed scale */
  slideSpeed: CONTROL.runSpeed,

  fbx: assetUrl('/assets/models/player/player_pudgy.fbx'),
  traitsAtlas: assetUrl('/assets/textures/Traits_ColorAtlas.png'),

  throwCooldown: 1,
  throwAnimationDuration: 0.25,
  snowballInitialVelocity: { x: 0, y: 2, z: 12.5 },
  snowballRadius: 0.125,
  snowballHandBones: ['R_Arm_02_end', 'R_Arm_02'],

  afkIdleDelay: 10,
  afkClips: ['afk1', 'afk2', 'afk3'],

  fishingCatchHold: 2.4,

  slideFx: {
    maxParticles: 64,
    emitRate: 52,
    lifetime: 0.55,
    color: 0xf3f6f8,
    bellyOffsetY: 0.12,
    texture: assetUrl('/assets/textures/snow-particle.png'),
  },

  spawn: { x: -20, y: 20, z: -22 },
};
