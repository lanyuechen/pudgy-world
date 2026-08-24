import * as THREE from 'three';
import { FISHING } from '../config/fishingConfig.js';

const _playerPos = new THREE.Vector3();

/**
 * FishingHole.cs + LocalPlayerTrigger range highlight.
 */
export function createFishingHoles(scene, { holes = FISHING.holes } = {}) {
  const group = new THREE.Group();
  group.name = 'FishingHoles';

  const outColor = new THREE.Color(FISHING.outOfRangeColor);
  const inColor = new THREE.Color(FISHING.withinRangeColor);
  const discGeo = new THREE.CylinderGeometry(
    FISHING.discDiameter * 0.5,
    FISHING.discDiameter * 0.5,
    0.04,
    32,
  );
  // Default cylinder lies flat on XZ (no rotateX — that turns it edge-on/invisible)

  /** @type {{ id: string, root: THREE.Object3D, mesh: THREE.Mesh, material: THREE.MeshStandardMaterial, position: THREE.Vector3 }[]} */
  const entries = [];

  for (const hole of holes) {
    const root = new THREE.Group();
    root.name = `FishingHole_${hole.id}`;
    root.position.set(hole.position.x, hole.position.y, hole.position.z);
    root.userData.fishingHole = true;
    root.userData.holeId = hole.id;

    const material = new THREE.MeshStandardMaterial({
      color: outColor,
      roughness: 0.35,
      metalness: 0.15,
      transparent: true,
      opacity: 0.95,
      emissive: outColor,
      emissiveIntensity: 0.35,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(discGeo, material);
    mesh.name = 'Disc';
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    mesh.userData.fishingHole = true;
    root.add(mesh);

    group.add(root);
    entries.push({
      id: hole.id,
      root,
      mesh,
      material,
      position: root.position.clone(),
    });
  }

  scene.add(group);

  let playerInRange = null;

  function updateRange(playerRoot) {
    if (!playerRoot) {
      playerInRange = null;
      for (const e of entries) {
        e.material.color.copy(outColor);
        e.material.emissive.copy(outColor);
      }
      return null;
    }

    playerRoot.getWorldPosition(_playerPos);
    let nearest = null;
    let nearestDist = Infinity;

    for (const entry of entries) {
      const dist = _playerPos.distanceTo(entry.position);
      const inRange = dist <= FISHING.playerRangeRadius;
      entry.material.color.copy(inRange ? inColor : outColor);
      entry.material.emissive.copy(inRange ? inColor : outColor);
      if (inRange && dist < nearestDist) {
        nearest = entry;
        nearestDist = dist;
      }
    }

    playerInRange = nearest;
    return nearest;
  }

  /**
   * PlayerInteract raycast — must hit hole disc within max distance while in range.
   */
  function raycastInteract(raycaster) {
    if (!playerInRange) return null;
    const meshes = entries.map((e) => e.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const hit = hits[0];
    if (hit.distance > FISHING.maxInteractDistance) return null;
    const entry = entries.find((e) => e.mesh === hit.object);
    return entry ?? null;
  }

  function getHoleInRange() {
    return playerInRange;
  }

  function dispose() {
    scene.remove(group);
    discGeo.dispose();
    for (const e of entries) e.material.dispose();
  }

  return { group, entries, updateRange, raycastInteract, getHoleInRange, dispose };
}
