import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';

/**
 * Ambient + directional sun.
 * @param {THREE.Scene} scene
 * @param {{ target?: {x:number,y:number,z:number}, castShadow?: boolean, sunDistance?: number }} [options]
 */
export function createLights(scene, options = {}) {
  const targetPos = options.target ?? SCENE.camera.lookAt;
  const castShadow = options.castShadow !== false;
  const sunDistance = options.sunDistance ?? 80;

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
  sun.castShadow = castShadow;
  if (castShadow) {
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 250;
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
  }

  const pitch = THREE.MathUtils.degToRad(SCENE.sunEulerDeg.x);
  const yaw = THREE.MathUtils.degToRad(SCENE.sunEulerDeg.y);
  sun.position.set(
    targetPos.x + Math.sin(yaw) * Math.cos(pitch) * sunDistance,
    targetPos.y + Math.sin(pitch) * sunDistance,
    targetPos.z + Math.cos(yaw) * Math.cos(pitch) * sunDistance,
  );
  sun.target.position.set(targetPos.x, targetPos.y, targetPos.z);
  scene.add(sun);
  scene.add(sun.target);

  return { ambient, hemi, sun };
}
