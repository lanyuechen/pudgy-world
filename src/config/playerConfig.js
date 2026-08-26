/**
 * Constants from Player.prefab / UnrestrictedMovementState / PlayerCamera.prefab
 */
import { assetUrl } from './assetUrl.js';

export const PLAYER = {
  fbx: assetUrl('/assets/models/player/player_pudgy.fbx'),
  traitsAtlas: assetUrl('/assets/textures/Traits_ColorAtlas.png'),

  // CapsuleCollider (Unity) → Rapier capsule (halfHeight = (height - 2*radius)/2)
  radius: 0.4,
  height: 1.5,
  centerY: 0.75,

  /** CharacterController skin (Rapier offset). */
  collisionSkin: 0.02,
  /** Cosine threshold: |normal.y| below this ⇒ wall (max slope climb). */
  wallSlopeLimit: 0.55,
  /** Max height of low obstacles the capsule can step onto (meters). */
  autostepMaxHeight: 0.55,
  /** Min flat depth required after a step (meters). */
  autostepMinWidth: 0.2,
  /** Snap-to-ground distance for Rapier CC (keep modest so steps work). */
  characterSnapDist: 0.35,
  /** Skip scene meshes with more verts than this when baking trimeshes. */
  rapierMaxMeshVerts: 200_000,

  // UnrestrictedMovementState
  walkSpeed: 2.5,
  slideSpeed: 5,
  acceleration: 15,
  jumpForce: 4,
  horizontalDamping: 10,
  rotationSpeed: 600, // deg/s
  gravity: -9.81,

  // Ground check (UnrestrictedMovementState)
  groundRayStartHeight: 0.01,
  groundRayRange: 0.05,
  /** Extra length for kinematic landing (Unity uses Rigidbody collider) */
  groundSnapProbe: 1.2,
  skinWidth: 0.02,

  // CameraReferencePoint local offset on player
  cameraReference: { x: 0, y: 1, z: 1 },

  // PlayerCamera.prefab (not C# field defaults)
  cameraDistance: 3,
  /** Closest boom — current third-person gameplay distance */
  cameraDistanceMin: 3,
  /** Farthest boom — enough to frame the whole plaza */
  cameraDistanceMax: 90,
  /** Multiplier on wheel delta (pixels/lines → meters) */
  cameraZoomSpeed: 0.08,
  /** Smooth follow toward target zoom distance */
  cameraZoomFollowSpeed: 10,
  cameraFollowSpeed: 5,
  mouseSensitivityX: 90,
  mouseSensitivityY: 60,
  /**
   * Browser pointer `movementX/Y` is raw pixels; Unity Pointer/delta with sens 90
   * feels similar when scaled ~0.1–0.15 before sens*dt.
   */
  mouseDeltaScale: 0.3,
  minPitch: -35,
  maxPitch: 60,
  autoYawSpeed: 100,

  /**
   * Screen-position soft look (idle only): mouse vs center → capped yaw/pitch.
   * Disabled while moving. Edge ≈ ±softLookYawDeg.
   */
  softLookYawDeg: 5,
  softLookPitchDeg: 3,
  softLookFollowSpeed: 1.6, // was 8; ~5× slower ease to screen offset
  softLookDeadzone: 0.05,

  // Player.prefab — Throwing Snowballs
  /** Unity InputSystem_Actions: Keyboard F / Gamepad West */
  throwCooldown: 1,
  /** Player.prefab override duration (not C# default 1.0) */
  throwAnimationDuration: 0.25,
  /** Snowball.prefab _initialVelocity — applied in player local space */
  snowballInitialVelocity: { x: 0, y: 2, z: 12.5 },
  /** Snowball.prefab SphereCollider radius (Visuals scale 0.25 × default sphere 0.5) */
  snowballRadius: 0.125,
  /** Bone for spawn (Player._handTransform on armature) */
  snowballHandBones: ['R_Arm_02_end', 'R_Arm_02'],

  /** Unity PlayerAnimator.controller locomotion states @ 1.75 */
  locomotionAnimSpeed: 1.75,
  /** AFK clips exist in FBX but not in Unity controller — play after standing still */
  afkIdleDelay: 10,
  afkClips: ['afk1', 'afk2', 'afk3'],

  /** FishingCast / HoldingFish are 1-frame poses in player_pudgy.fbx */
  fishingCastHold: 0.55,
  fishingCatchHold: 2.4,

  /** Belly-slide streak particles (Houdini slide-fx inspired) */
  slideFx: {
    maxParticles: 64,
    emitRate: 52,
    lifetime: 0.55,
    color: 0xf3f6f8,
    bellyOffsetY: 0.12,
    texture: assetUrl('/assets/textures/snow-particle.png'),
  },

  // Spawn (plaza-ish; refined by ground ray)
  spawn: { x: -20, y: 20, z: -22 },
};
