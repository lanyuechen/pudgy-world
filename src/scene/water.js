import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';

/**
 * Unity Plane (10×10 on XZ) + Blue.mat tint, with subtle ice-pool motion.
 */
export function createWater() {
  const { position, scale, color, metalness, roughness, waveAmplitude, waveSpeed, uvScroll } =
    SCENE.water;

  const geometry = new THREE.PlaneGeometry(10, 10, 48, 48);
  const uniforms = {
    uTime: { value: 0 },
    uBaseColor: {
      value: new THREE.Color(color.r, color.g, color.b),
    },
    uOpacity: { value: color.a },
    uMetalness: { value: metalness },
    uRoughness: { value: roughness },
    uWaveAmp: { value: waveAmplitude ?? 0.025 },
    uWaveSpeed: { value: waveSpeed ?? 0.45 },
    uUvScroll: {
      value: new THREE.Vector2(uvScroll?.x ?? 0.018, uvScroll?.y ?? 0.01),
    },
  };

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWaveAmp;
      uniform float uWaveSpeed;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float wave = sin(pos.x * 0.55 + uTime * uWaveSpeed) * uWaveAmp;
        wave += sin(pos.y * 0.72 - uTime * uWaveSpeed * 0.85) * uWaveAmp * 0.65;
        pos.z += wave;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorldPos = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBaseColor;
      uniform float uOpacity;
      uniform float uMetalness;
      uniform float uRoughness;
      uniform vec2 uUvScroll;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      void main() {
        vec2 flowUv = vUv + uUvScroll * uTime;
        float shimmer = 0.04 * sin(flowUv.x * 18.0 + uTime * 1.3)
                      + 0.03 * cos(flowUv.y * 14.0 - uTime * 0.9);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.4);
        vec3 col = uBaseColor + shimmer;
        col = mix(col, vec3(0.92, 0.98, 1.0), fresnel * (0.25 + uMetalness * 0.35));
        float alpha = uOpacity * (0.88 + fresnel * 0.12);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Water';
  mesh.userData.skipOutline = true;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(position.x, position.y, position.z);
  mesh.scale.set(scale, scale, scale);
  mesh.receiveShadow = true;

  function update(dt) {
    uniforms.uTime.value += dt;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, update, dispose };
}
