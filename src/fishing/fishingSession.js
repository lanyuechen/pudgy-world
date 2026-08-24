import {
  FISHING_STEP,
  fishingClipForStep,
  generateFishingSequence,
} from '../config/fishingConfig.js';

/**
 * Runs FishingStep[] sequence (Idle / Hold / Struggle timers + click counts).
 */
export function createFishingSession({ onStepAnim, onComplete, onExit } = {}) {
  /** @type {import('../config/fishingConfig.js').FishingStep[]} */
  let sequence = [];
  let stepIndex = 0;
  let stepTimer = 0;
  let struggleClicks = 0;
  let active = false;

  function currentStep() {
    return sequence[stepIndex] ?? null;
  }

  function emitStepAnim() {
    const step = currentStep();
    if (!step) return;
    onStepAnim?.(fishingClipForStep(step.type), step);
  }

  function advanceStep() {
    stepIndex += 1;
    struggleClicks = 0;
    stepTimer = 0;
    if (stepIndex >= sequence.length) {
      active = false;
      onComplete?.();
      return;
    }
    emitStepAnim();
    const step = currentStep();
    stepTimer = step?.type === FISHING_STEP.Struggle ? Infinity : (step?.duration ?? 0);
  }

  function start(holeId) {
    sequence = generateFishingSequence();
    stepIndex = 0;
    stepTimer = 0;
    struggleClicks = 0;
    active = true;
    emitStepAnim();
    const step = currentStep();
    stepTimer = step?.type === FISHING_STEP.Struggle ? Infinity : (step?.duration ?? 0);
    return { holeId, sequence };
  }

  function exit() {
    if (!active) return false;
    active = false;
    sequence = [];
    stepIndex = 0;
    onExit?.();
    return true;
  }

  function registerStruggleClick() {
    if (!active) return false;
    const step = currentStep();
    if (!step || step.type !== FISHING_STEP.Struggle) return false;
    struggleClicks += 1;
    if (struggleClicks >= (step.requiredClicks ?? 1)) advanceStep();
    return true;
  }

  function update(dt) {
    if (!active) return;
    const step = currentStep();
    if (!step || step.type === FISHING_STEP.Struggle) return;
    stepTimer -= dt;
    if (stepTimer <= 0) advanceStep();
  }

  return {
    start,
    exit,
    update,
    registerStruggleClick,
    get active() {
      return active;
    },
    get step() {
      return currentStep();
    },
    get stepIndex() {
      return stepIndex;
    },
    get struggleClicks() {
      return struggleClicks;
    },
    get struggleTarget() {
      const step = currentStep();
      return step?.type === FISHING_STEP.Struggle ? step.requiredClicks ?? 0 : 0;
    },
  };
}
