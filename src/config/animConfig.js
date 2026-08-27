import { assetUrl } from './assetUrl.js';

/**
 * Animation FBX catalog under public/assets/models/animations/.
 * Grouped by source folder for the 动画 config tab.
 * Only includes character clip FBXs supported by Three.js (>= 6400).
 * Prop clips (doors / seagull / bus) live in animations/Extras/ but are
 * scene assets, not player-preview clips.
 */

/** @typedef {{ id: string, label: string, group: string, url: string, file: string }} AnimOption */

const GROUP_DEFS = [
  { id: 'pudgy', label: '玩家(Pudgy)', dir: 'Pudgy_Animations' },
  { id: 'npc', label: 'NPC', dir: 'NPC_Animations' },
  { id: 'v1-player', label: 'V1 · 玩家', dir: 'V1/Player_Anim' },
  { id: 'v1-fishing', label: 'V1 · 钓鱼', dir: 'V1/Fishing_Anim' },
  { id: 'v1-regular', label: 'V1 · Regular', dir: 'V1/Fishing_Anim/_RegularAnimation_FIXED' },
];

/** Static file lists (keep in sync with public/assets/models/animations/). */
const FILES_BY_DIR = {
  Pudgy_Animations: [
    'Anim_AFK1_002.fbx',
    'Anim_AFK2_002.fbx',
    'Anim_AFK3_002.fbx',
    'Anim_Air_002.fbx',
    'Anim_BellySlide_002.fbx',
    'Anim_FishingCast_002.fbx',
    'Anim_FishingHoldingRodIdle_002.fbx',
    'Anim_FishingIdle_002.fbx',
    'Anim_FishingStruggling_002.fbx',
    'Anim_HoldingFish_002.fbx',
    'Anim_Idle_002.fbx',
    'Anim_Throw_002.fbx',
    'Anim_Walk_002.fbx',
  ],
  NPC_Animations: [
    'Anim_ArcadeAnimation_02.fbx',
    'Anim_BonkoIdle_01.fbx',
    'Anim_BonkoTalk_01.fbx',
    'Anim_DJ_Idle_02.fbx',
    'Anim_Idle_01_02.fbx',
    'Anim_Idle_02_02.fbx',
    'Anim_Idle_03_02.fbx',
    'Anim_Idle_04_02.fbx',
    'Anim_NPC_SittingIdle_01_02.fbx',
    'Anim_NPC_SittingIdle_02_02.fbx',
    'Anim_NPC_SittingTalk_01_02.fbx',
    'Anim_NPC_SittingTalk_02_02.fbx',
    'Anim_NPC_TalkConfused_02.fbx',
    'Anim_NPC_TalkHappy_02.fbx',
    'Anim_NPC_TalkSad_02.fbx',
    'Anim_NPC_Talk_02.fbx',
    'Anim_NPC_WalkStyle_01_02.fbx',
    'Anim_NPC_WalkStyle_02_02.fbx',
    'Anim_NPC_WalkStyle_03_02.fbx',
    'Anim_NPC_WalkStyle_04_02.fbx',
    'Anim_Wave_02.fbx',
  ],
  'V1/Player_Anim': [
    'Anim_Idle_Groovy_01.fbx',
    'Anim_Idle_Scared_01.fbx',
    'Anim_Idle_Sleepy_01.fbx',
    'Anim_Idle_StandSit_01.fbx',
    'Anim_InAir_02.fbx',
    'Anim_Jump_02.fbx',
    'Anim_React_01.fbx',
    'Anim_Slide_01.fbx',
    'Anim_Throw_01.fbx',
  ],
  'V1/Fishing_Anim': [
    'Anim_FishingCast_02.fbx',
    'Anim_FishingFishAlternate_01.fbx',
    'Anim_FishingFish_02.fbx',
    'Anim_FishingHold_02.fbx',
    'Anim_FishingIdle_02.fbx',
    'Anim_FishingPulling_01.fbx',
  ],
  'V1/Fishing_Anim/_RegularAnimation_FIXED': [
    'Anim_AFK_02.fbx',
    'Anim_Idle_02.fbx',
    'Anim_Idle_Groovy_02.fbx',
    'Anim_Idle_Scared_02.fbx',
    'Anim_Idle_Sleepy_02.fbx',
    'Anim_Idle_StandSit_02.fbx',
    'Anim_InAir_02.fbx',
    'Anim_Slide_02.fbx',
    'Anim_Throw_02.fbx',
    'Anim_Walk_02.fbx',
  ],
};

function animLabel(file) {
  return file
    .replace(/\.fbx$/i, '')
    .replace(/^Anim_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+0+(\d+)\b/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @returns {{
 *   groups: Array<{ id: string, label: string, options: AnimOption[] }>,
 *   flat: AnimOption[],
 *   byId: Map<string, AnimOption>,
 * }}
 */
export function getAnimOptions() {
  /** @type {Array<{ id: string, label: string, options: AnimOption[] }>} */
  const groups = [];
  /** @type {AnimOption[]} */
  const flat = [];

  for (const def of GROUP_DEFS) {
    const files = FILES_BY_DIR[def.dir] ?? [];
    const options = files.map((file) => {
      const id = `${def.id}/${file.replace(/\.fbx$/i, '')}`;
      /** @type {AnimOption} */
      const opt = {
        id,
        label: animLabel(file),
        group: def.id,
        file,
        url: assetUrl(`/assets/models/animations/${def.dir}/${file}`),
      };
      flat.push(opt);
      return opt;
    });
    if (options.length) {
      groups.push({ id: def.id, label: def.label, options });
    }
  }

  return {
    groups,
    flat,
    byId: new Map(flat.map((o) => [o.id, o])),
  };
}
