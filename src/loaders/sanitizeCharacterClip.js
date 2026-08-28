import * as THREE from 'three';

/**
 * Mesh / armature wrapper nodes — not animated bones. Keeping their tracks
 * overrides assimp bind pose (Body -90°X, standing layout).
 */
export const STATIC_CHARACTER_NODE_NAMES = new Set([
  'Armature',
  'Body',
  'BodyParts',
  'Eyes111',
  'MouthInside',
]);

/** Convert-time +Z facing wrapper (Y=180°). */
export const FACING_ROOT_NODE_NAME = 'FacingRoot';

/** glTF quaternion xyzw — Y=180° (+Z forward with assimp Body -90°X). */
export const CHARACTER_ROOT_FORWARD_QUAT = [0, 1, 0, 0];

/**
 * Standalone animation FBXs often bake the old armature bind offset into a
 * constant Root.quaternion track. Retargeting onto baked player GLB must use
 * the skeleton bind pose instead (animated Root tracks are kept).
 * @param {THREE.KeyframeTrack} track
 */
function isConstantQuaternionTrack(track) {
  const v = track.values;
  if (!v?.length || v.length % 4 !== 0) return false;
  if (v.length <= 4) return true;
  for (let i = 4; i < v.length; i += 4) {
    for (let j = 0; j < 4; j++) {
      if (Math.abs(v[i + j] - v[j]) > 1e-4) return false;
    }
  }
  return true;
}

/**
 * Sanitize a Three.js clip for skinned characters (player / NPC).
 * @param {THREE.AnimationClip} clip
 * @returns {THREE.AnimationClip}
 */
export function sanitizeCharacterClip(clip) {
  const tracks = [];
  for (const track of clip.tracks) {
    const dot = track.name.indexOf('.');
    if (dot < 0) continue;
    const nodeName = track.name.slice(0, dot);
    const prop = track.name.slice(dot + 1);

    if (prop === 'position' || prop === 'scale') continue;

    if (prop === 'quaternion' && STATIC_CHARACTER_NODE_NAMES.has(nodeName)) continue;

    if (nodeName === 'Root' && prop === 'quaternion' && isConstantQuaternionTrack(track)) continue;

    if (prop === 'quaternion') {
      const v = track.values;
      if (!v?.length || v.length % 4 !== 0) continue;
      let valid = true;
      for (let i = 0; i < v.length; i += 4) {
        const len = Math.hypot(v[i], v[i + 1], v[i + 2], v[i + 3]);
        if (len < 1e-4) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
    }

    tracks.push(track);
  }

  const cleaned = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  cleaned.blendMode = clip.blendMode;
  cleaned.userData = { ...clip.userData };
  return cleaned;
}

/**
 * Runtime fallback for GLB characters converted before FacingRoot bake.
 * Convert-time spec bakes FacingRoot(Y180) + RootNode(identity); do not also rotate gltf.scene.
 * @param {THREE.Object3D} root gltf.scene
 */
/** Parent cosmetic trait meshes here so they share FacingRoot with the player skeleton. */
export function resolveCharacterFacingParent(root) {
  return root.getObjectByName?.(FACING_ROOT_NODE_NAME) ?? root;
}

export function ensureGlbCharacterRootFacing(root) {
  if (root.getObjectByName?.(FACING_ROOT_NODE_NAME)) return root;

  const rootNode = root.getObjectByName?.('RootNode') ?? root.children?.[0];
  if (!rootNode) return root;

  const q = rootNode.quaternion;
  const hasY180 =
    Math.abs(q.x) < 1e-3 &&
    Math.abs(q.y - 1) < 1e-3 &&
    Math.abs(q.z) < 1e-3 &&
    Math.abs(q.w) < 1e-3;
  if (hasY180) return root;

  const facing = new THREE.Group();
  facing.name = FACING_ROOT_NODE_NAME;
  facing.quaternion.set(
    CHARACTER_ROOT_FORWARD_QUAT[0],
    CHARACTER_ROOT_FORWARD_QUAT[1],
    CHARACTER_ROOT_FORWARD_QUAT[2],
    CHARACTER_ROOT_FORWARD_QUAT[3],
  );

  root.remove(rootNode);
  rootNode.quaternion.set(0, 0, 0, 1);
  rootNode.rotation.set(0, 0, 0, rootNode.rotation.order);
  facing.add(rootNode);
  root.add(facing);

  return root;
}
