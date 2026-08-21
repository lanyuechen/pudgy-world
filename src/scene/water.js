import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';

/**
 * Unity Plane (10×10 on XZ) scaled to match Pengu_Plaza Water transform + Blue.mat.
 */
export function createWater() {
  const { position, scale, color, metalness, roughness } = SCENE.water;

  const geometry = new THREE.PlaneGeometry(10, 10);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color.r, color.g, color.b),
    metalness,
    roughness,
    transparent: true,
    opacity: color.a,
    side: THREE.DoubleSide,
  });

  const water = new THREE.Mesh(geometry, material);
  water.name = 'Water';
  water.rotation.x = -Math.PI / 2;
  water.position.set(position.x, position.y, position.z);
  water.scale.set(scale, scale, scale);
  water.receiveShadow = true;
  return water;
}
