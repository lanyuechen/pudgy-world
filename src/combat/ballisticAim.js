import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';
import { COMBAT } from '../config/combatConfig.js';
import { accuracyMaxOffsetDeg } from '../config/playerStats.js';

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

/**
 * Random elevation jitter from accuracy.
 * 100 → no offset; 50 → up to ±2°.
 * @param {THREE.Vector3} velocity
 * @param {number} [accuracy]
 */
export function applyAccuracyElevationJitter(velocity, accuracy) {
  const maxDeg = accuracyMaxOffsetDeg(accuracy);
  if (maxDeg <= 1e-6) return velocity;
  const speed = velocity.length();
  if (speed < 1e-4) return velocity;
  const yaw = Math.atan2(velocity.x, velocity.z);
  const elev = Math.asin(THREE.MathUtils.clamp(velocity.y / speed, -1, 1));
  const delta = (Math.random() * 2 - 1) * THREE.MathUtils.degToRad(maxDeg);
  const nextElev = elev + delta;
  const cosP = Math.cos(nextElev);
  velocity.set(
    Math.sin(yaw) * cosP * speed,
    Math.sin(nextElev) * speed,
    Math.cos(yaw) * cosP * speed,
  );
  return velocity;
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

/**
 * Required launch speed to pass through target at elevation θ (radians).
 * Two points on a parabola: origin → target.
 * θ > 0 up, θ < 0 down.
 */
function launchSpeedForElevation(rh, dy, theta, g) {
  const cos = Math.cos(theta);
  if (Math.abs(cos) < 1e-5) return Infinity;
  const denom = rh * Math.tan(theta) - dy;
  if (denom <= 1e-8) return Infinity;
  const v2 = (g * rh * rh) / (2 * cos * cos * denom);
  if (!(v2 > 0) || !Number.isFinite(v2)) return Infinity;
  return Math.sqrt(v2);
}

/**
 * Lock-on throw:
 * - Origin & enemy are two points on the parabola (real 3D aim — no height clamp)
 * - Launch speed capped at maxSpeed (default: full charge throwSpeedMax)
 * - Prefer the smallest |elevation| that still hits under that speed
 * - No ±45° cap — steep angles are required for high / close targets above the thrower
 *
 * @param {THREE.Vector3} origin
 * @param {THREE.Vector3} target
 * @param {THREE.Vector3} out
 * @param {number} [gravity]
 * @param {number} [maxSpeed] optional override for Vmax (e.g. strength-scaled)
 * @returns {number} launch speed used
 */
export function solveLockOnBallistic(origin, target, out, gravity = PLAYER.gravity, maxSpeed) {
  const Vmax = maxSpeed ?? COMBAT.throwSpeedMax ?? 22;
  const g = Math.abs(gravity);
  // Nearly vertical is allowed so cliffs / elevated enemies remain hittable.
  const elevMinDeg = -89;
  const elevMaxDeg = 89;
  const elevStepDeg = 0.25;

  // Use the real aim point — do NOT lift targets up to hand height
  // (that bug turned "drop on enemy below" into a long flat throw).
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const rh = Math.hypot(dx, dz);
  const hx = rh > 1e-6 ? dx / rh : 0;
  const hz = rh > 1e-6 ? dz / rh : 1;

  if (rh < 0.05) {
    // Nearly straight down / up
    const spd = Math.min(Vmax, Math.max(4, Math.sqrt(Math.abs(2 * g * Math.abs(dy))) + 2));
    out.set(0, Math.sign(dy || -1) * spd, 0);
    return spd;
  }

  // Prefer near-horizontal; allow steep up/down when the height gap demands it.
  let bestTheta = null;
  let bestSpeed = Vmax;
  let bestAbs = Infinity;

  for (let deg = elevMinDeg; deg <= elevMaxDeg; deg += elevStepDeg) {
    if (deg === 0) {
      // θ=0: denom = -dy, only valid when target is below
      const need = dy < -1e-4 ? Math.sqrt((g * rh * rh) / (2 * -dy)) : Infinity;
      if (need <= Vmax && 0 < bestAbs) {
        bestAbs = 0;
        bestTheta = 0;
        bestSpeed = need;
      }
      continue;
    }
    const t = THREE.MathUtils.degToRad(deg);
    const need = launchSpeedForElevation(rh, dy, t, g);
    const abs = Math.abs(deg);
    if (need <= Vmax && abs < bestAbs - 1e-6) {
      bestAbs = abs;
      bestTheta = t;
      bestSpeed = need;
    }
  }

  if (bestTheta == null) {
    // Still unreachable at Vmax (too far / too high) — aim along true LOS at full charge.
    bestTheta = Math.atan2(dy, rh);
    bestSpeed = Vmax;
  }

  const cos = Math.cos(bestTheta);
  const sin = Math.sin(bestTheta);
  const vh = bestSpeed * cos;
  out.set(hx * vh, bestSpeed * sin, hz * vh);
  return bestSpeed;
}
