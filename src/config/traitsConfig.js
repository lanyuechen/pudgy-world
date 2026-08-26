/**
 * PlayerTrait / TraitEquipper — cosmetic + fishing trait catalog.
 */
import { assetUrl } from './assetUrl.js';
import { resolveCosmeticTraitType } from './fullBodyTraits.js';
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

const COSMETIC_CATALOG = GENERATED_TRAIT_CATALOG.map((trait) => ({
  ...trait,
  type: resolveCosmeticTraitType(trait.id, trait.type),
}));

/** @type {TraitDefinition[]} */
export const TRAIT_CATALOG = [
  ...COSMETIC_CATALOG,
  // Fishing (FishingMovementState defaults)
  { id: 'rod_wooden_default', type: TRAIT_TYPE.Rod, label: 'Wooden Rod', fbx: assetUrl('/assets/models/player/fishing/Rod_Wooden_Default.fbx') },
  { id: 'rope_white_default', type: TRAIT_TYPE.Rope, label: 'White Rope', fbx: assetUrl('/assets/models/player/fishing/Rope_White_Default.fbx') },
  { id: 'bait_hook_default', type: TRAIT_TYPE.Bait, label: 'Hook', fbx: assetUrl('/assets/models/player/fishing/Bait_Hook_Default.fbx') },
  { id: 'bait_worm', type: TRAIT_TYPE.Bait, label: 'Worm', fbx: assetUrl('/assets/models/player/fishing/Bait_Worm.fbx') },
  { id: 'bait_goldworm', type: TRAIT_TYPE.Bait, label: 'Gold Worm', fbx: assetUrl('/assets/models/player/fishing/Bait_GoldWorm.fbx') },
  { id: 'bait_spam', type: TRAIT_TYPE.Bait, label: 'Spam', fbx: assetUrl('/assets/models/player/fishing/Bait_Spam.fbx') },
  { id: 'bait_squid', type: TRAIT_TYPE.Bait, label: 'Squid', fbx: assetUrl('/assets/models/player/fishing/Bait_Squid.fbx') },
  { id: 'bait_anchovie', type: TRAIT_TYPE.Bait, label: 'Anchovie', fbx: assetUrl('/assets/models/player/fishing/Bait_Anchovie.fbx') },
  { id: 'bait_jerky', type: TRAIT_TYPE.Bait, label: 'Jerky', fbx: assetUrl('/assets/models/player/fishing/Bait_Jerky.fbx') },
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
  [TRAIT_TYPE.FullBody]: null,
};

/** Traits shown in the skin panel (excludes fishing gear). */
export const COSMETIC_TRAIT_TYPES = [
  TRAIT_TYPE.FullBody,
  TRAIT_TYPE.Skin,
  TRAIT_TYPE.Head,
  TRAIT_TYPE.Face,
  TRAIT_TYPE.Body,
];

export function traitsForType(type) {
  return TRAIT_CATALOG.filter((t) => t.type === type);
}

export const TRAIT_TYPE_LABELS = {
  [TRAIT_TYPE.Skin]: '皮肤',
  [TRAIT_TYPE.Head]: '头',
  [TRAIT_TYPE.Face]: '脸',
  [TRAIT_TYPE.Body]: '身体',
  [TRAIT_TYPE.FullBody]: '套装',
  [TRAIT_TYPE.Bait]: '鱼饵',
};
