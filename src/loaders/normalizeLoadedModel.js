import * as THREE from 'three';
import { inferFbxFileUnit, normalizeFbxToMeters, UNITS } from '../config/units.js';
import { MODEL_PROFILE, MODEL_SPEC_VERSION } from './modelProfiles.js';
import { ensureGlbCharacterRootFacing } from './sanitizeCharacterClip.js';

/** @typedef {import('./modelProfiles.js').ModelProfile} ModelProfile */
/** @typedef {import('./modelProfiles.js').ModelSourceFormat} ModelSourceFormat */
/** @typedef {import('./modelProfiles.js').ModelRole} ModelRole */

/**
 * @typedef {{
 *   profile: ModelProfile,
 *   sourceFormat: ModelSourceFormat,
 *   role?: ModelRole,
 *   snapFeet?: boolean,
 *   url?: string,
 * }} NormalizeOptions
 */

function fixMeshUvAttributes(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const geo = child.geometry;
    if (geo && !geo.attributes.uv && geo.attributes.uv1) {
      geo.setAttribute('uv', geo.attributes.uv1);
    }
  });
}

/** Cinema4D / assimp export faces -Z; project spec is +Z forward. */
function applyCharacterFacing(root) {
  if (Math.abs(root.rotation.y - Math.PI) > 1e-3) {
    root.rotation.y += Math.PI;
  }
}

function snapFeetToGround(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (!box.isEmpty()) {
    root.position.y -= box.min.y;
  }
}

function scaleEnvironmentCmToM(root) {
  if (root.userData.units === 'm') return;
  root.scale.multiplyScalar(UNITS.cmToM);
  root.userData.units = 'm';
  root.userData.fbxFileUnit = 'cm';
}

/**
 * Align cosmetic trait mesh-local space to player Body bind space (FBX / unbaked GLB fallback).
 * @param {THREE.SkinnedMesh} mesh
 * @param {ModelSourceFormat} sourceFormat
 * @param {{ traitGeometryBaked?: boolean }} [options]
 */
export function normalizeTraitMeshForBind(mesh, sourceFormat, { traitGeometryBaked = false } = {}) {
  if (sourceFormat === 'glb' && traitGeometryBaked) return mesh;

  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.rotateX(-Math.PI / 2);
  mesh.geometry.rotateY(Math.PI);
  return mesh;
}

function normalizeCharacter(root, sourceFormat, { snapFeet, role }) {
  if (sourceFormat === 'fbx') {
    const fileUnit = inferFbxFileUnit(root);
    normalizeFbxToMeters(root, { fileUnit });
    // Dev fallback: FBX is not pre-baked; match convert-time +Z facing.
    if (role !== 'trait') applyCharacterFacing(root);
  } else {
    normalizeFbxToMeters(root, { fileUnit: 'm' });
    if (role !== 'trait') ensureGlbCharacterRootFacing(root);
  }

  if (role !== 'trait' && snapFeet) {
    snapFeetToGround(root);
  }
}

function isUnitsBaked(root) {
  return Boolean(root.userData?.pudgyUnitsBaked) || root.userData?.units === 'm';
}

function normalizeEnvironment(root, sourceFormat) {
  if (sourceFormat === 'glb' && isUnitsBaked(root)) {
    root.userData.units = 'm';
    return;
  }

  if (sourceFormat === 'fbx') {
    normalizeFbxToMeters(root, { fileUnit: 'cm' });
  } else if (!isUnitsBaked(root)) {
    scaleEnvironmentCmToM(root);
  }
}

function normalizeProp(root, sourceFormat) {
  if (sourceFormat === 'glb' && isUnitsBaked(root)) {
    root.userData.units = 'm';
    return;
  }

  if (sourceFormat === 'fbx') {
    normalizeFbxToMeters(root, { fileUnit: 'cm' });
  } else {
    const fileUnit = inferFbxFileUnit(root);
    normalizeFbxToMeters(root, { fileUnit });
  }
}

/**
 * Bring a loaded GLB/FBX root to project MODEL_SPEC (idempotent).
 * @param {THREE.Object3D & { animations?: THREE.AnimationClip[] }} root
 * @param {NormalizeOptions} options
 */
export function normalizeLoadedModel(root, options) {
  if (!root || root.userData?.modelNormalized === MODEL_SPEC_VERSION) {
    return root;
  }

  const {
    profile,
    sourceFormat,
    role = 'model',
    snapFeet = false,
    url,
  } = options;

  fixMeshUvAttributes(root);

  switch (profile) {
    case MODEL_PROFILE.CHARACTER:
      normalizeCharacter(root, sourceFormat, { snapFeet, role });
      break;
    case MODEL_PROFILE.ENVIRONMENT:
      normalizeEnvironment(root, sourceFormat);
      break;
    case MODEL_PROFILE.PROP:
    case MODEL_PROFILE.CLIP:
      normalizeProp(root, sourceFormat);
      break;
    default:
      normalizeProp(root, sourceFormat);
  }

  root.userData.modelProfile = profile;
  root.userData.modelSourceFormat = sourceFormat;
  root.userData.modelRole = role;
  root.userData.modelNormalized = MODEL_SPEC_VERSION;
  if (url) root.userData.modelUrl = url;

  return root;
}

/** Read source format stamped by loadModelRoot (for trait bind). */
export function getModelSourceFormat(root) {
  return /** @type {ModelSourceFormat | undefined} */ (root.userData?.modelSourceFormat);
}
