import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';

/**
 * Approximates Unity Skybox/Procedural (Skybox_Test.mat):
 * cyan sky tint, aqua ground, exposure 2.09, atmosphere 0.6, sun disk off.
 */
export function createProceduralSky() {
  const { skyTint, groundColor, skyExposure, atmosphereThickness } = SCENE;

  const uniforms = {
    topColor: {
      value: new THREE.Color(skyTint.r, skyTint.g, skyTint.b).multiplyScalar(skyExposure * 0.55),
    },
    bottomColor: {
      value: new THREE.Color(groundColor.r, groundColor.g, groundColor.b).multiplyScalar(
        skyExposure * 0.45,
      ),
    },
    offset: { value: 0.15 },
    exponent: { value: 0.55 + atmosphereThickness * 0.35 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float t = max(pow(max(h, 0.0), exponent), 0.0);
        vec3 color = mix(bottomColor, topColor, t);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), material);
  sky.name = 'ProceduralSky';
  sky.frustumCulled = false;
  return sky;
}
