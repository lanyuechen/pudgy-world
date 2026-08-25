import assetListData from './assetListPlacements.json';

const THE_BERG_ID = 'TheBerg';
const ASSET_LIST_ID = 'Asset_List';
const PLAZA_ID = 'Individual_PenguPlaza_02';
const DEFAULT_ID = THE_BERG_ID;

function toLabel(name) {
  return name
    .replace(/^(Individual_|Environment_|Asset_|Extras_|Anim_|Animation_|Collider_)/, '')
    .replace(/_/g, ' ')
    .trim();
}

function isNeighborhood(name) {
  return (
    name.startsWith('Individual_') ||
    name.startsWith('Environment_')
  );
}

/**
 * Dropdown options:
 * TheBerg (continuous map) → Asset_List catalog → single neighborhoods → extras.
 */
export function getSceneOptions() {
  const placements = assetListData.placements;
  const byName = new Map(placements.map((p) => [p.name, p]));

  const neighborhoods = placements
    .filter((p) => isNeighborhood(p.name))
    .sort((a, b) => {
      if (a.name === PLAZA_ID) return -1;
      if (b.name === PLAZA_ID) return 1;
      return toLabel(a.name).localeCompare(toLabel(b.name));
    });

  const extras = placements
    .filter((p) => !isNeighborhood(p.name))
    .sort((a, b) => toLabel(a.name).localeCompare(toLabel(b.name)));

  const theBerg = {
    id: THE_BERG_ID,
    label: 'TheBerg (World Map)',
    placement: null,
    isTheBerg: true,
    isAssetList: false,
    isPenguPlaza: false,
  };

  const assetList = {
    id: ASSET_LIST_ID,
    label: 'Asset List (Catalog)',
    placement: null,
    isTheBerg: false,
    isAssetList: true,
    isPenguPlaza: false,
  };

  return [
    theBerg,
    assetList,
    ...neighborhoods.map((p) => ({
      id: p.name,
      label: toLabel(p.name),
      placement: byName.get(p.name),
      isTheBerg: false,
      isAssetList: false,
      isPenguPlaza: p.name === PLAZA_ID,
    })),
    ...extras.map((p) => ({
      id: p.name,
      label: toLabel(p.name),
      placement: byName.get(p.name),
      isTheBerg: false,
      isAssetList: false,
      isPenguPlaza: false,
    })),
  ];
}

export const DEFAULT_SCENE_ID = DEFAULT_ID;
export const THE_BERG_SCENE_ID = THE_BERG_ID;
export const ASSET_LIST_SCENE_ID = ASSET_LIST_ID;
