import assetListData from './assetListPlacements.json';

const WORLD_MAP_ID = 'TheBerg';
const EXTRAS_CATALOG_ID = 'Asset_List';
const PLAZA_ID = 'Individual_PenguPlaza_02';
const DEFAULT_ID = WORLD_MAP_ID;

function toLabel(name) {
  return name
    .replace(/^(Individual_|Environment_|Asset_|Extras_|Anim_|Animation_|Collider_)/, '')
    .replace(/_/g, ' ')
    .trim();
}

/** Town preview islands (Individual_* + Environment_*). */
function isIndividualTown(name) {
  return name.startsWith('Individual_') || name.startsWith('Environment_');
}

/**
 * Scene dropdown in three groups matching public/assets/models layout:
 * 1. Neighborhoods — continuous TheBerg world map
 * 2. Individuals — standalone town islands
 * 3. Extras — props + full catalog layout
 *
 * @returns {{ groups: Array<{ id: string, label: string, options: object[] }>, flat: object[] }}
 */
export function getSceneOptions() {
  const placements = assetListData.placements;
  const byName = new Map(placements.map((p) => [p.name, p]));

  const individuals = placements
    .filter((p) => isIndividualTown(p.name))
    .sort((a, b) => {
      if (a.name === PLAZA_ID) return -1;
      if (b.name === PLAZA_ID) return 1;
      return toLabel(a.name).localeCompare(toLabel(b.name));
    })
    .map((p) => ({
      id: p.name,
      label: toLabel(p.name),
      placement: byName.get(p.name),
      isTheBerg: false,
      isAssetList: false,
      isPenguPlaza: p.name === PLAZA_ID,
      group: 'individuals',
    }));

  const extras = placements
    .filter((p) => !isIndividualTown(p.name))
    .sort((a, b) => toLabel(a.name).localeCompare(toLabel(b.name)))
    .map((p) => ({
      id: p.name,
      label: toLabel(p.name),
      placement: byName.get(p.name),
      isTheBerg: false,
      isAssetList: false,
      isPenguPlaza: false,
      group: 'extras',
    }));

  const worldMap = {
    id: WORLD_MAP_ID,
    label: 'TheBerg (World Map)',
    placement: null,
    isTheBerg: true,
    isAssetList: false,
    isPenguPlaza: false,
    group: 'neighborhoods',
  };

  const extrasCatalog = {
    id: EXTRAS_CATALOG_ID,
    label: 'Catalog (All placements)',
    placement: null,
    isTheBerg: false,
    isAssetList: true,
    isPenguPlaza: false,
    group: 'extras',
  };

  const groups = [
    {
      id: 'neighborhoods',
      label: 'Neighborhoods',
      options: [worldMap],
    },
    {
      id: 'individuals',
      label: 'Individuals',
      options: individuals,
    },
    {
      id: 'extras',
      label: 'Extras',
      options: [extrasCatalog, ...extras],
    },
  ];

  return {
    groups,
    flat: groups.flatMap((g) => g.options),
  };
}

export const DEFAULT_SCENE_ID = DEFAULT_ID;
export const THE_BERG_SCENE_ID = WORLD_MAP_ID;
export const ASSET_LIST_SCENE_ID = EXTRAS_CATALOG_ID;
