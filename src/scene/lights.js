import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';

/**
 * Ambient + directional sun from Pengu_Plaza.unity.
 * Toon materials ignore ambient (Unlit); sun direction still drives toon bands.
 */
export function createLights(scene, options = {}) {
  const targetPos = options.target ?? SCENE.camera.lookAt;
  const sunDistance = options.sunDistance ?? 80;

  // Plaza m_AmbientSkyColor / m_AmbientGroundColor (HDR) × m_AmbientIntensity 0.28
  const sky = new THREE.Color(0.3345674, 0.68628263, 1.3962264);
  const ground = new THREE.Color(
    Math.min(2.6980393, 2),
    Math.min(5.521569, 2),
    Math.min(11.168628, 2),
  );
  const hemi = new THREE.HemisphereLight(sky, ground, SCENE.ambientIntensity);
  hemi.name = 'AmbientHemisphere';
  scene.add(hemi);

  // Soft fill so non-toon (water) isn't pure black in shadow regions
  const ambient = new THREE.AmbientLight(0xb8e8ff, 0.22);
  ambient.name = 'AmbientFill';
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(SCENE.sunColor, SCENE.sunIntensity);
  sun.name = 'DirectionalLight';
  // Toon materials ignore shadow maps; keep shadows off to save GPU.
  sun.castShadow = false;

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
