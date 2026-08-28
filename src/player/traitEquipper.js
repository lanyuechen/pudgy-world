import * as THREE from 'three';
import {
  FISHING_TRAIT_IDS,
  TRAIT_BY_ID,
  TRAIT_TYPE,
} from '../config/traitsConfig.js';
import {
  loadSavedFishingGearPrefs,
  saveFishingGearPrefs,
} from '../config/fishingGearPersistence.js';
import { CLEARS_FULL_BODY, FULL_BODY_CLEARS } from '../config/fullBodyTraits.js';
import { PLAYER } from '../config/playerConfig.js';
import { loadModelRoot } from '../loaders/loadModel.js';
import { configureAtlasTexture } from '../loaders/modelProfiles.js';
import {
  getModelSourceFormat,
  normalizeTraitMeshForBind,
} from '../loaders/normalizeLoadedModel.js';
import { createToonMaterial } from '../rendering/toonMaterial.js';
import { attachHullOutline } from '../rendering/hullOutline.js';
import { resolveCharacterFacingParent } from '../loaders/sanitizeCharacterClip.js';

const DEFAULT_SKIN_MESHES = new Set(['Body']);
const DEFAULT_FACE_MESHES = new Set(['Eyes111']);

const FISHING_TRAIT_TYPES = new Set([TRAIT_TYPE.Rod, TRAIT_TYPE.Rope, TRAIT_TYPE.Bait]);

const _skinBase = new THREE.Vector3();
const _skinOut = new THREE.Vector3();
const _skinTmp = new THREE.Vector3();
const _skinMat = new THREE.Matrix4();

function collectSkinnedMeshes(root) {
  const meshes = [];
  root.traverse((child) => {
    if (child.isSkinnedMesh) meshes.push(child);
  });
  return meshes;
}

function isFishingTraitType(type) {
  return FISHING_TRAIT_TYPES.has(type);
}

/**
 * Bind cosmetic trait mesh to the player's Body / Eyes111 skeleton.
 * @param {import('./modelProfiles.js').ModelSourceFormat} sourceFormat
 */
function bindCosmeticTraitMesh(mesh, bindReference, sourceFormat, traitGeometryBaked = false) {
  if (!bindReference?.skeleton) {
    throw new Error('[traits] missing bind reference skeleton');
  }
  normalizeTraitMeshForBind(mesh, sourceFormat, { traitGeometryBaked });
  syncTraitMeshTransform(mesh, bindReference);
  mesh.skeleton = bindReference.skeleton;
  mesh.bind(bindReference.skeleton, bindReference.bindMatrix);
}
function syncTraitMeshTransform(mesh, reference) {
  if (!reference) return;
  mesh.position.copy(reference.position);
  mesh.rotation.copy(reference.rotation);
  mesh.scale.copy(reference.scale);
}

function findBoneByName(root, name) {
  let hit = null;
  root.traverse((child) => {
    if (hit || !child.isBone) return;
    if (child.name === name) hit = child;
  });
  return hit;
}

/** Rest-pose skinned world position (matches Three.js LBS before model matrix). */
function skinRestWorldPosition(mesh, vertexIndex, target = new THREE.Vector3()) {
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  const skeleton = mesh.skeleton;
  _skinBase.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.bindMatrix);
  target.set(0, 0, 0);
  for (let j = 0; j < 4; j++) {
    const w = skinWeight.getComponent(vertexIndex, j);
    if (w < 1e-6) continue;
    const bi = skinIndex.getComponent(vertexIndex, j);
    _skinMat.multiplyMatrices(skeleton.bones[bi].matrixWorld, skeleton.boneInverses[bi]);
    _skinTmp.copy(_skinBase).applyMatrix4(_skinMat).multiplyScalar(w);
    target.add(_skinTmp);
  }
  return target.applyMatrix4(mesh.matrixWorld);
}

/**
 * Fishing traits are weighted to FishingRod / FishingBait (under R_Arm_02).
 * Cosmetic Body bind breaks that grip — bake into bone-local space and parent
 * to the player's matching bone (Unity RemapBones equivalent for these props).
 */
function bindFishingTraitMesh(mesh, playerRoot) {
  const srcSkeleton = mesh.skeleton;
  if (!srcSkeleton?.bones?.length) {
    throw new Error('[traits] fishing mesh missing skeleton');
  }

  mesh.updateMatrixWorld(true);
  for (const bone of srcSkeleton.bones) bone.updateWorldMatrix(true, false);

  const weightSum = new Map();
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  for (let i = 0; i < skinIndex.count; i++) {
    for (let j = 0; j < 4; j++) {
      const w = skinWeight.getComponent(i, j);
      if (w < 1e-6) continue;
      const bi = skinIndex.getComponent(i, j);
      weightSum.set(bi, (weightSum.get(bi) || 0) + w);
    }
  }

  const ranked = [...weightSum.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    throw new Error('[traits] fishing mesh has no skin weights');
  }

  // Rod / bait are single-bone; rope blends FishingRod + FishingBait.
  const primaryIdx = ranked[0][0];
  const primarySrcBone = srcSkeleton.bones[primaryIdx];
  const primaryDstBone = findBoneByName(playerRoot, primarySrcBone.name);
  if (!primaryDstBone) {
    throw new Error(`[traits] missing player bone "${primarySrcBone.name}"`);
  }

  const usedBones = ranked
    .filter(([, w]) => w > 1e-3)
    .map(([bi]) => srcSkeleton.bones[bi]);

  mesh.geometry = mesh.geometry.clone();
  const posAttr = mesh.geometry.attributes.position;

  if (usedBones.length <= 1) {
    for (let i = 0; i < posAttr.count; i++) {
      skinRestWorldPosition(mesh, i, _skinOut);
      primarySrcBone.worldToLocal(_skinOut);
      posAttr.setXYZ(i, _skinOut.x, _skinOut.y, _skinOut.z);
    }
    posAttr.needsUpdate = true;
    mesh.geometry.computeVertexNormals();

    // Rigid prop on the hand bone (FishingRod under R_Arm_02).
    const plain = new THREE.Mesh(mesh.geometry, mesh.material);
    plain.name = mesh.name;
    plain.castShadow = mesh.castShadow;
    plain.receiveShadow = mesh.receiveShadow;
    plain.frustumCulled = false;
    plain.visible = mesh.visible;
    primaryDstBone.add(plain);

    mesh.geometry = null;
    mesh.material = null;
    mesh.removeFromParent();
    return plain;
  }

  // Multi-bone (rope): retarget bone-local offsets onto the player's fishing bones.
  const srcBones = usedBones;
  const dstBones = srcBones.map((b) => {
    const dst = findBoneByName(playerRoot, b.name);
    if (!dst) throw new Error(`[traits] missing player bone "${b.name}"`);
    return dst;
  });
  const srcIndexToNew = new Map(srcBones.map((b, i) => [srcSkeleton.bones.indexOf(b), i]));

  const newIndex = new Float32Array(posAttr.count * 4);
  const newWeight = new Float32Array(posAttr.count * 4);

  for (let i = 0; i < posAttr.count; i++) {
    const W = skinRestWorldPosition(mesh, i, _skinOut);
    const ws = dstBones.map(() => 0);
    for (let j = 0; j < 4; j++) {
      const bi = skinIndex.getComponent(i, j);
      const w = skinWeight.getComponent(i, j);
      const ni = srcIndexToNew.get(bi);
      if (ni === undefined) continue;
      ws[ni] += w;
    }

    const Wdst = _skinTmp.set(0, 0, 0);
    for (let k = 0; k < srcBones.length; k++) {
      if (ws[k] < 1e-6) continue;
      const local = srcBones[k].worldToLocal(W.clone());
      Wdst.add(dstBones[k].localToWorld(local).multiplyScalar(ws[k]));
    }

    // Bind-pose positions in primary-bone local space; skeleton lives under that bone.
    primaryDstBone.worldToLocal(Wdst);
    posAttr.setXYZ(i, Wdst.x, Wdst.y, Wdst.z);

    for (let j = 0; j < 4; j++) {
      newIndex[i * 4 + j] = j < ws.length ? j : 0;
      newWeight[i * 4 + j] = j < ws.length ? ws[j] : 0;
    }
  }

  posAttr.needsUpdate = true;
  mesh.geometry.setAttribute('skinIndex', new THREE.Float32BufferAttribute(newIndex, 4));
  mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(newWeight, 4));
  mesh.geometry.computeVertexNormals();

  // Bones keep their scene parents; inverses captured at current (rest) pose.
  const skeleton = new THREE.Skeleton(dstBones);
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  primaryDstBone.add(mesh);
  mesh.bind(skeleton, new THREE.Matrix4());
  return mesh;
}

function prepareTraitMesh(mesh, material) {
  const mat = material.clone();
  mat.skinning = true;
  mesh.material = mat;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
}

async function loadTraitMeshes(url, loadingManager, material) {
  const fbx = await loadModelRoot(url, { loadingManager, role: 'trait' });
  const sourceFormat = getModelSourceFormat(fbx) ?? 'glb';
  const traitGeometryBaked = Boolean(fbx.userData?.pudgyTraitGeometryBaked);

  const meshes = collectSkinnedMeshes(fbx);
  for (const mesh of meshes) prepareTraitMesh(mesh, material);
  return { meshes, sourceFormat, traitGeometryBaked };
}

/**
 * TraitEquipper + PlayerTrait bone remap (cosmetic + fishing).
 */
export async function createTraitEquipper(playerFbx, loadingManager) {
  const textureLoader = new THREE.TextureLoader(loadingManager);

  const traitsMap = await textureLoader.loadAsync(PLAYER.traitsAtlas);
  configureAtlasTexture(traitsMap);

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

  // GLB traits mount under the same FacingRoot as the player skeleton.
  const holder = new THREE.Group();
  holder.name = 'Traits';
  resolveCharacterFacingParent(playerFbx).add(holder);

  /** @type {Map<string, THREE.SkinnedMesh[]>} */
  const cache = new Map();
  /** @type {Map<string, { id: string, meshes: THREE.SkinnedMesh[] }>} */
  const active = new Map();

  const fishingGearPrefs = loadSavedFishingGearPrefs();
  let preferredBaitId = fishingGearPrefs.bait;

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
    const { meshes: loaded, sourceFormat, traitGeometryBaked } = await loadTraitMeshes(
      def.fbx,
      loadingManager,
      baseMaterial,
    );
    /** @type {THREE.Object3D[]} */
    const meshes = [];

    if (isFishingTraitType(def.type)) {
      for (const mesh of loaded) {
        mesh.visible = false;
        const bound = bindFishingTraitMesh(mesh, playerFbx);
        if (bound.material) bound.material.skinning = Boolean(bound.isSkinnedMesh);
        attachHullOutline(bound);
        meshes.push(bound);
      }
    } else {
      const bindReference =
        def.type === TRAIT_TYPE.Face ? faceBindReference : bodyBindReference;
      if (!bindReference) return [];
      for (const mesh of loaded) {
        mesh.visible = false;
        holder.add(mesh);
        bindCosmeticTraitMesh(mesh, bindReference, sourceFormat, traitGeometryBaked);
        attachHullOutline(mesh);
        meshes.push(mesh);
      }
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

  function getPreferredBaitId() {
    return preferredBaitId;
  }

  async function setPreferredBaitId(id) {
    const next = TRAIT_BY_ID.get(id)?.type === TRAIT_TYPE.Bait ? id : FISHING_TRAIT_IDS.bait;
    preferredBaitId = next;
    saveFishingGearPrefs({ bait: preferredBaitId });
    // Swap live bait if fishing gear is currently equipped.
    if (active.has(TRAIT_TYPE.Bait)) {
      await equipTrait(preferredBaitId);
    }
  }

  async function equipFishingSet() {
    await equipTrait(FISHING_TRAIT_IDS.rod);
    await equipTrait(FISHING_TRAIT_IDS.rope);
    await equipTrait(preferredBaitId || FISHING_TRAIT_IDS.bait);
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
    getPreferredBaitId,
    setPreferredBaitId,
    getActiveId,
    dispose,
  };
}
