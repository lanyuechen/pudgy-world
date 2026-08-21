/**
 * Constants from Player.prefab / UnrestrictedMovementState / PlayerCamera.prefab
 */
export const PLAYER = {
  fbx: '/assets/models/player/player_pudgy.fbx',
  traitsAtlas: '/assets/textures/Traits_ColorAtlas.png',

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

  groundRayStartHeight: 0.2,
  groundRayLength: 0.45,
  skinWidth: 0.05,

  // CameraReferencePoint local offset on player
  cameraReference: { x: 0, y: 1, z: 1 },

  // PlayerCamera
  cameraDistance: 3,
  cameraFollowSpeed: 5,
  mouseSensitivityX: 180,
  mouseSensitivityY: 120,
  minPitch: -35,
  maxPitch: 60,
  autoYawSpeed: 180,

  // Spawn (plaza-ish; refined by ground ray)
  spawn: { x: -20, y: 20, z: -22 },
};
