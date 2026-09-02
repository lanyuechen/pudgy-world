import * as THREE from 'three';
import { SCENE } from '../config/sceneConfig.js';

/** Flip to true to restore cartoon island / plaza water. */
export const WATER_ENABLED = false;

function createNullWater() {
  const mesh = new THREE.Object3D();
  mesh.name = 'Water';
  mesh.visible = false;
  return {
    mesh,
    update() {},
    prepareDepth() {},
    setSize() {},
    dispose() {},
  };
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(size, seed, octaves, gain) {
  const out = new Float32Array(size * size);
  let totAmp = 0;
  for (let o = 0; o < octaves; o++) totAmp += Math.pow(gain, o);
  for (let o = 0; o < octaves; o++) {
    const rand = mulberry32(seed + o * 7919);
    const res = 4 * Math.pow(2, o);
    const w = res + 2;
    const g = new Float32Array(w * w);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    const amp = Math.pow(gain, o);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * res;
        const fy = (y / size) * res;
        const xi = Math.floor(fx);
        const yi = Math.floor(fy);
        const xf = fx - xi;
        const yf = fy - yi;
        const u = xf * xf * (3 - 2 * xf);
        const v = yf * yf * (3 - 2 * yf);
        const a = g[yi * w + xi];
        const b = g[yi * w + xi + 1];
        const c = g[(yi + 1) * w + xi];
        const d = g[(yi + 1) * w + xi + 1];
        const n = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        out[y * size + x] += n * amp;
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= totAmp;
  return out;
}

function noiseTexture(data, size, contrast, center) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < data.length; i++) {
    let v = (data[i] - 0.5) * contrast + 0.5 + center;
    v = Math.max(0, Math.min(1, v));
    const p = i * 4;
    const b = Math.round(v * 255);
    img.data[p] = b;
    img.data[p + 1] = b;
    img.data[p + 2] = b;
    img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

const DEFAULTS = {
  shallow: 0x6ec4e6,
  deep: 0x1d5e9c,
  sky: 0xbfd9f2,
  depthScale: 2.5,
  shore: 0.3,
  flowSpeed: 1,
  fresnel: 0.25,
};

/**
 * Cartoon water: screen-depth shallow/deep, shore foam, dual-UV flow, weak fresnel.
 * Call prepareDepth() each frame before the main scene render.
 *
 * @param {{
 *   size?: number,
 *   position?: { x: number, y: number, z: number },
 *   shallow?: number,
 *   deep?: number,
 *   sky?: number,
 *   depthScale?: number,
 *   shore?: number,
 *   flowSpeed?: number,
 *   fresnel?: number,
 * }} [opts]
 */
export function createWater(opts = {}) {
  if (!WATER_ENABLED) return createNullWater();

  const size = opts.size ?? 60;
  const position = opts.position ?? { x: 0, y: 0, z: 0 };

  const noiseSize = 128;
  const normalTex = noiseTexture(makeNoise(noiseSize, 7, 4, 0.55), noiseSize, 0.6, 0);
  const foamTex = noiseTexture(makeNoise(noiseSize, 42, 4, 0.5), noiseSize, 1.0, 0);

  const uniforms = {
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color(opts.shallow ?? DEFAULTS.shallow) },
    uDeep: { value: new THREE.Color(opts.deep ?? DEFAULTS.deep) },
    uSky: { value: new THREE.Color(opts.sky ?? DEFAULTS.sky) },
    uDepthScale: { value: opts.depthScale ?? DEFAULTS.depthScale },
    uShore: { value: opts.shore ?? DEFAULTS.shore },
    uFlowSpeed: { value: opts.flowSpeed ?? DEFAULTS.flowSpeed },
    uFres: { value: opts.fresnel ?? DEFAULTS.fresnel },
    uNormal: { value: normalTex },
    uFoam: { value: foamTex },
    sceneDepth: { value: null },
    uNear: { value: 0.3 },
    uFar: { value: 1000 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vViewDir;
      varying vec4 vClipPos;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        vClipPos = projectionMatrix * mv;
        gl_Position = vClipPos;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime, uDepthScale, uShore, uFlowSpeed, uFres, uNear, uFar;
      uniform vec3 uShallow, uDeep, uSky;
      uniform sampler2D uNormal, uFoam, sceneDepth;
      varying vec2 vUv;
      varying vec3 vViewDir;
      varying vec4 vClipPos;

      float linearize(float d) {
        float z = d * 2.0 - 1.0;
        return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
      }

      void main() {
        float t = uTime * uFlowSpeed;

        vec2 uv1 = vUv * 1.6 + vec2(t * 0.030, t * 0.015);
        vec2 uv2 = vUv * 1.6 + vec2(-t * 0.020, t * 0.025);
        vec3 nA = texture2D(uNormal, uv1).rgb * 2.0 - 1.0;
        vec3 nB = texture2D(uNormal, uv2).rgb * 2.0 - 1.0;
        vec3 n = normalize(mix(nA, nB, 0.5));

        vec2 suv = vClipPos.xy / vClipPos.w * 0.5 + 0.5;
        float fragL = linearize(gl_FragCoord.z);
        float sceneL = linearize(texture2D(sceneDepth, suv).r);
        float d = clamp((sceneL - fragL) * uDepthScale, 0.0, 1.0);

        vec3 col = mix(uShallow, uDeep, d);

        float shoreMask = 1.0 - smoothstep(0.0, uShore, d);
        vec2 fuv = vUv * 2.2 + vec2(t * 0.040, t * 0.020);
        float fn = texture2D(uFoam, fuv).r;
        float foam = shoreMask * smoothstep(0.60, 0.92, fn);
        col = mix(col, vec3(1.0), foam * 0.9);

        float fres = pow(1.0 - max(dot(n, vViewDir), 0.0), 2.2);
        col += uSky * fres * uFres;

        float alpha = mix(0.55, 1.0, d);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const geometry = new THREE.PlaneGeometry(size, size);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Water';
  mesh.userData.skipOutline = true;
  mesh.userData.skipCollision = true;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(position.x, position.y, position.z);
  mesh.renderOrder = 10;
  mesh.receiveShadow = false;
  mesh.castShadow = false;

  const depthMaterial = new THREE.MeshDepthMaterial();
  const depthTexture = new THREE.DepthTexture();
  depthTexture.format = THREE.DepthFormat;
  depthTexture.type = THREE.UnsignedIntType;

  let depthRT = new THREE.WebGLRenderTarget(4, 4, {
    depthTexture,
    depthBuffer: true,
  });
  depthRT.texture.minFilter = THREE.NearestFilter;
  depthRT.texture.magFilter = THREE.NearestFilter;

  /** @type {THREE.Object3D[]} */
  const hideDuringDepth = [];

  function setSize(width, height, pixelRatio = 1) {
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    if (depthRT.width === w && depthRT.height === h) return;
    depthRT.setSize(w, h);
  }

  /**
   * Pass 1: render scene depth without water (and without FX/player clutter).
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  function prepareDepth(renderer, scene, camera) {
    uniforms.uNear.value = camera.near;
    uniforms.uFar.value = camera.far;

    hideDuringDepth.length = 0;
    mesh.visible = false;
    scene.traverse((obj) => {
      if (!obj.visible) return;
      if (
        obj === mesh ||
        obj.userData?.isSnowball ||
        obj.userData?.isEnemy ||
        obj.userData?.isFishingHole ||
        obj.userData?.isHullOutlineMesh ||
        obj.name === 'Player' ||
        obj.name === 'QuarksFx' ||
        obj.name === 'QuarksHitFx' ||
        obj.name === 'SlideFx' ||
        obj.name === 'EffectPreviewBatch'
      ) {
        hideDuringDepth.push(obj);
        obj.visible = false;
      }
    });

    const prevOverride = scene.overrideMaterial;
    scene.overrideMaterial = depthMaterial;
    renderer.setRenderTarget(depthRT);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    scene.overrideMaterial = prevOverride;

    for (const obj of hideDuringDepth) obj.visible = true;
    hideDuringDepth.length = 0;
    mesh.visible = true;

    uniforms.sceneDepth.value = depthRT.depthTexture;
  }

  function update(dt) {
    uniforms.uTime.value += dt;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    depthMaterial.dispose();
    normalTex.dispose();
    foamTex.dispose();
    depthRT.dispose();
    depthTexture.dispose();
  }

  return { mesh, update, prepareDepth, setSize, dispose, uniforms };
}

/**
 * Plaza water using Unity-mirrored placement, cartoon shader.
 */
export function createPlazaWater() {
  const cfg = SCENE.water;
  // Unity Plane is 10×10; scale multiplies that.
  const size = 10 * (cfg.scale ?? 1);
  return createWater({
    size,
    position: cfg.position,
    shallow: new THREE.Color(cfg.color.r, cfg.color.g, cfg.color.b).getHex(),
    deep: 0x1a6a9e,
    sky: 0xb8daf0,
    depthScale: 2.2,
    shore: 0.28,
    flowSpeed: 0.85,
    fresnel: 0.22,
  });
}

/**
 * Water ring sized around an island / land root.
 * @param {THREE.Object3D} landRoot
 * @param {{ margin?: number, yBias?: number }} [opts]
 */
export function createIslandWater(landRoot, opts = {}) {
  landRoot.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(landRoot);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const margin = opts.margin ?? 0.85;
  const span = Math.max(size.x, size.z, 8);
  const waterSize = span * (1 + margin * 2);
  const yBias = opts.yBias ?? Math.min(1.4, Math.max(0.35, size.y * 0.1));
  const waterY = box.min.y + yBias;

  return createWater({
    size: waterSize,
    position: { x: center.x, y: waterY, z: center.z },
    shallow: 0x7ecce8,
    deep: 0x1d5e9c,
    sky: 0xbfd9f2,
    depthScale: 2.4,
    shore: 0.32,
    flowSpeed: 1,
    fresnel: 0.25,
  });
}
