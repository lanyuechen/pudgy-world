/**
 * Catchable fish catalog (Unity FishDefinition + Fish Models).
 */
import { GENERATED_FISH_CATALOG } from './fishCatalog.generated.js';
import { FISHING } from './fishingConfig.js';

/** @typedef {{ id: string, index: number, label: string, fbx: string }} FishDefinition */

/** @type {FishDefinition[]} */
export const FISH_CATALOG = GENERATED_FISH_CATALOG;

export const FISH_BY_ID = new Map(FISH_CATALOG.map((f) => [f.id, f]));

/** How long to show the caught fish + HoldingFish pose. */
export const CATCH_HOLD_DURATION = FISHING.catchPoseHold ?? 2.4;

/**
 * @param {() => number} [random01]
 * @returns {FishDefinition | null}
 */
export function pickRandomFish(random01 = Math.random) {
  if (!FISH_CATALOG.length) return null;
  const i = Math.floor(random01() * FISH_CATALOG.length);
  return FISH_CATALOG[i] ?? null;
}
