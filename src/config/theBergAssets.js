import { assetUrl } from './assetUrl.js';

/**
 * World Map assemblies — each version only includes pieces that exist for that set.
 * Neighborhood tiles are authored in shared Cinema4D world space (cm) on TheBerg;
 * load them together (identity). Individual_* islands are standalone and do not edge-match.
 */

function piece(name, file) {
  return { name, url: assetUrl(`/assets/models/neighborhoods/${file}`) };
}

function lockedPiece(name, file) {
  return { name, url: assetUrl(`/assets/models/neighborhoods/locked/${file}`) };
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

/**
 * V_03 set — only towns that have a _03 (or V_03) piece. No _02 mix-ins.
 * CoralCove is new in this set; PudgyStone / RogCity have no _03 yet.
 */
export const THE_BERG_MAP_V03 = {
  id: 'WorldMap_03',
  label: '世界地图(World Map) 3',
  version: 3,
  camera: THE_BERG_CAMERA,
  assets: [
    piece('TheBerg_V_03', 'TheBerg_V_03.fbx'),
    piece('Berg_FillerAssets_03', 'Berg_FillerAssets_03.fbx'),
    piece('Neighborhood_BearTown_03', 'Neighborhood_BearTown_03.fbx'),
    piece('Neighborhood_BeverlyChills_03', 'Neighborhood_BeverlyChills_03.fbx'),
    piece('Neighborhood_BowlCutBeach_03', 'Neighborhood_BowlCutBeach_03.fbx'),
    piece('Neighborhood_CoralCove_03', 'Neighborhood_CoralCove_03.fbx'),
    piece('Neighborhood_IceBreakerAlley_03', 'Neighborhood_IceBreakerAlley_03.fbx'),
    piece('Neighborhood_JamboreeSquare_03', 'Neighborhood_JamboreeSquare_03.fbx'),
    piece('Neighborhood_NothingHappeningHereSquare_03', 'Neighborhood_NothingHappeningHereSquare_03.fbx'),
    piece('Neighborhood_PenguPlaza_03', 'Neighborhood_PenguPlaza_03.fbx'),
    piece('Neighborhood_PoomPoomPalace_03', 'Neighborhood_PoomPoomPalace_03.fbx'),
    piece('Neighborhood_PudgyPeaks_03', 'Neighborhood_PudgyPeaks_03.fbx'),
    piece('Neighborhood_PudgyPort_03', 'Neighborhood_PudgyPort_03.fbx'),
    piece('Neighborhood_SalmonSettlement_03', 'Neighborhood_SalmonSettlement_03.fbx'),
  ],
};

/**
 * Locked town tiles (unexplored look) — V_02-era locked meshes + Berg V_02 base.
 * Only pieces that exist under neighborhoods/locked/ (no unlocked mix-ins).
 */
export const THE_BERG_MAP_LOCKED_02 = {
  id: 'WorldMap_Locked_02',
  label: '世界地图锁定(World Map Locked) 2',
  version: 2,
  locked: true,
  camera: THE_BERG_CAMERA,
  assets: [
    piece('TheBerg_V_02', 'TheBerg_V_02.fbx'),
    piece('Berg_FillerAssets_01', 'Berg_FillerAssets_01.fbx'),
    lockedPiece('Neighborhood_BearTownLocked', 'Neighborhood_BearTownLocked.fbx'),
    lockedPiece('Neighborhood_BowlcutBeachLocked', 'Neighborhood_BowlcutBeachLocked.fbx'),
    lockedPiece('Neighborhood_IceBreakerAlleyLocked', 'Neighborhood_IceBreakerAlleyLocked.fbx'),
    lockedPiece('Neighborhood_JamboreeSquareLocked', 'Neighborhood_JamboreeSquareLocked.fbx'),
    lockedPiece('Neighborhood_NothingHappeningHereSquareLocked', 'Neighborhood_NothingHappeningHereSquareLocked.fbx'),
    lockedPiece('NeighBorhood_PenguPlazaLocked', 'NeighBorhood_PenguPlazaLocked.fbx'),
    lockedPiece('Neighborhood_PoomPoomPalaceLocked', 'Neighborhood_PoomPoomPalaceLocked.fbx'),
    lockedPiece('Neighborhood_PudgyPeaksLocked', 'Neighborhood_PudgyPeaksLocked.fbx'),
    lockedPiece('Neighborhood_PudgyPortLocked', 'Neighborhood_PudgyPortLocked.fbx'),
    lockedPiece('Neighborhood_PudgyStoneLocked', 'Neighborhood_PudgyStoneLocked.fbx'),
    lockedPiece('Neighborhood_SalmonSettlementLocked', 'Neighborhood_SalmonSettlementLocked.fbx'),
  ],
};

/**
 * Locked town tiles — _Locked_03 set + Berg V_03 base.
 */
export const THE_BERG_MAP_LOCKED_03 = {
  id: 'WorldMap_Locked_03',
  label: '世界地图锁定(World Map Locked) 3',
  version: 3,
  locked: true,
  camera: THE_BERG_CAMERA,
  assets: [
    piece('TheBerg_V_03', 'TheBerg_V_03.fbx'),
    piece('Berg_FillerAssets_03', 'Berg_FillerAssets_03.fbx'),
    lockedPiece('Neighborhood_BeverlyChills_Locked_03', 'Neighborhood_BeverlyChills_Locked_03.fbx'),
    lockedPiece('Neighborhood_BowlCutBeach_Locked_03', 'Neighborhood_BowlCutBeach_Locked_03.fbx'),
    lockedPiece('Neighborhood_CoralCove_Locked_03', 'Neighborhood_CoralCove_Locked_03.fbx'),
    lockedPiece('Neighborhood_JamboreeSquare_Locked_03', 'Neighborhood_JamboreeSquare_Locked_03.fbx'),
    lockedPiece('Neighborhood_PenguPlazaLocked_03', 'Neighborhood_PenguPlazaLocked_03.fbx'),
    lockedPiece('Neighborhood_PudgyPeaks_Locked_03', 'Neighborhood_PudgyPeaks_Locked_03.fbx'),
    lockedPiece('Neighborhood_SalmonSettlementLocked_03', 'Neighborhood_SalmonSettlementLocked_03.fbx'),
  ],
};

/** All World Map assemblies (scene dropdown order). */
export const THE_BERG_MAPS = [
  THE_BERG_MAP_V02,
  THE_BERG_MAP_V03,
  THE_BERG_MAP_LOCKED_02,
  THE_BERG_MAP_LOCKED_03,
];

/** @deprecated Prefer THE_BERG_MAP_V02.assets — kept for any leftover imports. */
export const THE_BERG_ASSETS = THE_BERG_MAP_V02.assets;
