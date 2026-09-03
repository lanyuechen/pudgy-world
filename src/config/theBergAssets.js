import { assetUrl } from './assetUrl.js';

/**
 * World Map assemblies — each version only includes pieces that exist for that set.
 * Neighborhood tiles are authored in shared Cinema4D world space (cm) on TheBerg;
 * load them together (identity). Individual_* islands are standalone and do not edge-match.
 */

function piece(name, file) {
  return { name, url: assetUrl(`/assets/models/neighborhoods/${file}`) };
}

/** Shared overview camera (~321×494 m). */
export const THE_BERG_CAMERA = {
  lookAt: { x: -40, y: 20, z: -100 },
  orbitDistance: 520,
  orbitPitch: 40,
  orbitYaw: 35,
  far: 4000,
  minDistance: 20,
  maxDistance: 1500,
};

/**
 * V_02 set (Unity Neighborhoods_V_02 + TheBerg_V_02).
 * Filenames keep Unity typos (NeighBorhood / Nighborhood).
 */
export const THE_BERG_MAP_V02 = {
  id: 'WorldMap_02',
  label: '世界地图(World Map) 2',
  version: 2,
  camera: THE_BERG_CAMERA,
  assets: [
    piece('TheBerg_V_02', 'TheBerg_V_02.fbx'),
    piece('Berg_FillerAssets_01', 'Berg_FillerAssets_01.fbx'),
    piece('Neighborhood_BearTown_02', 'Neighborhood_BearTown_02.fbx'),
    piece('Neighborhood_BeverlyChills_02', 'Neighborhood_BeverlyChills_02.fbx'),
    piece('Neighborhood_BowlcutBeach_02', 'Neighborhood_BowlcutBeach_02.fbx'),
    piece('Nighborhood_IceBreakerAlley_02', 'Nighborhood_IceBreakerAlley_02.fbx'),
    piece('Neighborhood_JamboreeSquare_02', 'Neighborhood_JamboreeSquare_02.fbx'),
    piece('Neighborhood_NothingHappeningHereSquare_02', 'Neighborhood_NothingHappeningHereSquare_02.fbx'),
    piece('NeighBorhood_PenguPlaza_02', 'NeighBorhood_PenguPlaza_02.fbx'),
    piece('Neighborhood_PoomPoomPalace_02', 'Neighborhood_PoomPoomPalace_02.fbx'),
    piece('Neighborhood_PudgyPeaks_02', 'Neighborhood_PudgyPeaks_02.fbx'),
    piece('Neighborhood_PudgyPort_02', 'Neighborhood_PudgyPort_02.fbx'),
    piece('Neighborhood_PudgyStone_02', 'Neighborhood_PudgyStone_02.fbx'),
    piece('Neighborhood_RogCity_02', 'Neighborhood_RogCity_02.fbx'),
    piece('Neighborhood_SalmonSettlement_02', 'Neighborhood_SalmonSettlement_02.fbx'),
  ],
};

/** All World Map assemblies (scene dropdown order). */
export const THE_BERG_MAPS = [THE_BERG_MAP_V02];

/** @deprecated Prefer THE_BERG_MAP_V02.assets — kept for any leftover imports. */
export const THE_BERG_ASSETS = THE_BERG_MAP_V02.assets;
