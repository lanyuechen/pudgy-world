import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { PLAYER } from '../config/playerConfig.js';
import { NPC_ANIMS, NPC_MODELS } from '../config/npcConfig.js';
import { normalizeFbxToMeters, inferFbxFileUnit } from '../config/units.js';
import { createToonMaterial } from '../rendering/toonMaterial.js';
import { attachHullOutline } from '../rendering/hullOutline.js';

/** Cached raw clips per URL (cloned + sanitized per mixer). */
const clipSourceCache = new Map();

/**
 * Retarget-safe clip cleanup:
 * - drop broken quaternion tracks (e.g. values:[0] from some C4D exports)
 * - keep quaternion only (absolute position/scale from another bind pose collapses skin)
 */
function sanitizeNpcClip(clip) {
  const tracks = [];
  for (const track of clip.tracks) {
    if (track.name.endsWith('.position') || track.name.endsWith('.scale')) continue;
    if (track.name.endsWith('.quaternion')) {
      const v = track.values;
      if (!v?.length || v.length % 4 !== 0) continue;
      let valid = true;
      for (let i = 0; i < v.length; i += 4) {
        const len = Math.hypot(v[i], v[i + 1], v[i + 2], v[i + 3]);
        if (len < 1e-4) {
          valid = false;
          break;
        }
        // Normalize in place on the clone's values
        const inv = 1 / len;
        v[i] *= inv;
        v[i + 1] *= inv;
        v[i + 2] *= inv;
        v[i + 3] *= inv;
      }
      if (!valid) continue;
    }
    tracks.push(track);
  }
  const cleaned = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  cleaned.optimized = false;
  return cleaned;
}

/**
 * Load AnimationClips from an anim FBX (mesh discarded after extract).
 * @returns {Promise<THREE.AnimationClip[]>}
 */
export async function loadNpcClips(url, loadingManager) {
  if (clipSourceCache.has(url)) {
    return clipSourceCache.get(url).map((c) => sanitizeNpcClip(c.clone()));
  }

  const fbxLoader = new FBXLoader(loadingManager);
  const fbx = await fbxLoader.loadAsync(url);
  const clips = (fbx.animations ?? []).map((clip) => {
    const c = clip.clone();
    if (!c.name || c.name === 'CINEMA_4D_Main') {
      c.name = url.split('/').pop()?.replace(/\.fbx$/i, '') || 'clip';
    }
    return c;
  });
  clipSourceCache.set(url, clips);
  return clips.map((c) => sanitizeNpcClip(c.clone()));
}

/**
 * Load a skinned NPC model with Traits atlas toon materials.
 */
export async function loadNpcModel(modelKey, loadingManager) {
  const url = NPC_MODELS[modelKey];
  if (!url) throw new Error(`Unknown NPC model: ${modelKey}`);

  const textureLoader = new THREE.TextureLoader(loadingManager);
  const fbxLoader = new FBXLoader(loadingManager);
  const [traitsMap, fbx] = await Promise.all([
    textureLoader.loadAsync(PLAYER.traitsAtlas),
    fbxLoader.loadAsync(url),
  ]);

  traitsMap.colorSpace = THREE.SRGBColorSpace;
  traitsMap.flipY = true;
  traitsMap.anisotropy = 8;

  const fileUnit = inferFbxFileUnit(fbx);
  normalizeFbxToMeters(fbx, { fileUnit });

  const base = createToonMaterial({
    map: traitsMap,
    color: 0xffffff,
    skinning: true,
  });

  // Keep authored root name (often "Root") so animation tracks bind correctly.
  const meshes = [];
  fbx.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });

  for (const child of meshes) {
    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = false;
    const mat = base.clone();
    mat.skinning = true;
    child.material = mat;
    attachHullOutline(child);
    if (child.isSkinnedMesh && child.skeleton) child.skeleton.update();
    const geo = child.geometry;
    if (geo && !geo.attributes.uv && geo.attributes.uv1) {
      geo.setAttribute('uv', geo.attributes.uv1);
    }
  }

  // Match player facing convention from Cinema4D exports.
  fbx.rotation.y = Math.PI;

  fbx.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fbx);
  if (!box.isEmpty()) fbx.position.y -= box.min.y;

  const root = new THREE.Group();
  root.name = `NPC_${modelKey}`;
  root.userData.units = 'm';
  root.add(fbx);

  return { root, fbx, modelKey };
}

function animUrlFor(_skeleton, clipKey) {
  return NPC_ANIMS[clipKey];
}

/**
 * Attach AnimationMixer + clip actions to an NPC fbx root.
 */
export async function bindNpcAnimations(
  fbx,
  { skeleton = 'standard', clipKeys = ['idle1'], loadingManager } = {},
) {
  const mixer = new THREE.AnimationMixer(fbx);
  /** @type {Map<string, THREE.AnimationAction>} */
  const actions = new Map();

  for (const key of clipKeys) {
    const url = animUrlFor(skeleton, key);
    if (!url) {
      console.warn('[npc] missing anim url', skeleton, key);
      continue;
    }
    try {
      const clips = await loadNpcClips(url, loadingManager);
      const clip = clips[0];
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.clampWhenFinished = false;
      actions.set(key, action);
    } catch (err) {
      console.warn(`[npc] failed clip ${key}`, err);
    }
  }

  const keys = [...actions.keys()];
  const walkKeys = keys.filter((k) => k.startsWith('walk'));
  const idleKey = keys.find((k) => k.startsWith('idle')) ?? keys[0];
  const emoteKeys = keys.filter(
    (k) => !k.startsWith('idle') && !k.startsWith('walk'),
  );

  // Start idle; crowd locomotion triggers walk when wandering.
  const startKey = idleKey ?? keys[0];
  if (startKey) {
    const start = actions.get(startKey);
    start.setLoop(THREE.LoopRepeat, Infinity);
    start.reset().play();
  }

  let current = startKey ?? null;
  /** When true, update() won't auto-swap clips (crowd owns the state machine). */
  let externalControl = false;
  let nextSwapAt = 2.5 + Math.random() * 2;
  let returnIdleAt = -1;

  function play(key, { fade = 0.2, loop = THREE.LoopRepeat } = {}) {
    const next = actions.get(key);
    if (!next || key === current) return current;
    next.reset();
    next.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (current && actions.get(current)) {
      actions.get(current).crossFadeTo(next, fade, false);
    } else {
      next.fadeIn(fade);
    }
    current = key;
    return current;
  }

  function update(dt) {
    mixer.update(dt);
    if (externalControl) return;

    if (returnIdleAt > 0) {
      returnIdleAt -= dt;
      if (returnIdleAt <= 0 && idleKey) {
        play(idleKey);
        returnIdleAt = -1;
      }
    }

    nextSwapAt -= dt;
    if (nextSwapAt > 0 || keys.length < 2) return;

    // Auto-cycle only idle/emotes; walk is driven by crowd locomotion.
    const candidates = [...(idleKey ? [idleKey] : []), ...emoteKeys].filter(
      (k) => k !== current,
    );
    if (!candidates.length) {
      nextSwapAt = 3;
      return;
    }
    const pick = candidates[(Math.random() * candidates.length) | 0];
    const isIdle = pick.startsWith('idle');
    play(pick, { loop: isIdle ? THREE.LoopRepeat : THREE.LoopOnce });
    nextSwapAt = isIdle ? 3.5 + Math.random() * 4 : 2 + Math.random() * 2;
    if (!isIdle && idleKey) {
      returnIdleAt = Math.max(2, (actions.get(pick)?.getClip()?.duration ?? 2) + 0.15);
    }
  }

  return {
    mixer,
    actions,
    play,
    update,
    getCurrent: () => current,
    getIdleKey: () => idleKey,
    getWalkKeys: () => walkKeys,
    setExternalControl: (on) => {
      externalControl = Boolean(on);
    },
    dispose: () => mixer.stopAllAction(),
  };
}
