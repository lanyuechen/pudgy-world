import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';

const DEFAULT_STEPS = 56;
const DEFAULT_DT = 0.045;
const MAX_FLIGHT_S = 2.8;
const MAX_BALLS = 48;
/** Arc-length spacing between ball centers (m). */
const BALL_SPACING = 0.52;
/** Largest ball radius near the throw origin (m). */
const MAX_BALL_RADIUS = 0.085;
/** Smallest ball radius at the end of the arc (m). */
const MIN_BALL_RADIUS = 0.028;

/**
 * World-space ballistic arc preview — white dots that shrink along the full arc.
 */
export function createTrajectoryPreview(scene, { getColliders } = {}) {
  const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    toneMapped: false,
    depthTest: true,
    depthWrite: false,
  });

  const balls = new THREE.InstancedMesh(sphereGeo, material, MAX_BALLS);
  balls.name = 'ThrowTrajectory';
  balls.frustumCulled = false;
  balls.renderOrder = 5;
  balls.count = 0;
  balls.visible = false;
  scene.add(balls);

  const _dir = new THREE.Vector3();
  const _move = new THREE.Vector3();
  const _pos = new THREE.Vector3();
  const _vel = new THREE.Vector3();
  const _dummy = new THREE.Object3D();
  const raycaster = new THREE.Raycaster();
  /** @type {THREE.Vector3[]} */
  const pathPoints = [];
  const cumulative = [0];

  function simulate(origin, velocity) {
    const colliders = getColliders?.() ?? [];
    const gravity = PLAYER.gravity;
    const dt = DEFAULT_DT;

    pathPoints.length = 0;
    cumulative.length = 1;
    cumulative[0] = 0;

    _pos.copy(origin);
    _vel.copy(velocity);
    pathPoints.push(_pos.clone());

    let elapsed = 0;
    for (let i = 0; i < DEFAULT_STEPS && elapsed < MAX_FLIGHT_S; i++) {
      _vel.y += gravity * dt;
      _move.copy(_vel).multiplyScalar(dt);
      const dist = _move.length();
      if (dist < 1e-8) break;

      _dir.copy(_move).normalize();
      raycaster.set(_pos, _dir);
      raycaster.far = dist + PLAYER.snowballRadius;
      raycaster.near = 0;

      const hits = colliders.length ? raycaster.intersectObjects(colliders, false) : [];
      if (hits.length) {
        pathPoints.push(hits[0].point.clone());
        break;
      }

      _pos.add(_move);
      elapsed += dt;
      pathPoints.push(_pos.clone());

      if (_pos.y < origin.y - 25) break;
    }

    for (let i = 1; i < pathPoints.length; i++) {
      cumulative[i] = cumulative[i - 1] + pathPoints[i].distanceTo(pathPoints[i - 1]);
    }

    return cumulative[pathPoints.length - 1] ?? 0;
  }

  function pointAtDistance(s, out) {
    if (pathPoints.length === 0) return out.set(0, 0, 0);
    if (pathPoints.length === 1 || s <= 0) return out.copy(pathPoints[0]);
    const total = cumulative[pathPoints.length - 1];
    if (s >= total) return out.copy(pathPoints[pathPoints.length - 1]);

    for (let i = 1; i < pathPoints.length; i++) {
      if (s <= cumulative[i]) {
        const segLen = cumulative[i] - cumulative[i - 1];
        const t = segLen > 1e-6 ? (s - cumulative[i - 1]) / segLen : 0;
        return out.lerpVectors(pathPoints[i - 1], pathPoints[i], t);
      }
    }
    return out.copy(pathPoints[pathPoints.length - 1]);
  }

  function placeBalls(totalLength) {
    if (totalLength < 0.08 || pathPoints.length < 2) {
      balls.count = 0;
      return 0;
    }

    let instance = 0;
    for (let s = 0; s <= totalLength && instance < MAX_BALLS; s += BALL_SPACING) {
      const t = totalLength > 1e-6 ? s / totalLength : 0;
      const radius = THREE.MathUtils.lerp(MAX_BALL_RADIUS, MIN_BALL_RADIUS, t);
      if (radius < 0.01) continue;

      pointAtDistance(s, _dummy.position);
      _dummy.scale.setScalar(radius);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      balls.setMatrixAt(instance, _dummy.matrix);
      instance += 1;
    }

    balls.count = instance;
    balls.instanceMatrix.needsUpdate = true;
    return instance;
  }

  function update({ origin, velocity, visible = true }) {
    if (!visible || !origin || !velocity) {
      balls.visible = false;
      return;
    }
    const totalLength = simulate(origin, velocity);
    const count = placeBalls(totalLength);
    balls.visible = count > 0;
  }

  function setVisible(visible) {
    balls.visible = !!visible;
  }

  function dispose() {
    scene.remove(balls);
    sphereGeo.dispose();
    material.dispose();
  }

  return { update, setVisible, dispose };
}
