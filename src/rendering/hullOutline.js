import * as THREE from 'three';
import { OUTLINE } from './outlineConfig.js';

const { hull } = OUTLINE;

/**
 * Unity Outline Test.shadergraph / Shader Graphs_OutlineShader.mat
 *
 * Unity:
 *   dist     = distance(Object.Position, Camera.Position)
 *   extrude  = (_Outline_Thickness / Object.Scale) * (dist / 2)
 *   pos     += NormalWS * extrude
 *
 * JS adjustment (same coefficients, better distance sample):
 *   Extrude uses per-vertex view depth instead of the object pivot.
 *   Pivot distance over-extrudes when the transform origin is far from the
 *   visible surface (common on plaza FBX pieces) — looks like a thick shell.
 *   Fade still uses flat pivot distance (Unity Object.Position).
 *
 *   Object.Scale forced to 1 (Unity FBX bake). World-space extrude in meters.
 */
const hullVertex = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>

  uniform float thicknessM;
  uniform float objectScale;
  uniform float distanceScale;

  flat varying float vHalfDist;

  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>

    #include <begin_vertex>
    #include <skinning_vertex>

    vec3 worldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);

    // Fade: Unity Object.Position → Camera (constant per draw)
    vec3 objectPivot = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vHalfDist = length(objectPivot - cameraPosition) * distanceScale;

    // Extrude: same (thickness/Scale)*(dist/2), but dist = this vertex’s view depth
    // so near surfaces don’t inherit a far pivot’s huge extrusion.
    float viewDist = length((viewMatrix * worldPos).xyz);
    float extrude = (thicknessM / max(objectScale, 1e-6)) * (viewDist * distanceScale);
    worldPos.xyz += worldNormal * extrude;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const hullFragment = /* glsl */ `
  uniform vec3 outlineColor;
  uniform float fadeDistanceM;
  flat varying float vHalfDist;

  void main() {
    if (vHalfDist >= fadeDistanceM) discard;
    gl_FragColor = vec4(outlineColor, 1.0);
  }
`;

export function createHullOutlineMaterial({ skinning = false } = {}) {
  const mat = new THREE.ShaderMaterial({
    name: 'UnityHullOutline',
    uniforms: {
      thicknessM: { value: hull.thicknessM },
      fadeDistanceM: { value: hull.fadeDistanceM },
      distanceScale: { value: hull.distanceScale },
      objectScale: { value: 1 },
      outlineColor: { value: hull.color.clone() },
    },
    vertexShader: hullVertex,
    fragmentShader: hullFragment,
    side: THREE.BackSide,
    transparent: false,
    depthWrite: false,
    depthTest: true,
    lights: false,
    fog: false,
    toneMapped: false,
  });
  if (skinning) mat.skinning = true;
  mat.userData.isHullOutline = true;
  return mat;
}

/**
 * Unity plaza material slot [1]: inverted-hull child mesh.
 */
export function attachHullOutline(mesh) {
  if (!hull.enabled) return mesh;
  if (!mesh?.isMesh) return mesh;
  if (mesh.userData.isHullOutlineMesh || mesh.userData.hasHullOutline) return mesh;
  mesh.userData.hasHullOutline = true;

  const skinned = mesh.isSkinnedMesh;
  const mat = createHullOutlineMaterial({ skinning: skinned });
  const outline = skinned
    ? new THREE.SkinnedMesh(mesh.geometry, mat)
    : new THREE.Mesh(mesh.geometry, mat);

  outline.name = `${mesh.name || 'Mesh'}_Outline`;
  outline.frustumCulled = false;
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.renderOrder = mesh.renderOrder || 0;
  outline.userData.skipOutline = true;
  outline.userData.isHullOutlineMesh = true;
  outline.userData.hasHullOutline = true;

  if (skinned && mesh.skeleton) {
    outline.bind(mesh.skeleton, mesh.bindMatrix);
    outline.bindMode = mesh.bindMode;
  }

  mesh.add(outline);
  return mesh;
}
