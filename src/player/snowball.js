import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';
import { COMBAT } from '../config/combatConfig.js';

/**
 * Snowball projectile with parabolic flight and entity hit detection.
 * Entity hits use capsule proximity (reliable for SkinnedMeshes); environment uses raycasts.
 */
export function createSnowballSystem(scene, {
  getColliders,
  isSourceObject,
  getEntityTargets,
  getPlayerTarget,
  onEnvironmentHit,
  onEntityHit,
  onPlayerHit,
} = {}) {
  const balls = [];
  const raycaster = new THREE.Raycaster();
  const _origin = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _move = new THREE.Vector3();
  const _end = new THREE.Vector3();
  const _sample = new THREE.Vector3();

  const geometry = new THREE.SphereGeometry(PLAYER.snowballRadius, 16, 12);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
  });

  /**
   * @param {THREE.Vector3} originWorld
   * @param {{ velocity?: THREE.Vector3, direction?: THREE.Vector3, chargeLevel?: number, sourceId?: string|null, sourceRoot?: THREE.Object3D|null, radius?: number, damage?: number }} opts
   */
  function spawn(originWorld, {
    velocity = null,
    direction = null,
    chargeLevel = 0,
    sourceId = null,
    sourceRoot = null,
    radius = PLAYER.snowballRadius,
    damage = COMBAT.snowballDamage,
  } = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Snowball';
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.userData.isSnowball = true;
    mesh.position.copy(originWorld);
    if (Math.abs(radius - PLAYER.snowballRadius) > 1e-6) {
      mesh.scale.setScalar(radius / PLAYER.snowballRadius);
    }

    let vel;
    if (velocity) {
      vel = velocity.clone();
    } else {
      _dir.copy(direction ?? new THREE.Vector3(0, 0, 1));
      if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, 1);
      _dir.normalize();
      const t = THREE.MathUtils.clamp(chargeLevel, 0, 1);
      const speed = THREE.MathUtils.lerp(COMBAT.throwSpeedMin, COMBAT.throwSpeedMax, t);
      vel = _dir.clone().multiplyScalar(speed);
    }

    scene.add(mesh);
    balls.push({
      mesh,
      velocity: vel,
      active: true,
      processed: new Set(),
      sourceId,
      sourceRoot,
      radius,
      damage,
    });
    return mesh;
  }

  function destroyBall(ball) {
    scene.remove(ball.mesh);
    const i = balls.indexOf(ball);
    if (i >= 0) balls.splice(i, 1);
  }

  function isUnderRoot(obj, root) {
    if (!root) return false;
    let p = obj;
    while (p) {
      if (p === root) return true;
      p = p.parent;
    }
    return false;
  }

  function getHitTargets() {
    const targets = [...(getEntityTargets?.() ?? [])];
    const player = getPlayerTarget?.();
    if (player?.alive) targets.push(player);
    return targets;
  }

  function fireEntityHit(target, ball, hitPoint) {
    if (target.id === 'player') onPlayerHit?.(ball, hitPoint);
    else onEntityHit?.(target, ball, hitPoint);
  }

  /** Capsule proximity along the flight segment — works when SkinnedMesh rays miss. */
  function tryProximityHit(ball, from, to) {
    const targets = getHitTargets();
    const ballR = ball.radius ?? PLAYER.snowballRadius;
    const hitR = (COMBAT.entityHitRadius ?? 0.75) + ballR;
    const hitH = COMBAT.entityHitHeight ?? 1.7;
    const samples = 4;

    for (const target of targets) {
      if (!target?.alive || !target.sourceRoot) continue;
      if (ball.sourceRoot && target.sourceRoot === ball.sourceRoot) continue;

      const root = target.sourceRoot;
      const cx = root.position.x;
      const cz = root.position.z;
      const y0 = root.position.y - 0.15;
      const y1 = root.position.y + hitH;

      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        _sample.lerpVectors(from, to, t);
        const dx = _sample.x - cx;
        const dz = _sample.z - cz;
        if (dx * dx + dz * dz > hitR * hitR) continue;
        if (_sample.y < y0 || _sample.y > y1) continue;
        fireEntityHit(target, ball, _sample.clone());
        return true;
      }
    }
    return false;
  }

  function tryMeshEntityHit(ball, hitObj, hitPoint) {
    const targets = getHitTargets();
    for (const target of targets) {
      if (!target?.alive) continue;
      if (ball.sourceRoot && target.sourceRoot === ball.sourceRoot) continue;
      if (target.sourceRoot && isUnderRoot(hitObj, target.sourceRoot)) {
        fireEntityHit(target, ball, hitPoint?.clone?.() ?? ball.mesh.position.clone());
        return true;
      }
      for (const mesh of target.meshes ?? []) {
        if (hitObj === mesh || isUnderRoot(hitObj, mesh)) {
          fireEntityHit(target, ball, hitPoint?.clone?.() ?? ball.mesh.position.clone());
          return true;
        }
      }
    }
    return false;
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
      _move.copy(ball.velocity).multiplyScalar(dt);
      _end.copy(_origin).add(_move);
      const dist = _move.length();

      // 1) Entity proximity (player + enemies) — primary hit path
      if (tryProximityHit(ball, _origin, _end)) {
        ball.active = false;
        destroyBall(ball);
        continue;
      }

      if (dist > 1e-8) {
        _dir.copy(_move).normalize();
        raycaster.set(_origin, _dir);
        raycaster.far = dist + (ball.radius ?? PLAYER.snowballRadius);
        raycaster.near = 0;

        const entityMeshes = getHitTargets().flatMap((t) =>
          t.alive ? (t.meshes ?? []) : [],
        );
        const hits = raycaster.intersectObjects([...colliders, ...entityMeshes], false);
        let resolved = false;
        for (const hit of hits) {
          const obj = hit.object;
          if (obj.userData?.isSnowball) continue;
          // Only skip the thrower's own body for player-thrown balls.
          if (ball.sourceId === 'player' && isSourceObject?.(obj)) continue;
          if (ball.sourceRoot && isUnderRoot(obj, ball.sourceRoot)) continue;
          if (ball.processed.has(obj.uuid)) continue;

          if (tryMeshEntityHit(ball, obj, hit.point)) {
            ball.processed.add(obj.uuid);
            ball.active = false;
            resolved = true;
            break;
          }

          ball.processed.add(obj.uuid);
          ball.active = false;
          onEnvironmentHit?.();
          resolved = true;
          break;
        }

        if (resolved) {
          destroyBall(ball);
          continue;
        }

        ball.mesh.position.copy(_end);
      }

      if (ball.mesh.position.y < -40) {
        destroyBall(ball);
      }
    }
  }

  function getPlayerProjectiles() {
    return balls
      .filter((b) => b.active && b.sourceId === 'player')
      .map((b) => ({
        x: b.mesh.position.x,
        y: b.mesh.position.y,
        z: b.mesh.position.z,
        vx: b.velocity.x,
        vy: b.velocity.y,
        vz: b.velocity.z,
      }));
  }

  function dispose() {
    while (balls.length) destroyBall(balls[0]);
    geometry.dispose();
    material.dispose();
  }

  return { spawn, update, dispose, getPlayerProjectiles };
}
