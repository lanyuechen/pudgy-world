/**
 * PlayerTrait / TraitEquipper — cosmetic + fishing trait catalog.
 */
import { assetUrl } from './assetUrl.js';
import { GENERATED_TRAIT_CATALOG } from './traitsCatalog.generated.js';

export const TRAIT_TYPE = {
  Skin: 'skin',
  Head: 'head',
  Face: 'face',
  Body: 'body',
  FullBody: 'fullBody',
  Rod: 'rod',
  Rope: 'rope',
  Bait: 'bait',
};

/** @typedef {{ id: string, type: string, label: string, fbx: string }} TraitDefinition */

/** @type {TraitDefinition[]} */
export const TRAIT_CATALOG = [
  ...GENERATED_TRAIT_CATALOG,
  // Fishing (FishingMovementState defaults)
  { id: 'rod_wooden_default', type: TRAIT_TYPE.Rod, label: 'Wooden Rod', fbx: assetUrl('/assets/models/player/fishing/Rod_Wooden_Default.fbx') },
  { id: 'rope_white_default', type: TRAIT_TYPE.Rope, label: 'White Rope', fbx: assetUrl('/assets/models/player/fishing/Rope_White_Default.fbx') },
  { id: 'bait_hook_default', type: TRAIT_TYPE.Bait, label: 'Hook Bait', fbx: assetUrl('/assets/models/player/fishing/Bait_Hook_Default.fbx') },
];

export const TRAIT_BY_ID = new Map(TRAIT_CATALOG.map((t) => [t.id, t]));

export const FISHING_TRAIT_IDS = {
  rod: 'rod_wooden_default',
  rope: 'rope_white_default',
  bait: 'bait_hook_default',
};

/** Default cosmetic loadout (editor-friendly starter set). */
export const DEFAULT_TRAIT_LOADOUT = {
  [TRAIT_TYPE.Skin]: null,
  [TRAIT_TYPE.Head]: null,
  [TRAIT_TYPE.Face]: null,
  [TRAIT_TYPE.Body]: null,
};

/** Traits shown in the customization panel (excludes fishing gear). */
export const COSMETIC_TRAIT_TYPES = [
  TRAIT_TYPE.Skin,
  TRAIT_TYPE.Head,
  TRAIT_TYPE.Face,
  TRAIT_TYPE.Body,
];

export function traitsForType(type) {
  return TRAIT_CATALOG.filter((t) => t.type === type);
}

export const TRAIT_TYPE_LABELS = {
  [TRAIT_TYPE.Skin]: 'Skin',
  [TRAIT_TYPE.Head]: 'Head',
  [TRAIT_TYPE.Face]: 'Face',
  [TRAIT_TYPE.Body]: 'Body',
};
