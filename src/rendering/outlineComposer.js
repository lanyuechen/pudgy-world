import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * Unity M_Outline3 / Outline PP live params (PC_Renderer FullScreenPass).
 * Thickness is UV-scale in Unity (thickness/resolution); we expose pixel width
 * so the Club-Penguin-style edge stays readable at typical resolutions.
 */
export const OUTLINE = {
  /** Pixel kernel radius (Unity mat thickness 0.5 ≈ sub-pixel; hull adds the rest). */
  thickness: 1.25,
  normalThreshold: 0.7,
  colorThreshold: 0.9,
  color: new THREE.Color(0x000000),
  overlay: true,
};

const OutlineShader = {
  name: 'UnityOutlinePP',
  uniforms: {
    tDiffuse: { value: null },
    tNormal: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    thickness: { value: OUTLINE.thickness },
    normalThreshold: { value: OUTLINE.normalThreshold },
    colorThreshold: { value: OUTLINE.colorThreshold },
    outlineColor: { value: OUTLINE.color.clone() },
    overlay: { value: OUTLINE.overlay ? 1 : 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform vec2 resolution;
    uniform float thickness;
    uniform float normalThreshold;
    uniform float colorThreshold;
    uniform vec3 outlineColor;
    uniform float overlay;
    varying vec2 vUv;

    void main() {
      vec2 texel = thickness / resolution;

      // Roberts-style diagonal pairs (matches Outline PP graph sampling pattern)
      vec3 n0 = texture2D(tNormal, vUv + vec2( texel.x,  texel.y)).rgb;
      vec3 n1 = texture2D(tNormal, vUv + vec2(-texel.x, -texel.y)).rgb;
      vec3 n2 = texture2D(tNormal, vUv + vec2( texel.x, -texel.y)).rgb;
      vec3 n3 = texture2D(tNormal, vUv + vec2(-texel.x,  texel.y)).rgb;

      vec3 c0 = texture2D(tDiffuse, vUv + vec2( texel.x,  texel.y)).rgb;
      vec3 c1 = texture2D(tDiffuse, vUv + vec2(-texel.x, -texel.y)).rgb;
      vec3 c2 = texture2D(tDiffuse, vUv + vec2( texel.x, -texel.y)).rgb;
      vec3 c3 = texture2D(tDiffuse, vUv + vec2(-texel.x,  texel.y)).rgb;

      float normalEdge =
        length(n0 - n1) +
        length(n2 - n3);
      float colorEdge =
        length(c0 - c1) +
        length(c2 - c3);

      // Unity graph: smoothstep(threshold, 2.0, edgeLength)
      float nMask = smoothstep(normalThreshold, 2.0, normalEdge);
      float cMask = smoothstep(colorThreshold, 2.0, colorEdge);
      float edge = clamp(nMask + cMask, 0.0, 1.0);

      vec3 scene = texture2D(tDiffuse, vUv).rgb;
      vec3 outColor = mix(scene, outlineColor, edge);
      if (overlay < 0.5) {
        outColor = edge * outlineColor;
      }
      gl_FragColor = vec4(outColor, 1.0);
    }
  `,
};

function shouldSkipOutlineObject(obj) {
  if (!obj.visible) return false;
  if (obj.isPoints || obj.isLine || obj.isSprite) return true;
  const n = obj.name || '';
  if (/sky|snow|water|particle/i.test(n)) return true;
  if (obj.userData?.skipOutline) return true;
  return false;
}

/**
 * Color render + normal buffer Roberts outline (Unity PC_Renderer Outlines pass).
 */
export function createOutlineComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const normalTarget = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    type: THREE.HalfFloatType,
    depthBuffer: true,
  });
  normalTarget.texture.name = 'OutlineNormalBuffer';

  const normalMaterial = new THREE.MeshNormalMaterial({
    flatShading: false,
  });

  const outlinePass = new ShaderPass(OutlineShader);
  outlinePass.uniforms.tNormal.value = normalTarget.texture;
  composer.addPass(outlinePass);

  const hidden = [];

  function setSize(width, height, pixelRatio = renderer.getPixelRatio()) {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    normalTarget.setSize(w, h);
    outlinePass.uniforms.resolution.value.set(w, h);
  }

  const initial = new THREE.Vector2();
  renderer.getSize(initial);
  setSize(initial.x, initial.y, renderer.getPixelRatio());

  function renderNormals() {
    hidden.length = 0;
    scene.traverse((obj) => {
      if (shouldSkipOutlineObject(obj) && obj.visible) {
        obj.visible = false;
        hidden.push(obj);
      }
    });

    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    const prevAutoClear = renderer.autoClear;

    scene.overrideMaterial = normalMaterial;
    scene.background = new THREE.Color(0x7777ff);
    renderer.autoClear = true;
    renderer.setRenderTarget(normalTarget);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    renderer.autoClear = prevAutoClear;

    for (const obj of hidden) obj.visible = true;
  }

  function render() {
    renderNormals();
    composer.render();
  }

  function dispose() {
    composer.dispose();
    normalTarget.dispose();
    normalMaterial.dispose();
  }

  return {
    composer,
    outlinePass,
    render,
    setSize,
    dispose,
  };
}
