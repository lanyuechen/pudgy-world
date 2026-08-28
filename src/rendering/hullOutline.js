import * as THREE from 'three';
import { OUTLINE } from './outlineConfig.js';

const { hull } = OUTLINE;

/** Shared across all hull materials — updated once per frame / resize. */
const hullShared = {
  viewport: { value: new THREE.Vector2(1, 1) },
};

export function updateHullOutlineViewport(width, height, pixelRatio = 1) {
  hullShared.viewport.value.set(
    Math.max(1, Math.floor(width * pixelRatio)),
    Math.max(1, Math.floor(height * pixelRatio)),
  );
}

/**
 * Screen-space inverted hull + silhouette discard.
 *
 * World-space extrusion builds a separate shell; close-up gaps show floating
 * back-faces (“面浮起来”). Instead:
 *   1. Extrude in clip space → constant pixel width (brush-like stroke).
 *   2. Fragment discard when |viewNormal.z| is high → silhouette only, not
 *      interior shells visible through mesh seams.
 */
const hullVertex = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>

  uniform vec2 viewport;
  uniform float pixelWidth;
  uniform float distanceScale;

  flat varying float vHalfDist;
  varying vec3 vViewNormal;

  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>

    #include <begin_vertex>
    #include <skinning_vertex>

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vec3 viewNormal = normalize(normalMatrix * objectNormal);
    vViewNormal = viewNormal;

    vec3 objectPivot = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vHalfDist = length(objectPivot - cameraPosition) * distanceScale;

    vec4 clipPos = projectionMatrix * mvPosition;

    // Constant-width screen extrude (NDC pixels, perspective-correct via clipPos.w)
    vec4 clipNormal = projectionMatrix * vec4(viewNormal, 0.0);
    vec2 offset = clipNormal.xy;
    float len = length(offset);
    if (len > 1e-5) {
      offset = offset / len * pixelWidth * 2.0 * clipPos.w / viewport.y;
    }
    clipPos.xy += offset;

    gl_Position = clipPos;
  }
`;

const hullFragment = /* glsl */ `
  uniform vec3 outlineColor;
  uniform float fadeDistanceM;
  uniform float silhouetteCutoff;
  flat varying float vHalfDist;
  varying vec3 vViewNormal;

  void main() {
    if (vHalfDist >= fadeDistanceM) discard;

    // Silhouette only — drop front-facing hull fragments (gap bleed / inner shell)
    if (abs(normalize(vViewNormal).z) > silhouetteCutoff) discard;

    gl_FragColor = vec4(outlineColor, 1.0);
  }
`;

export function createHullOutlineMaterial({ skinning = false } = {}) {
  const mat = new THREE.ShaderMaterial({
    name: 'ScreenSpaceHullOutline',
    uniforms: {
      viewport: hullShared.viewport,
      pixelWidth: { value: hull.pixelWidth },
      fadeDistanceM: { value: hull.fadeDistanceM },
      distanceScale: { value: hull.distanceScale },
      silhouetteCutoff: { value: hull.silhouetteCutoff },
      outlineColor: { value: hull.color.clone() },
    },
    vertexShader: hullVertex,
    fragmentShader: hullFragment,
    side: THREE.BackSide,
    transparent: false,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    lights: false,
    fog: false,
    toneMapped: false,
  });
  if (skinning) mat.skinning = true;
  mat.userData.isHullOutline = true;
  return mat;
}

/**
 * Remove runtime hull children (e.g. after switching skinned meshes to rim outline).
 */
export function stripHullOutline(mesh) {
  if (!mesh?.isMesh) return mesh;
  for (let i = mesh.children.length - 1; i >= 0; i--) {
    const child = mesh.children[i];
    if (child.userData?.isHullOutlineMesh) {
      mesh.remove(child);
      child.material?.dispose();
    }
  }
  delete mesh.userData.hasHullOutline;
  return mesh;
}

/**
 * Inverted-hull child mesh — static props only (skinned uses rim + PP).
 */
export function attachHullOutline(mesh) {
  if (!hull.enabled) return mesh;
  if (!mesh?.isMesh) return mesh;
  if (mesh.isSkinnedMesh && !hull.skinnedEnabled) return mesh;
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
  outline.renderOrder = (mesh.renderOrder || 0) + 1;
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
