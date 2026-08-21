import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';

/**
 * Ambient + directional sun matching Pengu_Plaza Directional Light.
 * Unity also gets skybox GI; we add AmbientLight so atlas colors stay visible.
 */
export function createLights(scene) {
  // Fill that approximates baked/sky ambient (Unity ambientIntensity alone is low
  // because skybox contribution is missing in Three).
  const ambient = new THREE.AmbientLight(0xb8e8ff, 0.85);
  ambient.name = 'AmbientFill';
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(
    SCENE.ambientSky,
    SCENE.ambientGround,
    Math.max(SCENE.ambientIntensity, 0.55),
  );
  hemi.name = 'AmbientHemisphere';
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(SCENE.sunColor, SCENE.sunIntensity);
  sun.name = 'DirectionalLight';
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 250;
  sun.shadow.camera.left = -120;
  sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120;
  sun.shadow.camera.bottom = -120;

  // High sun from ~east matching Unity euler hint (pitch ~58°, yaw ~90°)
  const pitch = THREE.MathUtils.degToRad(SCENE.sunEulerDeg.x);
  const yaw = THREE.MathUtils.degToRad(SCENE.sunEulerDeg.y);
  const distance = 80;
  sun.position.set(
    Math.sin(yaw) * Math.cos(pitch) * distance,
    Math.sin(pitch) * distance,
    Math.cos(yaw) * Math.cos(pitch) * distance,
  );
  sun.target.position.set(-20, 0, -22);
  scene.add(sun);
  scene.add(sun.target);

  return { ambient, hemi, sun };
}
