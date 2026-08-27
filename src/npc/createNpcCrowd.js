import * as THREE from 'three';
import { ASSET_LOAD_CONCURRENCY, mapPool } from '../util/mapPool.js';
import { bindNpcAnimations, loadNpcModel } from './loadNpc.js';

/** Slower than player walk (2.5) — casual island amble. */
const NPC_WALK_SPEED = 1.15;
const NPC_TURN_SPEED = THREE.MathUtils.degToRad(240);
/** How far from spawn an NPC may wander (meters). */
const DEFAULT_WANDER_RADIUS = 4.5;
const ARRIVE_DIST = 0.35;
/**
 * loadNpc sets fbx.rotation.y = π, so mesh faces root −Z.
 * Root yaw must be travelDirection + π; motion uses visual forward (−Z).
 */
const MESH_YAW_OFFSET = Math.PI;

function collectMeshes(root) {
  const meshes = [];
  root?.traverse((child) => {
    if (child.isMesh && !child.userData?.isHullOutlineMesh) meshes.push(child);
  });
  return meshes;
}

/**
 * Snap NPC to top surface under (x,z). Prefers nearest hit from above.
 * Falls back to island AABB bottom if the ray misses (off-mesh offsets).
 */
function snapNpcToGround(root, colliders, x, z, fallbackY = 0) {
  if (!colliders.length) {
    root.position.y = fallbackY;
    return;
  }

  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(x, 250, z), new THREE.Vector3(0, -1, 0));
  ray.far = 500;
  const hits = ray.intersectObjects(colliders, false);
  if (hits.length) {
    root.position.y = hits[0].point.y;
    return;
  }
  root.position.y = fallbackY;
}

function pickWanderTarget(homeX, homeZ, radius) {
  const ang = Math.random() * Math.PI * 2;
  const dist = radius * (0.35 + Math.random() * 0.65);
  return {
    x: homeX + Math.cos(ang) * dist,
    z: homeZ + Math.sin(ang) * dist,
  };
}

function shortestAngleDelta(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Spawn a crowd of NPCs into `parent`.
 * Placement x/z are treated as offsets from the collisionRoot's XZ center
 * so the same config works on differently-centered Individual islands.
 *
 * NPCs with walk clips wander inside `wanderRadius` (default 4.5m);
 * others stay put and cycle idle/emote clips.
 *
 * @returns {Promise<{ group: THREE.Group, update: (dt:number)=>void, dispose: ()=>void }>}
 */
export async function createNpcCrowd({
  parent,
  collisionRoot,
  placements,
  loadingManager,
  onProgress,
} = {}) {
  const group = new THREE.Group();
  group.name = 'NPCs';
  parent.add(group);

  collisionRoot?.updateMatrixWorld?.(true);
  const colliders = collectMeshes(collisionRoot);

  const box = new THREE.Box3();
  if (collisionRoot) box.setFromObject(collisionRoot);
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const groundFallback = box.isEmpty() ? 0 : box.min.y;

  /** @type {Array<{
   *   root: THREE.Object3D,
   *   anim: Awaited<ReturnType<typeof bindNpcAnimations>>,
   *   homeX: number,
   *   homeZ: number,
   *   wanderRadius: number,
   *   target: {x:number,z:number}|null,
   *   mode: 'idle'|'walk'|'emote',
   *   nextDecisionAt: number,
   * }>} */
  const controllers = [];
  const total = placements.length;
  let loaded = 0;

  await mapPool(placements, ASSET_LOAD_CONCURRENCY, async (p) => {
    onProgress?.(`Loading NPC ${p.id}… (${loaded + 1}/${total})`, loaded / Math.max(total, 1));

    try {
      const { root, fbx } = await loadNpcModel(p.model, loadingManager);

      const x = center.x + (p.position?.x ?? 0);
      const z = center.z + (p.position?.z ?? 0);
      root.position.set(x, center.y + 5, z);
      root.rotation.y = THREE.MathUtils.degToRad(p.yawDeg ?? 0);
      snapNpcToGround(root, colliders, x, z, groundFallback);

      group.add(root);
      root.updateMatrixWorld(true);

      const anim = await bindNpcAnimations(fbx, {
        skeleton: p.skeleton ?? 'standard',
        clipKeys: p.clips,
        loadingManager,
      });
      anim.update(1 / 30);

      const walkKeys = anim.getWalkKeys();
      const canWander = walkKeys.length > 0;
      if (canWander) anim.setExternalControl(true);

      controllers.push({
        root,
        anim,
        homeX: x,
        homeZ: z,
        wanderRadius: p.wanderRadius ?? DEFAULT_WANDER_RADIUS,
        target: null,
        mode: 'idle',
        nextDecisionAt: 1.5 + Math.random() * 2.5,
      });
    } catch (err) {
      console.error(`[npc] failed to spawn ${p.id}`, err);
    } finally {
      loaded += 1;
      onProgress?.(`Loading NPCs… (${loaded}/${total})`, loaded / Math.max(total, 1));
    }
  });

  function startWander(c) {
    const walks = c.anim.getWalkKeys();
    if (!walks.length) return;
    c.target = pickWanderTarget(c.homeX, c.homeZ, c.wanderRadius);
    c.mode = 'walk';
    c.anim.play(walks[(Math.random() * walks.length) | 0], {
      loop: THREE.LoopRepeat,
    });
  }

  function startIdle(c) {
    c.target = null;
    c.mode = 'idle';
    const idle = c.anim.getIdleKey();
    if (idle) c.anim.play(idle, { loop: THREE.LoopRepeat });
    c.nextDecisionAt = 2.5 + Math.random() * 3.5;
  }

  function startEmote(c) {
    const keys = [...c.anim.actions.keys()].filter(
      (k) => !k.startsWith('idle') && !k.startsWith('walk'),
    );
    if (!keys.length) {
      startIdle(c);
      return;
    }
    const key = keys[(Math.random() * keys.length) | 0];
    c.target = null;
    c.mode = 'emote';
    c.anim.play(key, { loop: THREE.LoopOnce });
    const dur = c.anim.actions.get(key)?.getClip()?.duration ?? 2;
    c.nextDecisionAt = Math.max(1.8, dur + 0.2);
  }

  function updateWanderer(c, dt) {
    c.anim.update(dt);

    if (c.mode === 'walk' && c.target) {
      const dx = c.target.x - c.root.position.x;
      const dz = c.target.z - c.root.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= ARRIVE_DIST) {
        startIdle(c);
        return;
      }

      // Travel along +atan2(dx,dz); mesh faces opposite of root +Z → offset π.
      const targetYaw = Math.atan2(dx, dz) + MESH_YAW_OFFSET;
      const delta = shortestAngleDelta(c.root.rotation.y, targetYaw);
      const step = Math.min(Math.abs(delta), NPC_TURN_SPEED * dt);
      c.root.rotation.y += Math.sign(delta) * step;

      const yaw = c.root.rotation.y;
      const move = Math.min(NPC_WALK_SPEED * dt, dist);
      c.root.position.x -= Math.sin(yaw) * move;
      c.root.position.z -= Math.cos(yaw) * move;
      snapNpcToGround(
        c.root,
        colliders,
        c.root.position.x,
        c.root.position.z,
        groundFallback,
      );
      return;
    }

    c.nextDecisionAt -= dt;
    if (c.nextDecisionAt > 0) return;

    // Prefer walking; sometimes emote/idle in place.
    const roll = Math.random();
    if (roll < 0.55) startWander(c);
    else if (roll < 0.8) startEmote(c);
    else startIdle(c);
  }

  return {
    group,
    update(dt) {
      for (const c of controllers) {
        if (c.anim.getWalkKeys().length) updateWanderer(c, dt);
        else c.anim.update(dt);
      }
    },
    dispose() {
      for (const c of controllers) c.anim.dispose();
      group.removeFromParent();
    },
  };
}
