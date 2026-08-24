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

  /** TestFishingHole stepDefinitions (types 0=Idle,1=Hold,2=Struggle) */
  defaultStepDefinitions: [
    { type: 'idle', durationMin: 5, durationMax: 7.5 },
    { type: 'hold', durationMin: 5, durationMax: 10 },
    { type: 'struggle', clicksMin: 10, clicksMax: 20 },
    { type: 'hold', durationMin: 5, durationMax: 10 },
    { type: 'struggle', clicksMin: 15, clicksMax: 30 },
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

/** Clip per FishingStepType (inferred from clip names + step semantics). */
export function fishingClipForStep(type) {
  switch (type) {
    case FISHING_STEP.Idle:
      return 'fishingIdle';
    case FISHING_STEP.Hold:
      return 'fishingHoldingRodIdle';
    case FISHING_STEP.Struggle:
      return 'fishingStruggling';
    default:
      return 'fishingIdle';
  }
}
