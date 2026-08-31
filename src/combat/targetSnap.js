import * as THREE from 'three';
import { COMBAT } from '../config/combatConfig.js';

/** Map pitchT 0–1 to launch sin; 0 = min pitch (15°), 1 = max pitch. */
export function pitchTToLaunchSin(pitchT) {
  const minSin = Math.sin(THREE.MathUtils.degToRad(COMBAT.minPitchDeg ?? 15));
  const maxSin = Math.sin(THREE.MathUtils.degToRad(COMBAT.maxPitchDeg ?? 55));
  const t = THREE.MathUtils.clamp(pitchT, 0, 1);
  return THREE.MathUtils.lerp(minSin, maxSin, t);
}

/** Horizontal direction toward target + pitch angle → launch velocity. */
export function computeLockedThrowVelocity(origin, targetPoint, speed, pitchSin, out) {
  const dx = targetPoint.x - origin.x;
  const dz = targetPoint.z - origin.z;
  const rh = Math.hypot(dx, dz);
  const sin = THREE.MathUtils.clamp(pitchSin, pitchTToLaunchSin(0), pitchTToLaunchSin(1));
  const cos = Math.sqrt(Math.max(0, 1 - sin * sin));

  if (rh < 1e-6) {
    out.set(0, speed * sin, 0);
    return out;
  }

  const vh = speed * cos;
  out.set((dx / rh) * vh, speed * sin, (dz / rh) * vh);
  return out;
}
