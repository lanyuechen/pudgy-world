import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OUTLINE } from './outlineConfig.js';

const { pp, ssao } = OUTLINE;

/**
 * Unity Outline PP.shadergraph / M_Outline3.mat
 * Roberts diagonals on NormalWS + BlitSource (scene color), additive masks, overlay lerp.
 *
 * Pipeline (PC_Renderer): scene → SSAO → Outlines FullScreenPass.
 * Color edges + overlay sample post-SSAO BlitSource (tDiffuse after GTAO).
 */
const OutlineShader = {
  name: 'UnityOutlinePP',
  uniforms: {
    tDiffuse: { value: null },
    tNormal: { value: null },
    tDepth: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    thickness: { value: pp.thickness },
    normalThreshold: { value: pp.normalThreshold },
    colorThreshold: { value: pp.colorThreshold },
    depthThreshold: { value: pp.depthThreshold },
    outlineColor: { value: pp.color.clone() },
    overlay: { value: pp.overlay ? 1 : 0 },
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
    uniform sampler2D tDepth;
    uniform vec2 resolution;
    uniform float thickness;
    uniform float normalThreshold;
    uniform float colorThreshold;
    uniform float depthThreshold;
    uniform vec3 outlineColor;
    uniform float overlay;
    varying vec2 vUv;

    void main() {
      vec2 texel = thickness / resolution;

      vec3 n0 = texture2D(tNormal, vUv + vec2( texel.x,  texel.y)).rgb;
      vec3 n1 = texture2D(tNormal, vUv + vec2(-texel.x, -texel.y)).rgb;
      vec3 n2 = texture2D(tNormal, vUv + vec2( texel.x, -texel.y)).rgb;
      vec3 n3 = texture2D(tNormal, vUv + vec2(-texel.x,  texel.y)).rgb;
      float normalEdge = length(n0 - n1) + length(n2 - n3);
      float nMask = smoothstep(normalThreshold, 2.0, normalEdge);

      vec3 c0 = texture2D(tDiffuse, vUv + vec2( texel.x,  texel.y)).rgb;
      vec3 c1 = texture2D(tDiffuse, vUv + vec2(-texel.x, -texel.y)).rgb;
      vec3 c2 = texture2D(tDiffuse, vUv + vec2( texel.x, -texel.y)).rgb;
      vec3 c3 = texture2D(tDiffuse, vUv + vec2(-texel.x,  texel.y)).rgb;
      float colorEdge = length(c0 - c1) + length(c2 - c3);
      float cMask = smoothstep(colorThreshold, 2.0, colorEdge);

      float d0 = texture2D(tDepth, vUv + vec2( texel.x,  texel.y)).r;
      float d1 = texture2D(tDepth, vUv + vec2(-texel.x, -texel.y)).r;
      float d2 = texture2D(tDepth, vUv + vec2( texel.x, -texel.y)).r;
      float d3 = texture2D(tDepth, vUv + vec2(-texel.x,  texel.y)).r;
      float depthEdge = abs(d0 - d1) + abs(d2 - d3);
      float dMask = smoothstep(depthThreshold, depthThreshold * 12.0, depthEdge);

      float edge = clamp(nMask + cMask + dMask, 0.0, 1.0);

      vec3 scene = texture2D(tDiffuse, vUv).rgb;
      vec3 outColor = mix(scene, outlineColor, edge);
      if (overlay < 0.5) outColor = edge * outlineColor;
      gl_FragColor = vec4(outColor, 1.0);
    }
  `,
};

/**
 * World-space normals — Unity URP Sample Buffer NormalWorldSpace / DepthNormals.
 * Stored raw in HalfFloat RT (xyz in [-1,1]), not MeshNormalMaterial view-space pack.
 */
function createWorldNormalMaterial() {
  return new THREE.ShaderMaterial({
    name: 'WorldSpaceNormals',
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>

      varying vec3 vWorldNormal;

      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>

        // Object-space → world (Unity NormalWorldSpace)
        vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);

        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldNormal;

      void main() {
        gl_FragColor = vec4(normalize(vWorldNormal), 1.0);
      }
    `,
    side: THREE.FrontSide,
    fog: false,
    lights: false,
    toneMapped: false,
  });
}

/**
 * Match URP DepthNormals coverage: skip non-mesh / particles / hull only.
 * Keep water and opaque scene meshes — do not swap background to a fake normal color.
 */
function shouldSkipNormalObject(obj) {
  if (!obj.visible) return false;
  if (obj.isPoints || obj.isLine || obj.isSprite) return true;
  if (obj.userData?.skipOutline || obj.userData?.isHullOutlineMesh) return true;
  return false;
}

function createNormalTarget(width, height) {
  const depthTexture = new THREE.DepthTexture(width, height);
  depthTexture.format = THREE.DepthFormat;
  depthTexture.type = THREE.UnsignedIntType;

  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    type: THREE.HalfFloatType,
    depthTexture,
    depthBuffer: true,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

/**
 * Color → GTAO (SSAO) → Outline PP → output.
 * Matches PC_Renderer: SSAO feature then Outlines FullScreenPass (BlitSource = post-SSAO).
 */
export function createOutlineComposer(renderer, scene, camera) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const pr = renderer.getPixelRatio();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const gtaoPass = new GTAOPass(scene, camera, size.x, size.y);
  gtaoPass.output = GTAOPass.OUTPUT.Default;
  if (gtaoPass.updateGtaoMaterial) {
    gtaoPass.updateGtaoMaterial({
      radius: ssao.radius,
      thickness: 1,
      scale: ssao.intensity,
    });
  }
  gtaoPass.blendIntensity = ssao.intensity;
  composer.addPass(gtaoPass);

  const normalMaterial = createWorldNormalMaterial();
  let normalTarget = createNormalTarget(1, 1);
  const outlinePass = new ShaderPass(OutlineShader);
  outlinePass.enabled = pp.enabled;
  outlinePass.uniforms.tNormal.value = normalTarget.texture;
  outlinePass.uniforms.tDepth.value = normalTarget.depthTexture;
  // Outline receives tDiffuse from GTAO output (= Unity BlitSource after SSAO)
  composer.addPass(outlinePass);
  composer.addPass(new OutputPass());

  const hidden = [];
  const clearColor = new THREE.Color(0x000000);
  const prevClear = new THREE.Color();

  function setSize(width, height, pixelRatio = renderer.getPixelRatio()) {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    gtaoPass.setSize(w, h);
    normalTarget.dispose();
    normalTarget = createNormalTarget(w, h);
    outlinePass.uniforms.tNormal.value = normalTarget.texture;
    outlinePass.uniforms.tDepth.value = normalTarget.depthTexture;
    outlinePass.uniforms.resolution.value.set(w, h);
  }

  setSize(size.x, size.y, pr);

  function renderNormals() {
    hidden.length = 0;
    scene.traverse((obj) => {
      if (shouldSkipNormalObject(obj) && obj.visible) {
        obj.visible = false;
        hidden.push(obj);
      }
    });

    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    const prevAutoClear = renderer.autoClear;
    renderer.getClearColor(prevClear);
    const prevClearAlpha = renderer.getClearAlpha();

    // Empty DepthNormals = (0,0,0). Do not paint sky cyan/purple into the normal RT.
    scene.overrideMaterial = normalMaterial;
    scene.background = null;
    renderer.autoClear = false;
    renderer.setClearColor(clearColor, 1);
    renderer.setRenderTarget(normalTarget);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    renderer.setClearColor(prevClear, prevClearAlpha);
    renderer.autoClear = prevAutoClear;
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    for (const obj of hidden) obj.visible = true;
  }

  function setPpEnabled(enabled) {
    pp.enabled = enabled;
    outlinePass.enabled = enabled;
  }

  function render() {
    if (pp.enabled) renderNormals();
    composer.render();
  }

  function dispose() {
    composer.dispose();
    normalTarget.dispose();
    normalMaterial.dispose();
  }

  return { composer, outlinePass, gtaoPass, render, setSize, setPpEnabled, dispose };
}
