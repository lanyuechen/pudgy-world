import { assetUrl } from './assetUrl.js';

/**
 * Intro uses loadable assets — original V1/IntroScene FBXs are FBX 6100
 * (Three.js / Assimp cannot parse). Fallback: TheBerg shell + player fishing loops.
 */
export const INTRO = {
  id: 'Intro',
  nextSceneId: 'WorldMap_02',
  /** Auto-advance to world map after this many seconds (Skip also works). */
  durationSec: 14,
  bergFbx: assetUrl('/assets/models/neighborhoods/TheBerg_V_03.fbx'),
  fishFbx: assetUrl('/assets/models/fish/1.fbx'),

  camera: {
    lookAt: { x: -2, y: 1.2, z: 2 },
    orbitDistance: 9,
    orbitPitch: 18,
    orbitYaw: -25,
    far: 2000,
    minDistance: 4,
    maxDistance: 40,
    /** Slow yaw spin during intro (deg/s) */
    yawSpeed: 8,
  },

  /** Stage placement for the two fishing buddies (meters). */
  stage: {
    position: { x: -40, y: 0, z: -100 },
    pudgy: { x: -1.1, y: 0, z: 0, yawDeg: 40 },
    peaches: { x: 1.1, y: 0, z: 0.35, yawDeg: -35 },
    fish: { x: 0.15, y: 0.35, z: 2.4 },
  },
};
