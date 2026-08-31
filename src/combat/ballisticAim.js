import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';
import { COMBAT } from '../config/combatConfig.js';

const _scratchTarget = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

/**
 * Predict world aim/impact point from crosshair — skips nearby ground hits under the player.
 */
export function predictCrosshairTarget({
  origin,
  camera,
  canvas,
  clientX,
  clientY,
  colliders = [],
  out,
}) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    out.copy(origin).add(new THREE.Vector3(0, 0, COMBAT.aimRayDistance ?? 80));
    return out;
  }

  _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  _raycaster.setFromCamera(_ndc, camera);

  const minDist = COMBAT.minAimDistance ?? 4;
  const minY = origin.y + (COMBAT.minTargetYOffset ?? 0.08);
  const hits = colliders.length ? _raycaster.intersectObjects(colliders, false) : [];

  for (const hit of hits) {
    if (hit.point.distanceTo(origin) >= minDist) {
      out.copy(hit.point);
      if (out.y < minY) out.y = minY;
      return out;
    }
  }

  const dir = _raycaster.ray.direction;
  const ro = _raycaster.ray.origin;
  const planeY = origin.y + (COMBAT.aimPlaneHeight ?? 1);
  if (Math.abs(dir.y) > 1e-5) {
    const t = (planeY - ro.y) / dir.y;
    if (t > 0) {
      out.copy(ro).addScaledVector(dir, t);
      if (out.distanceTo(origin) >= minDist) {
        if (out.y < minY) out.y = minY;
        return out;
      }
    }
  }

  out.copy(ro).addScaledVector(dir, COMBAT.aimRayDistance ?? 80);
  if (out.y < minY) out.y = minY;
  return out;
}

/** Map charge 0–1 to launch speed (m/s). */
export function chargeLevelToSpeed(chargeLevel) {
  const t = THREE.MathUtils.clamp(chargeLevel, 0, 1);
  return THREE.MathUtils.lerp(COMBAT.throwSpeedMin, COMBAT.throwSpeedMax, t);
}

function enforceMinLaunchAngle(out, speed, minSin) {
  const floor = minSin ?? COMBAT.minLaunchSin ?? 0.31;
  const minVy = speed * floor;
  if (out.y >= minVy) return out;
  const rh = Math.hypot(out.x, out.z);
  if (rh < 1e-6) {
    out.set(0, minVy, 0);
    return out;
  }
  const vh = Math.sqrt(Math.max(0, speed * speed - minVy * minVy));
  out.set((out.x / rh) * vh, minVy, (out.z / rh) * vh);
  return out;
}

/**
 * Ballistic velocity toward aim point.
 * When snapped, elevation from crosshair height (relY) sets minimum launch angle.
 */
export function computeBallisticVelocity(origin, target, speed, out, gravity = PLAYER.gravity, snap = null) {
  const aimTarget = _scratchTarget.copy(target);
  const minY = origin.y + (COMBAT.minTargetYOffset ?? 0.08);
  if (aimTarget.y < minY) aimTarget.y = minY;

  const dx = aimTarget.x - origin.x;
  const dy = aimTarget.y - origin.y;
  const dz = aimTarget.z - origin.z;
  const rhSq = dx * dx + dz * dz;
  const rh = Math.sqrt(rhSq);

  const minSin = snap?.snapped
    ? (snap.elevation ?? COMBAT.minLaunchSin)
    : (COMBAT.minLaunchSin ?? 0.31);

  if (rh < 0.05) {
    out.set(0, speed * 0.75, 0);
    return enforceMinLaunchAngle(out, speed, minSin);
  }

  const g = Math.abs(gravity);
  const v2 = speed * speed;
  const a = (g * rhSq) / (2 * v2);
  const b = rh;
  const c = a - dy;
  const disc = b * b - 4 * a * c;
  const hx = dx / rh;
  const hz = dz / rh;

  if (disc >= 0) {
    const sqrtDisc = Math.sqrt(disc);
    const u1 = (-b + sqrtDisc) / (2 * a);
    const u2 = (-b - sqrtDisc) / (2 * a);
    const tanTheta = Math.max(u1, u2);
    const cosTheta = 1 / Math.sqrt(1 + tanTheta * tanTheta);
    let sinTheta = tanTheta * cosTheta;
    if (snap?.snapped) sinTheta = Math.max(sinTheta, minSin);
    const cosUsed = Math.sqrt(Math.max(0, 1 - sinTheta * sinTheta));
    const vh = speed * cosUsed;
    out.set(hx * vh, speed * sinTheta, hz * vh);
    return enforceMinLaunchAngle(out, speed, minSin);
  }

  const elev = snap?.snapped ? minSin : Math.max(COMBAT.minLaunchSin ?? 0.31, 0.62);
  const vh = speed * Math.sqrt(Math.max(0, 1 - elev * elev));
  out.set(hx * vh, speed * elev, hz * vh);
  return enforceMinLaunchAngle(out, speed, minSin);
}
