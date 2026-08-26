import assetListData from './assetListPlacements.json';
import { INTRO } from './introConfig.js';
import { LEVEL_PROPS, LEVEL_PROP_TRANSFORM } from './levelsConfig.js';
import { NPC_MODELS } from './npcConfig.js';

const WORLD_MAP_ID = 'WorldMap';
const PLAZA_ID = 'Individual_PenguPlaza_02';
const INTRO_ID = INTRO.id;
const DEFAULT_ID = INTRO_ID;

function toLabel(name) {
  return name
    .replace(/^(Individual_|Environment_|Asset_|Extras_|Anim_|Animation_|Collider_|NPC_)/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+0?(\d+)$/, ' $1')
    .trim();
}

function townLabel(town) {
  return town.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function npcLabel(_modelKey, url) {
  const file = url.split('/').pop()?.replace(/\.fbx$/i, '') || _modelKey;
  return toLabel(file);
}

/** Town preview islands (Individual_* + Environment_*). */
function isIndividualTown(name) {
  return name.startsWith('Individual_') || name.startsWith('Environment_');
}

/**
 * Scene dropdown:
 * 0. Intro
 * 1. Neighborhoods — continuous World Map
 * 2. Individuals — standalone town islands
 * 3. NPCs — character model previews
 * 4. Levels — quest / collectible props
 * 5. Extras — individual prop previews
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
      isIntro: false,
      isTheBerg: false,
      isAssetList: false,
      isPenguPlaza: false,
      isNpcPreview: false,
      group: 'individuals',
    }));

  const npcs = Object.entries(NPC_MODELS)
    .map(([key, url]) => ({
      id: `NPC_${key}`,
      label: npcLabel(key, url),
      modelKey: key,
      placement: null,
      isIntro: false,
      isTheBerg: false,
      isAssetList: false,
      isPenguPlaza: false,
      isNpcPreview: true,
      group: 'npcs',
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const levels = LEVEL_PROPS.map((prop) => ({
    id: `Level_${prop.town}_${prop.name}`,
    label: `${townLabel(prop.town)} · ${toLabel(prop.name)}`,
    placement: {
      name: prop.name,
      url: prop.url,
      position: { x: 0, y: 0, z: 0 },
      ...LEVEL_PROP_TRANSFORM,
    },
    isIntro: false,
    isTheBerg: false,
    isAssetList: false,
    isPenguPlaza: false,
    isNpcPreview: false,
    group: 'levels',
  }));

  const extras = placements
    .filter((p) => !isIndividualTown(p.name))
    .sort((a, b) => toLabel(a.name).localeCompare(toLabel(b.name)))
    .map((p) => ({
      id: p.name,
      label: toLabel(p.name),
      placement: byName.get(p.name),
      isIntro: false,
      isTheBerg: false,
      isAssetList: false,
      isPenguPlaza: false,
      isNpcPreview: false,
      group: 'extras',
    }));

  const intro = {
    id: INTRO_ID,
    label: 'Intro',
    placement: null,
    isIntro: true,
    isTheBerg: false,
    isAssetList: false,
    isPenguPlaza: false,
    isNpcPreview: false,
    group: 'intro',
  };

  const worldMap = {
    id: WORLD_MAP_ID,
    label: 'World Map',
    placement: null,
    isIntro: false,
    isTheBerg: true,
    isAssetList: false,
    isPenguPlaza: false,
    isNpcPreview: false,
    group: 'neighborhoods',
  };

  const groups = [
    {
      id: 'intro',
      label: 'Intro',
      options: [intro],
    },
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
      id: 'npcs',
      label: 'NPCs',
      options: npcs,
    },
    {
      id: 'levels',
      label: 'Levels',
      options: levels,
    },
    {
      id: 'extras',
      label: 'Extras',
      options: extras,
    },
  ];

  return {
    groups,
    flat: groups.flatMap((g) => g.options),
    /** Playable town islands — used by the 场景 card grid. */
    individuals,
    /** Everything except individuals — used by the 其他 dropdown. */
    otherGroups: groups.filter((g) => g.id !== 'individuals'),
  };
}

export const DEFAULT_SCENE_ID = DEFAULT_ID;
export const INTRO_SCENE_ID = INTRO_ID;
export const THE_BERG_SCENE_ID = WORLD_MAP_ID;
