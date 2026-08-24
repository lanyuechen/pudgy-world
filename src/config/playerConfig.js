/**
 * Constants from Player.prefab / UnrestrictedMovementState / PlayerCamera.prefab
 */
import { assetUrl } from './assetUrl.js';

export const PLAYER = {
  fbx: assetUrl('/assets/models/player/player_pudgy.fbx'),
  traitsAtlas: assetUrl('/assets/textures/Traits_ColorAtlas.png'),

  // CapsuleCollider
  radius: 0.4,
  height: 1.5,
  centerY: 0.75,

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
  cameraDistanceMin: 5,
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

  // Spawn (plaza-ish; refined by ground ray)
  spawn: { x: -20, y: 20, z: -22 },
};
