/**
 * Convert-time GLB baking (see docs/MODEL_SPEC.md).
 * Used by scripts/convertFbxToGlb.mjs — runtime GLB loads must not re-apply mesh-node rotation patches.
 *
 * Character +Z facing: FacingRoot(Y=180°) wrapping RootNode(identity).
 */

import {
  CHARACTER_ROOT_FORWARD_QUAT,
  FACING_ROOT_NODE_NAME,
  STATIC_CHARACTER_NODE_NAMES,
} from './sanitizeCharacterClip.js';

/** Trait mesh → player Body bind space (rotateX(-90°) then rotateY(180°)). */
const TRAIT_GEOMETRY_MATRIX = [
  -1, 0, 0, 0,
  0, 0, 1, 0,
  0, 1, 0, 0,
  0, 0, 0, 1,
];

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number[]} m 4×4 column-major
 */
function transformPoint(x, y, z, m) {
  return [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
  ];
}

/**
 * @param {import('@gltf-transform/core').Primitive} prim
 * @param {number[]} matrix
 */
function transformPrimitiveAttributes(prim, matrix) {
  const pos = prim.getAttribute('POSITION');
  if (!pos) return;
  const src = pos.getArray();
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const [nx, ny, nz] = transformPoint(src[i], src[i + 1], src[i + 2], matrix);
    out[i] = nx;
    out[i + 1] = ny;
    out[i + 2] = nz;
  }
  pos.setArray(out);

  const norm = prim.getAttribute('NORMAL');
  if (!norm) return;
  const ns = norm.getArray();
  const no = new Float32Array(ns.length);
  for (let i = 0; i < ns.length; i += 3) {
    const [nx, ny, nz] = transformPoint(ns[i], ns[i + 1], ns[i + 2], matrix);
    no[i] = nx;
    no[i + 1] = ny;
    no[i + 2] = nz;
  }
  norm.setArray(no);
}

/**
 * Bake trait/fishing mesh geometry to player Body bind space.
 * @param {import('@gltf-transform/core').Document} doc
 */
export function bakeTraitGeometry(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      transformPrimitiveAttributes(prim, TRAIT_GEOMETRY_MATRIX);
    }
  }
  const asset = doc.getRoot().getAsset();
  asset.extras = { ...(asset.extras || {}), pudgyTraitGeometryBaked: true };
  return doc;
}

/**
 * FBX-equivalent facing: outer FacingRoot(Y=180°), inner RootNode identity.
 * Preserves assimp Body -90°X / Armature layout; never injects extra mesh-node rotation.
 * @param {import('@gltf-transform/core').Document} doc
 */
export function bakeCharacterFacing(doc) {
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  if (!scene) return doc;

  for (const child of [...scene.listChildren()]) {
    if (child.getName() === FACING_ROOT_NODE_NAME) continue;

    const facing = doc.createNode(FACING_ROOT_NODE_NAME).setRotation(CHARACTER_ROOT_FORWARD_QUAT);
    child.setRotation([0, 0, 0, 1]);
    facing.addChild(child);
    scene.addChild(facing);
  }

  return doc;
}

/**
 * Remove bind-pose maintenance tracks from all animations in the document.
 * @param {import('@gltf-transform/core').Document} doc
 */
export function sanitizeCharacterAnimations(doc) {
  for (const anim of doc.getRoot().listAnimations()) {
    for (const channel of [...anim.listChannels()]) {
      const nodeName = channel.getTargetNode()?.getName() || '';
      const path = channel.getTargetPath();
      if (path === 'weights') continue;
      if (path === 'translation' || path === 'scale') {
        channel.dispose();
        continue;
      }
      if (path === 'rotation' && STATIC_CHARACTER_NODE_NAMES.has(nodeName)) {
        channel.dispose();
      }
    }
  }
  return doc;
}

/** @param {string} rel models-relative path (forward slashes) */
export function isTraitLikePath(rel) {
  const relNorm = String(rel).replace(/\\/g, '/');
  return /\/traits\//.test(relNorm) || /\/fishing\//.test(relNorm);
}

/**
 * Character GLB bake (traits: geometry only; player/npc: facing + clip sanitize).
 * @param {import('@gltf-transform/core').Document} doc
 * @param {string} rel models-relative path (forward slashes)
 */
export function bakeCharacterGltfDocument(doc, rel) {
  if (isTraitLikePath(rel)) {
    bakeTraitGeometry(doc);
    return doc;
  }

  bakeCharacterFacing(doc);
  sanitizeCharacterAnimations(doc);
  return doc;
}

const CM_TO_M = 0.01;

/**
 * Max axis extent from mesh POSITION accessors (unscaled local space).
 * @param {import('@gltf-transform/core').Document} doc
 */
export function getDocumentMaxDimension(doc) {
  let max = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i];
        const y = arr[i + 1];
        const z = arr[i + 2];
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      }
      max = Math.max(max, maxX - minX, maxY - minY, maxZ - minZ);
    }
  }
  return max;
}

/**
 * Bake cm-authored environment/prop FBX into meters (matches runtime normalizeFbxToMeters).
 * Applies 0.01 uniform scale on each scene root child — same as `root.scale *= 0.01`.
 * @param {import('@gltf-transform/core').Document} doc
 */
export function bakeUnitsToMetersDocument(doc) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  if (!scene) return doc;

  for (const child of scene.listChildren()) {
    const scale = child.getScale();
    child.setScale([scale[0] * CM_TO_M, scale[1] * CM_TO_M, scale[2] * CM_TO_M]);
  }

  const asset = root.getAsset();
  asset.extras = {
    ...(asset.extras || {}),
    pudgyUnitsBaked: true,
    pudgyUnits: 'm',
  };
  return doc;
}

/** Environment tiles are Cinema4D cm — always bake at convert. */
export function bakeEnvironmentGltfDocument(doc) {
  return bakeUnitsToMetersDocument(doc);
}

/**
 * Prop fish/levels: bake when bbox suggests cm (same heuristic as inferFbxFileUnit).
 * @param {import('@gltf-transform/core').Document} doc
 */
export function bakePropGltfDocument(doc) {
  if (getDocumentMaxDimension(doc) > 20) {
    bakeUnitsToMetersDocument(doc);
  } else {
    const asset = doc.getRoot().getAsset();
    asset.extras = { ...(asset.extras || {}), pudgyUnits: 'm' };
  }
  return doc;
}
