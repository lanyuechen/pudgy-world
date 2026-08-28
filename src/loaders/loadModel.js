import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { assetUrl } from '../config/assetUrl.js';
import {
  MODEL_PROFILE,
  profileFromAssetPath,
  toFbxUrl,
  toGlbUrl,
} from './modelProfiles.js';
import { normalizeLoadedModel } from './normalizeLoadedModel.js';

/** @typedef {import('./modelProfiles.js').ModelProfile} ModelProfile */
/** @typedef {import('./modelProfiles.js').ModelRole} ModelRole */

/**
 * @typedef {{
 *   profile?: ModelProfile,
 *   loadingManager?: import('three').LoadingManager,
 *   role?: ModelRole,
 *   snapFeet?: boolean,
 *   format?: 'auto' | 'glb' | 'fbx',
 * }} LoadModelOptions
 */

/**
 * GLTFLoader with meshopt support.
 * @param {import('three').LoadingManager} [loadingManager]
 */
export function createModelLoader(loadingManager) {
  const loader = new GLTFLoader(loadingManager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

/**
 * Load + normalize a model. Returns scene root with `.animations` (FBXLoader-compatible).
 *
 * @param {string} url Config or absolute path (.fbx rewritten to .glb via assetUrl unless format=fbx)
 * @param {LoadModelOptions | import('three').LoadingManager} [optionsOrManager]
 * @returns {Promise<THREE.Object3D & { animations: import('three').AnimationClip[] }>}
 */
export async function loadModelRoot(url, optionsOrManager) {
  /** @type {LoadModelOptions} */
  const options =
    optionsOrManager && typeof optionsOrManager === 'object' && 'setURLModifier' in optionsOrManager
      ? { loadingManager: optionsOrManager }
      : (optionsOrManager ?? {});

  const loadingManager = options.loadingManager;
  const profile = options.profile ?? profileFromAssetPath(url);
  const role = options.role ?? 'model';
  const format = options.format ?? 'auto';

  const resolvedUrl = /^https?:\/\//i.test(url) || url.startsWith('/assets/')
    ? assetUrl(url)
    : url;
  const glbUrl = toGlbUrl(resolvedUrl);
  const fbxUrl = toFbxUrl(resolvedUrl);

  /** @type {import('./modelProfiles.js').ModelSourceFormat} */
  let sourceFormat = 'glb';
  /** @type {THREE.Object3D & { animations?: THREE.AnimationClip[] }} */
  let root;

  const loadGlb = async () => {
    const loader = createModelLoader(loadingManager);
    const gltf = await loader.loadAsync(glbUrl);
    root = gltf.scene;
    root.animations = gltf.animations ?? [];
    if (gltf.asset?.extras && typeof gltf.asset.extras === 'object') {
      Object.assign(root.userData, gltf.asset.extras);
    }
    sourceFormat = 'glb';
  };

  const loadFbx = async () => {
    const fbxLoader = new FBXLoader(loadingManager);
    root = await fbxLoader.loadAsync(fbxUrl);
    root.animations = root.animations ?? [];
    sourceFormat = 'fbx';
  };

  if (format === 'fbx') {
    await loadFbx();
  } else if (format === 'glb') {
    await loadGlb();
  } else {
    try {
      await loadGlb();
    } catch (glbErr) {
      try {
        await loadFbx();
        console.warn(
          `[loadModel] GLB missing/failed, using FBX normalize path: ${fbxUrl}`,
          glbErr?.message || glbErr,
        );
      } catch (fbxErr) {
        throw glbErr;
      }
    }
  }

  normalizeLoadedModel(root, {
    profile,
    sourceFormat,
    role,
    snapFeet: options.snapFeet ?? (profile === MODEL_PROFILE.CHARACTER && role === 'model'),
    url: resolvedUrl,
  });

  if (!root.animations) root.animations = [];
  return root;
}
