import assetListData from './assetListPlacements.json';

const DEFAULT_ID = 'Individual_PenguPlaza_02';

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
 * Dropdown options from Asset_List placements.
 * Neighborhoods first (PenguPlaza default), then extras/props.
 */
export function getSceneOptions() {
  const placements = assetListData.placements;
  const byName = new Map(placements.map((p) => [p.name, p]));

  const neighborhoods = placements
    .filter((p) => isNeighborhood(p.name))
    .sort((a, b) => {
      if (a.name === DEFAULT_ID) return -1;
      if (b.name === DEFAULT_ID) return 1;
      return toLabel(a.name).localeCompare(toLabel(b.name));
    });

  const extras = placements
    .filter((p) => !isNeighborhood(p.name))
    .sort((a, b) => toLabel(a.name).localeCompare(toLabel(b.name)));

  return [...neighborhoods, ...extras].map((p) => ({
    id: p.name,
    label: toLabel(p.name),
    placement: byName.get(p.name),
    isPenguPlaza: p.name === DEFAULT_ID,
  }));
}

export const DEFAULT_SCENE_ID = DEFAULT_ID;
