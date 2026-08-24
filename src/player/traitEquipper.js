import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import {
  FISHING_TRAIT_IDS,
  TRAIT_BY_ID,
  TRAIT_TYPE,
} from '../config/traitsConfig.js';
import { CLEARS_FULL_BODY, FULL_BODY_CLEARS } from '../config/fullBodyTraits.js';
import { PLAYER } from '../config/playerConfig.js';
import { normalizeFbxToMeters } from '../config/units.js';
import { createToonMaterial } from '../rendering/toonMaterial.js';
import { attachHullOutline } from '../rendering/hullOutline.js';

const DEFAULT_SKIN_MESHES = new Set(['Body']);
const DEFAULT_FACE_MESHES = new Set(['Eyes111']);
function collectSkinnedMeshes(root) {
  const meshes = [];
  root.traverse((child) => {
    if (child.isSkinnedMesh) meshes.push(child);
  });
  return meshes;
}

/** Trait FBXs export Y-up geometry; player Body mesh local space is -90° X + 180° Y. */
function orientTraitGeometry(mesh) {
  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.rotateX(-Math.PI / 2);
  mesh.geometry.rotateY(Math.PI);
}

function syncTraitMeshTransform(mesh, reference) {
  if (!reference) return;
  mesh.position.copy(reference.position);
  mesh.rotation.copy(reference.rotation);
  mesh.scale.copy(reference.scale);
}

/** Bind trait mesh to the player's existing SkinnedMesh skeleton (Body / Eyes111). */
function bindTraitMesh(mesh, bindReference) {
  if (!bindReference?.skeleton) {
    throw new Error('[traits] missing bind reference skeleton');
  }
  orientTraitGeometry(mesh);
  syncTraitMeshTransform(mesh, bindReference);
  mesh.skeleton = bindReference.skeleton;
  mesh.bind(bindReference.skeleton, bindReference.bindMatrix);
}

function prepareTraitMesh(mesh, material) {
  const mat = material.clone();
  mat.skinning = true;
  mesh.material = mat;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  attachHullOutline(mesh);

  const geo = mesh.geometry;
  if (geo && !geo.attributes.uv && geo.attributes.uv1) {
    geo.setAttribute('uv', geo.attributes.uv1);
  }
}

async function loadTraitMeshes(url, fbxLoader, material) {
  const fbx = await fbxLoader.loadAsync(url);
  normalizeFbxToMeters(fbx, { fileUnit: 'm' });

  const meshes = collectSkinnedMeshes(fbx);
  for (const mesh of meshes) prepareTraitMesh(mesh, material);
  return meshes;
}

/**
 * TraitEquipper + PlayerTrait bone remap (cosmetic + fishing).
 */
export async function createTraitEquipper(playerFbx, loadingManager) {
  const textureLoader = new THREE.TextureLoader(loadingManager);
  const fbxLoader = new FBXLoader(loadingManager);

  const traitsMap = await textureLoader.loadAsync(PLAYER.traitsAtlas);
  traitsMap.colorSpace = THREE.SRGBColorSpace;
  traitsMap.flipY = true;
  traitsMap.anisotropy = 8;

  const baseMaterial = createToonMaterial({
    map: traitsMap,
    color: 0xffffff,
    skinning: true,
  });

  const defaultSkinMeshes = [];
  const defaultFaceMeshes = [];
  playerFbx.traverse((child) => {
    if (!child.isSkinnedMesh) return;
    if (DEFAULT_SKIN_MESHES.has(child.name)) defaultSkinMeshes.push(child);
    if (DEFAULT_FACE_MESHES.has(child.name)) defaultFaceMeshes.push(child);
  });
  const bodyBindReference = defaultSkinMeshes.find((m) => m.name === 'Body') ?? null;
  const faceBindReference =
    defaultFaceMeshes.find((m) => m.name === 'Eyes111') ?? bodyBindReference;

  if (!bodyBindReference) {
    console.warn('[traits] player Body mesh not found — traits may not render');
  }

  const holder = new THREE.Group();
  holder.name = 'Traits';
  playerFbx.add(holder);

  /** @type {Map<string, THREE.SkinnedMesh[]>} */
  const cache = new Map();
  /** @type {Map<string, { id: string, meshes: THREE.SkinnedMesh[] }>} */
  const active = new Map();

  function setDefaultSkinVisible(visible) {
    for (const mesh of defaultSkinMeshes) mesh.visible = visible;
  }

  function setDefaultFaceVisible(visible) {
    for (const mesh of defaultFaceMeshes) mesh.visible = visible;
  }

  function hideTraitType(type) {
    const entry = active.get(type);
    if (!entry) return;
    for (const mesh of entry.meshes) mesh.visible = false;
    active.delete(type);
  }

  function applyDefaultVisibility(type) {
    if (type === TRAIT_TYPE.Skin && !active.has(TRAIT_TYPE.Skin)) {
      setDefaultSkinVisible(true);
    }
    if (type === TRAIT_TYPE.Face && !active.has(TRAIT_TYPE.Face)) {
      setDefaultFaceVisible(true);
    }
  }

  /** Unity TraitEquipper conflict rules for FullBody ↔ Head/Body. */
  function applyConflictRules(type) {
    if (CLEARS_FULL_BODY.includes(type)) {
      removeTraitOfType(TRAIT_TYPE.FullBody);
    }
    if (type === TRAIT_TYPE.FullBody) {
      for (const slot of FULL_BODY_CLEARS) removeTraitOfType(slot);
    }
  }

  async function ensureLoaded(id) {
    if (cache.has(id)) return cache.get(id);
    const def = TRAIT_BY_ID.get(id);
    if (!def) {
      console.warn('[traits] unknown trait id', id);
      return [];
    }
    const meshes = await loadTraitMeshes(def.fbx, fbxLoader, baseMaterial);
    const bindReference =
      def.type === TRAIT_TYPE.Face ? faceBindReference : bodyBindReference;
    if (!bindReference) return [];
    for (const mesh of meshes) {
      mesh.visible = false;
      holder.add(mesh);
      bindTraitMesh(mesh, bindReference);
    }
    cache.set(id, meshes);
    return meshes;
  }

  async function equipTrait(id) {
    const def = TRAIT_BY_ID.get(id);
    if (!def) return false;

    applyConflictRules(def.type);
    hideTraitType(def.type);

    const meshes = await ensureLoaded(id);
    if (!meshes.length) return false;

    for (const mesh of meshes) mesh.visible = true;
    active.set(def.type, { id, meshes });

    if (def.type === TRAIT_TYPE.Skin) setDefaultSkinVisible(false);
    if (def.type === TRAIT_TYPE.Face) setDefaultFaceVisible(false);
    return true;
  }

  function removeTraitOfType(type) {
    hideTraitType(type);
    applyDefaultVisibility(type);
  }

  function getActiveId(type) {
    return active.get(type)?.id ?? null;
  }

  async function equipFishingSet() {
    await equipTrait(FISHING_TRAIT_IDS.rod);
    await equipTrait(FISHING_TRAIT_IDS.rope);
    await equipTrait(FISHING_TRAIT_IDS.bait);
  }

  function unequipFishingSet() {
    removeTraitOfType(TRAIT_TYPE.Rod);
    removeTraitOfType(TRAIT_TYPE.Rope);
    removeTraitOfType(TRAIT_TYPE.Bait);
  }

  function dispose() {
    for (const type of [...active.keys()]) removeTraitOfType(type);
    holder.removeFromParent();
    for (const meshes of cache.values()) {
      for (const mesh of meshes) {
        mesh.geometry?.dispose();
        mesh.material?.dispose();
      }
    }
    cache.clear();
  }

  return {
    equipTrait,
    removeTraitOfType,
    equipFishingSet,
    unequipFishingSet,
    getActiveId,
    dispose,
  };
}
