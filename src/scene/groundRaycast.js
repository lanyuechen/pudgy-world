import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';

const _origin = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);

/**
 * Ground Y at (x,z) using the same collider mesh list as the player controller.
 * Picks the hit closest to `referenceGroundY` (avoids deep interior faces e.g. y≈-78).
 */
export function findGroundYAt(meshes, x, z, referenceGroundY, fromYOffset = 100) {
  if (!meshes?.length) return referenceGroundY;

  const ray = new THREE.Raycaster();
  _origin.set(x, referenceGroundY + fromYOffset, z);
  ray.set(_origin, _down);
  ray.far = 300;

  const hits = ray.intersectObjects(meshes, false);
  if (!hits.length) return referenceGroundY;

  let bestY = null;
  let bestScore = Infinity;
  for (const hit of hits) {
    const dy = Math.abs(hit.point.y - referenceGroundY);
    if (dy > 40) continue;
    if (dy < bestScore) {
      bestScore = dy;
      bestY = hit.point.y;
    }
  }

  if (bestY != null) return bestY + PLAYER.skinWidth;
  return referenceGroundY;
}
