import { assetUrl } from './assetUrl.js';

/** Shared NPC animation clips (standard pudgy skeleton). */
export const NPC_ANIMS = {
  idle1: assetUrl('/assets/models/npcs/anims/Anim_Idle_01_02.fbx'),
  idle2: assetUrl('/assets/models/npcs/anims/Anim_Idle_02_02.fbx'),
  idle3: assetUrl('/assets/models/npcs/anims/Anim_Idle_03_02.fbx'),
  idle4: assetUrl('/assets/models/npcs/anims/Anim_Idle_04_02.fbx'),
  wave: assetUrl('/assets/models/npcs/anims/Anim_Wave_02.fbx'),
  talk: assetUrl('/assets/models/npcs/anims/Anim_NPC_Talk_02.fbx'),
  talkHappy: assetUrl('/assets/models/npcs/anims/Anim_NPC_TalkHappy_02.fbx'),
  talkConfused: assetUrl('/assets/models/npcs/anims/Anim_NPC_TalkConfused_02.fbx'),
  walk1: assetUrl('/assets/models/npcs/anims/Anim_NPC_WalkStyle_01_02.fbx'),
  walk2: assetUrl('/assets/models/npcs/anims/Anim_NPC_WalkStyle_02_02.fbx'),
};

export const NPC_MODELS = {
  adam: assetUrl('/assets/models/npcs/NPC_Adam.fbx'),
  bogfather: assetUrl('/assets/models/npcs/NPC_Bogfather.fbx'),
  arcticAnnie: assetUrl('/assets/models/npcs/NPC_ArcticAnnie.fbx'),
  bean: assetUrl('/assets/models/npcs/NPC_Bean.fbx'),
  disco: assetUrl('/assets/models/npcs/NPC_Disco.fbx'),
  breezy: assetUrl('/assets/models/npcs/NPC_BreezyBeakBenny.fbx'),
  evie: assetUrl('/assets/models/npcs/NPC_Evie.fbx'),
  bowlcut: assetUrl('/assets/models/npcs/NPC_Bowlcut_Var1.fbx'),
};

/**
 * @typedef {{
 *   id: string,
 *   model: keyof typeof NPC_MODELS,
 *   skeleton?: 'standard',
 *   clips: string[],
 *   position: {x:number,y:number,z:number},
 *   yawDeg?: number,
 *   wanderRadius?: number,
 * }} NpcPlacement
 */

/** NPCs for standalone Individual islands / Pengu Plaza.
 * position.x/z are offsets from the island AABB center (not world origin).
 * Include a walk* clip to enable wander locomotion.
 */
export const INDIVIDUAL_NPCS = [
  {
    id: 'breezy',
    model: 'breezy',
    skeleton: 'standard',
    clips: ['walk1', 'wave', 'idle1', 'talk'],
    position: { x: 2.5, y: 0, z: 2 },
    yawDeg: 210,
    wanderRadius: 5,
  },
  {
    id: 'evie',
    model: 'evie',
    skeleton: 'standard',
    clips: ['walk2', 'talkHappy', 'idle3', 'wave'],
    position: { x: -2.5, y: 0, z: 1.5 },
    yawDeg: 140,
    wanderRadius: 5,
  },
  {
    id: 'bowlcut',
    model: 'bowlcut',
    skeleton: 'standard',
    clips: ['walk1', 'idle2', 'talk'],
    position: { x: 1.5, y: 0, z: -2.5 },
    yawDeg: 20,
    wanderRadius: 5,
  },
];
