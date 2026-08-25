import { assetUrl } from './assetUrl.js';

/**
 * Neighborhoods_V_02 pieces are authored in shared Cinema4D world space (cm)
 * on TheBerg — load them together (identity) to form the continuous map.
 * Individual_* Asset_List FBXs are standalone islands and do not edge-match.
 */
export const THE_BERG_ASSETS = [
  { name: 'TheBerg_V_02', url: assetUrl('/assets/models/the-berg/TheBerg_V_02.fbx') },
  { name: 'Berg_FillerAssets_01', url: assetUrl('/assets/models/the-berg/Berg_FillerAssets_01.fbx') },
  { name: 'Neighborhood_BearTown_02', url: assetUrl('/assets/models/the-berg/Neighborhood_BearTown_02.fbx') },
  { name: 'Neighborhood_BeverlyChills_02', url: assetUrl('/assets/models/the-berg/Neighborhood_BeverlyChills_02.fbx') },
  { name: 'Neighborhood_BowlcutBeach_02', url: assetUrl('/assets/models/the-berg/Neighborhood_BowlcutBeach_02.fbx') },
  { name: 'Nighborhood_IceBreakerAlley_02', url: assetUrl('/assets/models/the-berg/Nighborhood_IceBreakerAlley_02.fbx') },
  { name: 'Neighborhood_JamboreeSquare_02', url: assetUrl('/assets/models/the-berg/Neighborhood_JamboreeSquare_02.fbx') },
  { name: 'Neighborhood_NothingHappeningHereSquare_02', url: assetUrl('/assets/models/the-berg/Neighborhood_NothingHappeningHereSquare_02.fbx') },
  { name: 'NeighBorhood_PenguPlaza_02', url: assetUrl('/assets/models/the-berg/NeighBorhood_PenguPlaza_02.fbx') },
  { name: 'Neighborhood_PoomPoomPalace_02', url: assetUrl('/assets/models/the-berg/Neighborhood_PoomPoomPalace_02.fbx') },
  { name: 'Neighborhood_PudgyPeaks_02', url: assetUrl('/assets/models/the-berg/Neighborhood_PudgyPeaks_02.fbx') },
  { name: 'Neighborhood_PudgyPort_02', url: assetUrl('/assets/models/the-berg/Neighborhood_PudgyPort_02.fbx') },
  { name: 'Neighborhood_PudgyStone_02', url: assetUrl('/assets/models/the-berg/Neighborhood_PudgyStone_02.fbx') },
  { name: 'Neighborhood_RogCity_02', url: assetUrl('/assets/models/the-berg/Neighborhood_RogCity_02.fbx') },
  { name: 'Neighborhood_SalmonSettlement_02', url: assetUrl('/assets/models/the-berg/Neighborhood_SalmonSettlement_02.fbx') },
];

/** Overview camera for the assembled berg (~321×494 m). */
export const THE_BERG_CAMERA = {
  lookAt: { x: -40, y: 20, z: -100 },
  orbitDistance: 520,
  orbitPitch: 40,
  orbitYaw: 35,
  far: 4000,
  minDistance: 20,
  maxDistance: 1500,
};
