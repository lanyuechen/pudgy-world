/** @typedef {'volley' | 'meteor' | 'titan'} SkillId */

/** @type {Record<SkillId, { id: SkillId, name: string, description: string, cooldown: number }>} */
export const SKILLS = Object.freeze({
  volley: {
    id: 'volley',
    name: '万箭齐发',
    description: '2 秒内连续向前方扔出 10 个雪球，以当前弹道为基准，稍有发散。',
    cooldown: 5,
    duration: 2,
    count: 10,
    spreadYawDeg: 6,
    spreadPitchDeg: 3.5,
  },
  meteor: {
    id: 'meteor',
    name: '陨星坠落',
    description: '以目标为中心、半径 2 米范围内，随机从天而降 10 个雪球，持续 2 秒。',
    cooldown: 5,
    duration: 2,
    count: 10,
    radius: 2,
    dropHeight: 18,
    /** Horizontal drift while falling (m/s); keep low so landings stay in radius. */
    driftSpeed: 0.35,
  },
  titan: {
    id: 'titan',
    name: '泰山压顶',
    description: '扔出一个 10 倍大小的雪球，伤害 ×10。',
    cooldown: 5,
    sizeScale: 10,
    damageScale: 10,
  },
});

/** @type {SkillId[]} */
export const SKILL_IDS = ['volley', 'meteor', 'titan'];
