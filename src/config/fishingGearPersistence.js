import { FISHING_TRAIT_IDS, TRAIT_BY_ID, TRAIT_TYPE } from './traitsConfig.js';

export const FISHING_GEAR_PERSISTENCE_KEY = 'pudgyworld.fishingGear.v1';

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isValidBaitId(id) {
  const trait = TRAIT_BY_ID.get(id);
  return Boolean(trait && trait.type === TRAIT_TYPE.Bait);
}

/** @returns {{ bait: string }} */
export function loadSavedFishingGearPrefs() {
  const defaults = { bait: FISHING_TRAIT_IDS.bait };
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return defaults;
  const raw = localStorage.getItem(FISHING_GEAR_PERSISTENCE_KEY);
  if (!raw) return defaults;
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== 'object') return defaults;
  const bait = typeof parsed.bait === 'string' && isValidBaitId(parsed.bait)
    ? parsed.bait
    : FISHING_TRAIT_IDS.bait;
  return { bait };
}

export function saveFishingGearPrefs(prefs) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const bait = prefs?.bait && isValidBaitId(prefs.bait) ? prefs.bait : FISHING_TRAIT_IDS.bait;
  localStorage.setItem(FISHING_GEAR_PERSISTENCE_KEY, JSON.stringify({ bait }));
}
