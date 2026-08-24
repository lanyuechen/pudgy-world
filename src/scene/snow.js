import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';

/**
 * Lightweight snow field approximating the Unity ParticleSystem "Snow"
 * (box emitter ~99×121.8×15.4 at (4.8, 4.85, 27), rotated -90° X).
 */
export function createSnow(texture) {
  const cfg = SCENE.snow;
  const count = cfg.count;

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  // After -90° X, Unity box Y maps roughly to world Z depth; keep a large volume
  // covering the plaza water/land area.
  const halfX = cfg.boxScale.x * 0.5;
  const halfY = cfg.boxScale.z * 0.5; // vertical extent after rotation
  const halfZ = cfg.boxScale.y * 0.5;

  const origin = new THREE.Vector3(cfg.position.x, cfg.position.y + halfY * 0.5, cfg.position.z);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = origin.x + (Math.random() * 2 - 1) * halfX;
    positions[i3 + 1] = origin.y + (Math.random() * 2 - 1) * halfY;
    positions[i3 + 2] = origin.z + (Math.random() * 2 - 1) * halfZ;

    velocities[i3] = (Math.random() - 0.5) * 0.4;
    velocities[i3 + 1] = -(0.8 + Math.random() * 1.2);
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.4;

    sizes[i] =
      cfg.startSizeMin + Math.random() * (cfg.startSizeMax - cfg.startSizeMin);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    map: texture ?? null,
    color: 0xffffff,
    size: 0.35,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: true,
    blending: THREE.NormalBlending,
  });
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
    material.alphaTest = 0.05;
  }

  const points = new THREE.Points(geometry, material);
  points.name = 'Snow';
  points.frustumCulled = false;

  const bounds = {
    minY: origin.y - halfY,
    maxY: origin.y + halfY,
    minX: origin.x - halfX,
    maxX: origin.x + halfX,
    minZ: origin.z - halfZ,
    maxZ: origin.z + halfZ,
  };

  function update(dt) {
    const pos = geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3] += velocities[i3] * dt;
      pos[i3 + 1] += velocities[i3 + 1] * dt;
      pos[i3 + 2] += velocities[i3 + 2] * dt;

      if (pos[i3 + 1] < bounds.minY) {
        pos[i3] = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        pos[i3 + 1] = bounds.maxY;
        pos[i3 + 2] = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      }
    }
    geometry.attributes.position.needsUpdate = true;
  }

  return { points, update };
}
