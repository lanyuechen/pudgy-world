/**
 * PlayerTrait / TraitEquipper — cosmetic + fishing trait catalog.
 */
import { assetUrl } from './assetUrl.js';

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
  // Skin
  { id: 'skin_pudgyblue_default', type: TRAIT_TYPE.Skin, label: 'Pudgy Blue', fbx: assetUrl('/assets/models/player/traits/skin_pudgyblue_default.fbx') },
  { id: 'skin_pollypink_default', type: TRAIT_TYPE.Skin, label: 'Polly Pink', fbx: assetUrl('/assets/models/player/traits/skin_pollypink_default.fbx') },
  { id: 'skin_blackandwhite_default', type: TRAIT_TYPE.Skin, label: 'Black & White', fbx: assetUrl('/assets/models/player/traits/skin_blackandwhite_default.fbx') },

  // Head
  { id: 'head_polarbear_default', type: TRAIT_TYPE.Head, label: 'Polar Bear', fbx: assetUrl('/assets/models/player/traits/head_polarbear_default.fbx') },
  { id: 'head_cowboyhat_default', type: TRAIT_TYPE.Head, label: 'Cowboy Hat', fbx: assetUrl('/assets/models/player/traits/head_cowboyhat_default.fbx') },
  { id: 'head_2hat_common', type: TRAIT_TYPE.Head, label: '2 Hat', fbx: assetUrl('/assets/models/player/traits/head_2hat_common.fbx') },

  // Face
  { id: 'face_normal_default', type: TRAIT_TYPE.Face, label: 'Normal Face', fbx: assetUrl('/assets/models/player/traits/face_normal_default.fbx') },
  { id: 'face_cute_default', type: TRAIT_TYPE.Face, label: 'Cute Face', fbx: assetUrl('/assets/models/player/traits/face_cute_default.fbx') },
  { id: 'face_circleglasses_common', type: TRAIT_TYPE.Face, label: 'Circle Glasses', fbx: assetUrl('/assets/models/player/traits/face_circleglasses_common.fbx') },

  // Body
  { id: 'body_bikerjacket_default', type: TRAIT_TYPE.Body, label: 'Biker Jacket', fbx: assetUrl('/assets/models/player/traits/body_bikerjacket_default.fbx') },
  { id: 'body_vote4pudgy_default', type: TRAIT_TYPE.Body, label: 'Vote 4 Pudgy', fbx: assetUrl('/assets/models/player/traits/body_vote4pudgy_default.fbx') },
  { id: 'body_basketballjersey_common', type: TRAIT_TYPE.Body, label: 'Basketball Jersey', fbx: assetUrl('/assets/models/player/traits/body_basketballjersey_common.fbx') },

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
