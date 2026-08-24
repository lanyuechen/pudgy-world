import { COSMETIC_TRAIT_TYPES, TRAIT_TYPE } from './traitsConfig.js';

export const TRAIT_PERSISTENCE_KEY = 'pudgyworld.cosmeticTraits.v1';

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function loadSavedCosmeticTraitLoadout() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(TRAIT_PERSISTENCE_KEY);
  if (!raw) return null;
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;

  /** @type {Record<string, string | null>} */
  const out = {};
  for (const type of COSMETIC_TRAIT_TYPES) {
    const v = parsed[type];
    out[type] = typeof v === 'string' && v.length ? v : null;
  }
  // Backward/forward compatibility: if old save used explicit keys.
  if (out[TRAIT_TYPE.FullBody] === null && typeof parsed.fullBody === 'string') {
    out[TRAIT_TYPE.FullBody] = parsed.fullBody || null;
  }
  return out;
}

export function saveCosmeticTraitLoadoutSnapshot(traitEquipper) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  /** @type {Record<string, string | null>} */
  const snapshot = {};
  for (const type of COSMETIC_TRAIT_TYPES) {
    snapshot[type] = traitEquipper.getActiveId(type) ?? null;
  }
  localStorage.setItem(TRAIT_PERSISTENCE_KEY, JSON.stringify(snapshot));
}

