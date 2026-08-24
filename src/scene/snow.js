import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';

/**
 * Lightweight snow field approximating the Unity ParticleSystem "Snow"
 * (box emitter ~99×121.8×15.4 at (4.8, 4.85, 27), rotated -90° X).
 */
export function createSnow(texture) {
  const cfg = SCENE.snow;
  const count = cfg.count;
  const noiseStrength = cfg.noiseStrength ?? 0.5;

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);

  const halfX = cfg.boxScale.x * 0.5;
  const halfY = cfg.boxScale.z * 0.5;
  const halfZ = cfg.boxScale.y * 0.5;

  const origin = new THREE.Vector3(cfg.position.x, cfg.position.y + halfY * 0.5, cfg.position.z);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = origin.x + (Math.random() * 2 - 1) * halfX;
    positions[i3 + 1] = origin.y + (Math.random() * 2 - 1) * halfY;
    positions[i3 + 2] = origin.z + (Math.random() * 2 - 1) * halfZ;

    velocities[i3] = 0;
    velocities[i3 + 1] = -(1 + Math.random());
    velocities[i3 + 2] = 0;

    sizes[i] = cfg.startSizeMin + Math.random() * (cfg.startSizeMax - cfg.startSizeMin);
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    map: texture ?? null,
    color: 0xffffff,
    size: 0.16,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
    material.alphaTest = 0.5;
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

  let time = 0;

  function respawn(i) {
    const i3 = i * 3;
    const pos = geometry.attributes.position.array;
    pos[i3] = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
    pos[i3 + 1] = bounds.maxY;
    pos[i3 + 2] = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
    velocities[i3] = 0;
    velocities[i3 + 1] = -(1 + Math.random());
    velocities[i3 + 2] = 0;
  }

  function update(dt) {
    time += dt;
    const pos = geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const n = Math.sin(time * 1.7 + phases[i]) * noiseStrength;
      pos[i3] += (velocities[i3] + n * 0.35) * dt;
      pos[i3 + 1] += velocities[i3 + 1] * dt;
      pos[i3 + 2] += (velocities[i3 + 2] + Math.cos(time * 1.3 + phases[i]) * noiseStrength * 0.35) * dt;

      if (pos[i3 + 1] < bounds.minY) respawn(i);
    }
    geometry.attributes.position.needsUpdate = true;
  }

  return { points, update };
}
