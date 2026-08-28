import * as THREE from 'three';

/**
 * Live values from ToonS_TheBerg_ColorAtlas / ToonS_Traits_ColorAtlas
 * (ToonShderGraph: Unlit + MainLightDirection only).
 *
 * Character outline is handled by post-process (outlineComposer) — not in this shader.
 * N·V "rim" blackens entire tilted faces (e.g. hat brims); do not re-add without
 * screen-space edge detection only.
 */
export const TOON = {
  shades: 0.49,
  minShade: 0.3,
  maxShade: 1.0,
};

const vertexShader = /* glsl */ `
  #include <common>
  #include <uv_pars_vertex>
  #include <skinning_pars_vertex>

  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    vUv = uv;

    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    vec3 transformedNormal = objectNormal;
    #ifdef USE_INSTANCING
      mat3 im = mat3(instanceMatrix);
      transformedNormal /= vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
      transformedNormal = im * transformedNormal;
    #endif
    vWorldNormal = normalize((modelMatrix * vec4(transformedNormal, 0.0)).xyz);

    #include <begin_vertex>
    #include <skinning_vertex>

    #include <project_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 color;
  uniform vec3 lightDirection;
  uniform float shades;
  uniform float minShade;
  uniform float maxShade;
  uniform float opacity;
  uniform float alphaTest;

  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    vec4 tex = texture2D(map, vUv);
    if (tex.a < alphaTest) discard;

    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(lightDirection);
    float ndotl = dot(N, L);
    float r1 = (1.0 - ndotl) * 0.5;
    float q = floor(r1 / max(shades, 1e-4));
    float shade = maxShade - shades * q * (maxShade - minShade);
    shade = clamp(shade, minShade, maxShade);

    gl_FragColor = vec4(tex.rgb * color * shade, tex.a * opacity);
  }
`;

/**
 * Unity ToonS_* material. Update lightDirection each frame via syncToonLightDirection.
 */
export function createToonMaterial({
  map = null,
  color = 0xffffff,
  transparent = false,
  alphaTest = 0,
  side = THREE.FrontSide,
  depthWrite = true,
  skinning = false,
} = {}) {
  if (!map) {
    map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    map.needsUpdate = true;
  }

  const mat = new THREE.ShaderMaterial({
    name: 'ToonS_Unity',
    uniforms: {
      map: { value: map },
      color: { value: new THREE.Color(color) },
      lightDirection: { value: new THREE.Vector3(0.4, 0.85, 0.35).normalize() },
      shades: { value: TOON.shades },
      minShade: { value: TOON.minShade },
      maxShade: { value: TOON.maxShade },
      opacity: { value: 1 },
      alphaTest: { value: alphaTest },
    },
    vertexShader,
    fragmentShader,
    transparent,
    side,
    depthWrite,
    lights: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  if (skinning) mat.skinning = true;
  mat.userData.isUnityToon = true;
  return mat;
}

const _toLight = new THREE.Vector3();

/** Main light direction = toward the sun (URP MainLightDirection). */
export function syncToonLightDirection(root, directionalLight) {
  if (!directionalLight) return;
  _toLight.subVectors(directionalLight.position, directionalLight.target.position).normalize();
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (m?.userData?.isUnityToon && m.uniforms?.lightDirection) {
        m.uniforms.lightDirection.value.copy(_toLight);
      }
    }
  });
}
