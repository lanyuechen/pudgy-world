import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';

/**
 * Snowball projectile matching Assets/Scripts/Objects/Snowball.cs + Snowball.prefab:
 * - Trigger sphere radius 0.125
 * - Rigidbody mass 1, useGravity
 * - Initial velocity = player.TransformDirection(0, 2, 12.5)
 * - First trigger (except source) → OnSnowballHit + destroy
 */
export function createSnowballSystem(scene, { getColliders, isSourceObject, onHit } = {}) {
  const balls = [];
  const raycaster = new THREE.Raycaster();
  const _origin = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _velLocal = new THREE.Vector3(
    PLAYER.snowballInitialVelocity.x,
    PLAYER.snowballInitialVelocity.y,
    PLAYER.snowballInitialVelocity.z,
  );

  const geometry = new THREE.SphereGeometry(PLAYER.snowballRadius, 16, 12);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
  });

  function spawn(handWorldPos, playerQuaternion) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Snowball';
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.userData.isSnowball = true;
    mesh.position.copy(handWorldPos);

    const velocity = _velLocal.clone().applyQuaternion(playerQuaternion);

    scene.add(mesh);
    balls.push({
      mesh,
      velocity,
      active: true,
      processed: new Set(),
    });
    return mesh;
  }

  function destroyBall(ball) {
    scene.remove(ball.mesh);
    const i = balls.indexOf(ball);
    if (i >= 0) balls.splice(i, 1);
  }

  function update(dt) {
    const colliders = getColliders?.() ?? [];
    const gravity = PLAYER.gravity;

    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      if (!ball.active) {
        destroyBall(ball);
        continue;
      }

      _origin.copy(ball.mesh.position);
      ball.velocity.y += gravity * dt;
      const move = ball.velocity.clone().multiplyScalar(dt);
      const dist = move.length();
      if (dist > 1e-8) {
        _dir.copy(move).normalize();
        raycaster.set(_origin, _dir);
        raycaster.far = dist + PLAYER.snowballRadius;
        raycaster.near = 0;

        const hits = raycaster.intersectObjects(colliders, false);
        let hitObj = null;
        for (const hit of hits) {
          const obj = hit.object;
          if (obj.userData?.isSnowball) continue;
          if (isSourceObject?.(obj)) continue;
          if (ball.processed.has(obj.uuid)) continue;
          hitObj = obj;
          break;
        }

        if (hitObj) {
          ball.processed.add(hitObj.uuid);
          ball.active = false;
          onHit?.();
          destroyBall(ball);
          continue;
        }

        ball.mesh.position.add(move);
      }

      // Safety: despawn if fallen far below the plaza
      if (ball.mesh.position.y < -40) {
        destroyBall(ball);
      }
    }
  }

  function dispose() {
    while (balls.length) destroyBall(balls[0]);
    geometry.dispose();
    material.dispose();
  }

  return { spawn, update, dispose };
}
