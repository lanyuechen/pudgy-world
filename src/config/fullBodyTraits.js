/**
 * Unity TraitType.FullBody — whole outfits that replace Head + Body slots.
 * Unity assets in this repo use Body (type 3) for these; reclassify by id pattern.
 */
const FULL_BODY_ID_PATTERN =
  /(bodysuit|costume|uniform|astronaut|scuba|hazmat|suit_epic|suit_rare|ghost_epic)/i;

/** Slots cleared when equipping FullBody (matches TraitEquipper.cs). */
export const FULL_BODY_CLEARS = ['head', 'body'];

/** Equipping these clears an active FullBody (matches TraitEquipper.cs). */
export const CLEARS_FULL_BODY = ['head', 'body'];

export function isFullBodyTraitId(id) {
  return FULL_BODY_ID_PATTERN.test(id);
}

/** Map Unity-synced cosmetic type → runtime slot (Body → FullBody when applicable). */
export function resolveCosmeticTraitType(id, syncedType) {
  if (syncedType === 'fullBody') return 'fullBody';
  if (syncedType === 'body' && isFullBodyTraitId(id)) return 'fullBody';
  return syncedType;
}

/** Types whose UI should refresh after equipping `type` (conflict side-effects). */
export function getConflictSyncTypes(type) {
  if (type === 'fullBody') return [...FULL_BODY_CLEARS];
  if (CLEARS_FULL_BODY.includes(type)) return ['fullBody'];
  return [];
}
