import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';

/**
 * Belly-slide streak particles (inspired by Houdini slide-fx; Unity has no runtime VFX).
 * Particles live in world space (parented to scene) so trails stay behind the player.
 */
export function createSlideFx(scene, playerRoot) {
  const cfg = PLAYER.slideFx ?? {};
  const max = cfg.maxParticles ?? 128;
  const emitRate = cfg.emitRate ?? 52;
  const lifetime = cfg.lifetime ?? 0.55;
  const color = new THREE.Color(cfg.color ?? 0xd8dde3);
  const bellyY = cfg.bellyOffsetY ?? 0.12;

  const positions = new Float32Array(max * 3);
  const sizes = new Float32Array(max);
  const alphas = new Float32Array(max);

  /** @type {{ x: number, y: number, z: number, vx: number, vy: number, vz: number, age: number, life: number, size: number }[]} */
  const pool = Array.from({ length: max }, () => ({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    age: 999,
    life: 0,
    size: 0.12,
  }));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uColor: { value: color },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (380.0 / max(-mv.z, 0.35));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float core = smoothstep(0.32, 0.0, d);
        float halo = smoothstep(0.5, 0.12, d);
        float a = max(core, halo * 0.65) * vAlpha;
        vec3 col = mix(uColor, vec3(1.0), core * 0.45);
        gl_FragColor = vec4(col, a);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'SlideFx';
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);

  let emitCarry = 0;
  const _world = new THREE.Vector3();
  const _back = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _vel = new THREE.Vector3();

  function spawnParticle(speed01) {
    const p = pool.find((item) => item.age >= item.life);
    if (!p) return;

    playerRoot.getWorldPosition(_world);
    _back.set(0, 0, -1).applyQuaternion(playerRoot.quaternion);
    _right.set(1, 0, 0).applyQuaternion(playerRoot.quaternion);

    const spread = 0.22;
    p.x = _world.x + _right.x * (Math.random() - 0.5) * spread;
    p.y = _world.y + bellyY + (Math.random() - 0.5) * 0.05;
    p.z = _world.z + _right.z * (Math.random() - 0.5) * spread;

    const streak = 1.2 + speed01 * 2.2;
    p.vx = -_back.x * streak + (Math.random() - 0.5) * 0.35;
    p.vy = 0.1 + Math.random() * 0.15;
    p.vz = -_back.z * streak + (Math.random() - 0.5) * 0.35;
    p.age = 0;
    p.life = lifetime * (0.75 + Math.random() * 0.5);
    p.size = 0.16 + speed01 * 0.22;
  }

  function writeBuffers() {
    for (let i = 0; i < max; i++) {
      const p = pool[i];
      const i3 = i * 3;
      if (p.age < p.life) {
        positions[i3] = p.x;
        positions[i3 + 1] = p.y;
        positions[i3 + 2] = p.z;
        const t = p.age / p.life;
        sizes[i] = p.size * (1 - t * 0.2);
        alphas[i] = 1 - t * 0.65;
      } else {
        positions[i3] = 0;
        positions[i3 + 1] = -9999;
        positions[i3 + 2] = 0;
        sizes[i] = 0;
        alphas[i] = 0;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.size.needsUpdate = true;
    geometry.attributes.alpha.needsUpdate = true;
  }

  function update(dt, { sliding = false, moving = false, grounded = false, velocity } = {}) {
    for (const p of pool) {
      if (p.age >= p.life) continue;
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 1.8 * dt;
    }

    const active = sliding && grounded && (moving || !!velocity);
    if (active && velocity) {
      _vel.copy(velocity);
      _vel.y = 0;
      const speed = _vel.length();
      const speed01 = THREE.MathUtils.clamp(speed / PLAYER.slideSpeed, 0.15, 1.2);
      emitCarry += emitRate * speed01 * dt;
      while (emitCarry >= 1) {
        emitCarry -= 1;
        spawnParticle(speed01);
      }
    } else {
      emitCarry = 0;
    }

    writeBuffers();
  }

  function dispose() {
    points.removeFromParent();
    geometry.dispose();
    material.dispose();
  }

  return { points, update, dispose };
}
