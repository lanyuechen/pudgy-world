/**
 * FishingHole + Debug.unity TestFishingHole + PlayerInteract defaults.
 */
export const FISHING = {
  /** PlayerInteract._maxInteractDistance */
  maxInteractDistance: 7.5,
  /** LocalPlayerTrigger child SphereCollider */
  playerRangeRadius: 2.25,
  /** Root interact SphereCollider */
  interactRadius: 1.5,
  /** FishingHole._outOfRangeColor / _withinRangeColor */
  outOfRangeColor: 0x75b6fb,
  withinRangeColor: 0xaef0ff,
  /** Visual disc diameter (Unity local scale 3 on default cylinder → ~3m) */
  discDiameter: 3,

  /** Step → player clip */
  stepClips: {
    idle: 'fishingIdle',
    cast: 'fishingCast',
    hold: 'fishingHoldingRodIdle',
    struggle: 'fishingStruggling',
  },
  /**
   * FishingCast / HoldingFish in player_pudgy.fbx are ~1-frame poses.
   * Hold those poses this long so 抛竿 / 举鱼 read clearly.
   */
  castPoseHold: 0.55,
  catchPoseHold: 2.4,

  /** Play order: cast → idle → struggle → (then HoldingFish on complete). */
  defaultStepDefinitions: [
    { type: 'cast', durationMin: 0.55, durationMax: 0.55 },
    { type: 'idle', durationMin: 5, durationMax: 7.5 },
    { type: 'struggle', clicksMin: 10, clicksMax: 20 },
  ],

  /** Plaza fishing spots (ice holes on/near water plane y ≈ -6.8) */
  holes: [
    { id: 'hole-a', position: { x: 8, y: -6.72, z: 12 } },
    { id: 'hole-b', position: { x: 22, y: -6.72, z: 22 } },
    { id: 'hole-c', position: { x: 14, y: -6.72, z: 28 } },
  ],
};

export const FISHING_STEP = {
  Idle: 'idle',
  Cast: 'cast',
  Hold: 'hold',
  Struggle: 'struggle',
};

/** @typedef {{ type: string, duration?: number, requiredClicks?: number }} FishingStep */

/**
 * @param {typeof FISHING.defaultStepDefinitions} definitions
 * @param {() => number} random01
 * @returns {FishingStep[]}
 */
export function generateFishingSequence(definitions = FISHING.defaultStepDefinitions, random01 = Math.random) {
  const lerp = (a, b) => a + (b - a) * random01();
  const randInt = (a, b) => Math.floor(lerp(a, b + 1));

  return definitions.map((def) => {
    if (def.type === FISHING_STEP.Struggle) {
      return {
        type: FISHING_STEP.Struggle,
        requiredClicks: randInt(def.clicksMin, def.clicksMax),
      };
    }
    return {
      type: def.type,
      duration: lerp(def.durationMin, def.durationMax),
    };
  });
}

/** Clip per fishing step — HoldingFish plays after the sequence completes. */
export function fishingClipForStep(type) {
  return FISHING.stepClips?.[type] ?? 'fishingIdle';
}
