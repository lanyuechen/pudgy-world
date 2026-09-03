/**
 * Player profile + combat/move attributes (0–100).
 *
 * - strength → throw distance (launch speed scale)
 * - agility → move speed scale
 * - accuracy → elevation jitter (100 = exact; 50 = ±2° max)
 * - vitality → max HP (0 → 100, 100 → 300)
 * - damage → snowball base damage (0 → 20, 100 → 100)
 */

/** @typedef {{ name: string, title: string, strength: number, agility: number, accuracy: number, vitality: number, damage: number }} PlayerStats */

/** @type {Readonly<PlayerStats>} */
export const PLAYER_STATS_DEFAULTS = Object.freeze({
  name: 'Pudgy',
  title: '探险者',
  strength: 50,
  agility: 50,
  accuracy: 50,
  vitality: 50,
  damage: 50,
});

/** Live player stats (mutable for future upgrades). */
export const playerStats = {
  name: PLAYER_STATS_DEFAULTS.name,
  title: PLAYER_STATS_DEFAULTS.title,
  strength: PLAYER_STATS_DEFAULTS.strength,
  agility: PLAYER_STATS_DEFAULTS.agility,
  accuracy: PLAYER_STATS_DEFAULTS.accuracy,
  vitality: PLAYER_STATS_DEFAULTS.vitality,
  damage: PLAYER_STATS_DEFAULTS.damage,
};

function clamp01to100(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

/** @param {number} strength 0–100 → ~0.5×–1.5× (50 = baseline) */
export function throwSpeedMultiplier(strength = playerStats.strength) {
  return 0.5 + clamp01to100(strength) / 100;
}

/** @param {number} agility 0–100 → ~0.5×–1.5× (50 = baseline) */
export function moveSpeedMultiplier(agility = playerStats.agility) {
  return 0.5 + clamp01to100(agility) / 100;
}

/**
 * Max random elevation offset in degrees.
 * accuracy 100 → 0°; accuracy 50 → 2°; accuracy 0 → 4°.
 * @param {number} [accuracy]
 */
export function accuracyMaxOffsetDeg(accuracy = playerStats.accuracy) {
  return 4 * (1 - clamp01to100(accuracy) / 100);
}

/**
 * Max HP from vitality: 0 → 100, 100 → 300 (linear).
 * @param {number} [vitality]
 */
export function playerMaxHp(vitality = playerStats.vitality) {
  return Math.round(100 + clamp01to100(vitality) * 2);
}

/**
 * Snowball base damage from damage stat: 0 → 20, 100 → 100 (linear).
 * @param {number} [damage]
 */
export function playerSnowballDamage(damage = playerStats.damage) {
  return Math.round(20 + clamp01to100(damage) * 0.8);
}

/** @returns {PlayerStats} */
export function getPlayerStats() {
  return {
    name: playerStats.name,
    title: playerStats.title,
    strength: playerStats.strength,
    agility: playerStats.agility,
    accuracy: playerStats.accuracy,
    vitality: playerStats.vitality,
    damage: playerStats.damage,
  };
}

/**
 * @param {'strength' | 'agility' | 'accuracy' | 'vitality' | 'damage'} key
 * @param {number} value
 * @returns {PlayerStats}
 */
export function setPlayerStat(key, value) {
  if (
    key === 'strength' ||
    key === 'agility' ||
    key === 'accuracy' ||
    key === 'vitality' ||
    key === 'damage'
  ) {
    playerStats[key] = clamp01to100(value);
  }
  return getPlayerStats();
}
