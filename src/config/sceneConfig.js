/**
 * Scene constants mirrored from Assets/Scenes/Pengu_Plaza.unity
 * and related materials (Skybox_Test, Blue, PlayerCamera).
 */
export const SCENE = {
  ambientIntensity: 0.28,
  ambientSky: 0x55aeff,
  ambientGround: 0xa8dfff,

  // Directional Light
  sunColor: 0xffffff,
  sunIntensity: 2.5,
  sunShadowStrength: 0.55,
  // Unity m_LocalEulerAnglesHint on Directional Light
  sunEulerDeg: { x: 58.064, y: 89.64, z: -229.178 },
  sunPosition: { x: 0, y: 3, z: 0 },

  // Skybox_Test.mat (Skybox/Procedural)
  skyTint: { r: 0.48113203, g: 0.961085, b: 1 },
  groundColor: { r: 0.21568628, g: 0.9490196, b: 1 },
  atmosphereThickness: 0.6,
  skyExposure: 2.09,
  sunSize: 0,

  // Water plane (Unity default Plane is 10x10 on XZ)
  water: {
    position: { x: 17.2897, y: -6.8, z: 18.75205 },
    scale: 61.27908,
    color: { r: 0.57169807, g: 0.92392004, b: 1, a: 0.88235295 },
    metalness: 0.342,
    roughness: 0.5,
  },

  // Snow particle emitter
  snow: {
    position: { x: 4.8, y: 4.85, z: 27 },
    // Unity ShapeModule box scale (type Box), emitter rotated -90° X
    boxScale: { x: 99, y: 121.8, z: 15.4 },
    startSizeMin: 0.1,
    startSizeMax: 0.2,
    lifetime: 10,
    count: 2500,
  },

  // PlayerCamera
  camera: {
    fov: 60,
    near: 0.3,
    far: 1000,
    distance: 3,
    minPitch: -35,
    maxPitch: 60,
    moveSpeed: 5,
    // Initial explore vantage (plaza world-space center after cm→m scale)
    lookAt: { x: -20, y: 4, z: -22 },
    orbitDistance: 55,
    orbitPitch: 25,
    orbitYaw: 40,
  },

  assets: {
    plazaFbx: '/assets/models/asset-list/Individual_PenguPlaza_02.fbx',
    bergAtlas: '/assets/textures/TheBerg_ColorAtlas.png',
    billboardAtlas: '/assets/textures/BillboardTexture_02.png',
    snowParticle: '/assets/textures/snow-particle.png',
  },
};
