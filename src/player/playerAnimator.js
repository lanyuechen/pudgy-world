import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';

/** All clips imported from player_pudgy.fbx (Unity PlayerAnimator.controller + extra takes). */
const CLIP_DEFS = {
  idle: {
    aliases: ['Armature|Idle', 'Idle', 'idle'],
    loop: THREE.LoopRepeat,
    speed: 1.75,
  },
  walk: {
    aliases: ['Armature|Walk', 'Walk', 'walk'],
    loop: THREE.LoopRepeat,
    speed: 1.75,
  },
  jump: {
    aliases: ['Armature|Air', 'Air', 'jump', 'Jump'],
    loop: THREE.LoopOnce,
    speed: 1.75,
  },
  slide: {
    aliases: ['Armature|BellySurfing', 'BellySurfing', 'slide', 'Slide', 'Armature|BellySlide'],
    loop: THREE.LoopRepeat,
    speed: 1.75,
  },
  throw: {
    aliases: ['Armature|Throw', 'Throw', 'throw'],
    loop: THREE.LoopOnce,
    speed: 1,
  },
  afk1: {
    aliases: ['Armature|AFK1', 'AFK1', 'afk1'],
    loop: THREE.LoopOnce,
    speed: 1,
  },
  afk2: {
    aliases: ['Armature|AFK2', 'AFK2', 'afk2'],
    loop: THREE.LoopOnce,
    speed: 1,
  },
  afk3: {
    aliases: ['Armature|AFK3', 'AFK3', 'afk3'],
    loop: THREE.LoopOnce,
    speed: 1,
  },
  fishingIdle: {
    aliases: ['Armature|FishingIdle', 'FishingIdle', 'fishing_idle'],
    loop: THREE.LoopRepeat,
    speed: 1,
  },
  fishingHoldingRodIdle: {
    aliases: ['Armature|FishingHoldingRodIdle', 'FishingHoldingRodIdle'],
    loop: THREE.LoopRepeat,
    speed: 1,
  },
  fishingCast: {
    aliases: ['Armature|FishingCast', 'FishingCast'],
    loop: THREE.LoopOnce,
    speed: 1,
  },
  fishingStruggling: {
    aliases: ['Armature|FishingStruggling', 'FishingStruggling'],
    loop: THREE.LoopRepeat,
    speed: 1,
  },
  holdingFish: {
    aliases: ['Armature|HoldingFish', 'HoldingFish'],
    loop: THREE.LoopOnce,
    speed: 1,
  },
};

const LOCOMOTION = new Set(['idle', 'walk', 'jump', 'slide']);
const AFK_SEQUENCE = PLAYER.afkClips ?? ['afk1', 'afk2', 'afk3'];

function findClip(animations, aliases) {
  for (const name of aliases) {
    const hit = animations.find((a) => a.name === name || a.name.endsWith(`|${name}`));
    if (hit) return hit;
  }
  for (const name of aliases) {
    const key = name.toLowerCase();
    const hit = animations.find((a) => a.name.toLowerCase().includes(key));
    if (hit) return hit;
  }
  return null;
}

function clipDuration(action) {
  const clip = action?.getClip();
  if (!clip) return 0.5;
  return clip.duration / Math.max(action.timeScale, 1e-4);
}

/**
 * Animation mixer matching Unity PlayerAnimator triggers, throw override, and AFK idle emotes.
 */
export function createPlayerAnimator(modelRoot, animations = []) {
  const mixer = new THREE.AnimationMixer(modelRoot);
  const actions = {};

  for (const [key, def] of Object.entries(CLIP_DEFS)) {
    const clip = findClip(animations, def.aliases);
    if (!clip) {
      console.warn(`[player-anim] missing clip for "${key}"`, animations.map((a) => a.name));
      continue;
    }
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setLoop(def.loop, def.loop === THREE.LoopOnce ? 1 : Infinity);
    if (def.loop === THREE.LoopOnce) action.clampWhenFinished = true;
    action.timeScale = def.speed ?? 1;
    actions[key] = action;
  }

  let current = null;
  let lastLocomotion = 'idle';
  let jumpLockedUntil = 0;
  let overrideUntil = 0;
  let overrideActive = false;
  let idleTimer = 0;
  let afkActive = false;
  let afkIndex = 0;
  let afkStepUntil = 0;
  let fishingMode = false;
  /** @type {string | null} */
  let fishingClip = null;
  /** @type {string | null} */
  let pendingFishingClip = null;

  const availableAfk = AFK_SEQUENCE.filter((name) => actions[name]);

  function play(name, fade = 0.2) {
    const next = actions[name];
    if (!next) return false;
    if (current === next && next.isRunning()) return true;

    next.reset();
    next.play();
    if (current && current !== next) {
      current.crossFadeTo(next, fade, false);
    } else {
      next.fadeIn(fade);
    }
    current = next;
    if (LOCOMOTION.has(name)) lastLocomotion = name;
    return true;
  }

  function restoreLocomotion(fade = 0.15) {
    afkActive = false;
    afkIndex = 0;
    afkStepUntil = 0;
    idleTimer = 0;
    if (actions[lastLocomotion]) play(lastLocomotion, fade);
    else if (actions.idle) play('idle', fade);
  }

  /** Unity PlayerAnimator.HandleOverrideAnimationTriggerRequested */
  function playOverride(name, duration = PLAYER.throwAnimationDuration) {
    if (!actions[name]) return;
    afkActive = false;
    idleTimer = 0;
    overrideActive = true;
    overrideUntil = performance.now() / 1000 + duration;
    play(name, 0.08);
  }

  function playAfkStep(index) {
    const name = availableAfk[index];
    if (!name) return;
    afkActive = true;
    afkIndex = index;
    play(name, 0.25);
    afkStepUntil = performance.now() / 1000 + clipDuration(actions[name]) * 0.98;
  }

  function updateAfk(dt, { moving, grounded, sliding }) {
    if (!availableAfk.length) return;
    if (!grounded || moving || sliding) {
      if (afkActive) restoreLocomotion(0.2);
      idleTimer = 0;
      return;
    }

    idleTimer += dt;
    const delay = PLAYER.afkIdleDelay ?? 10;

    if (!afkActive) {
      if (idleTimer >= delay) playAfkStep(0);
      return;
    }

    const now = performance.now() / 1000;
    if (now >= afkStepUntil) {
      const next = (afkIndex + 1) % availableAfk.length;
      playAfkStep(next);
    }
  }

  if (actions.idle) {
    actions.idle.play();
    current = actions.idle;
    lastLocomotion = 'idle';
  }

  function stopNonFishingActions() {
    for (const [name, action] of Object.entries(actions)) {
      if (name === fishingClip) continue;
      action.stop();
    }
  }

  function applyFishingClip(name, fade = 0.15) {
    if (!actions[name]) return false;
    if (fishingClip === name && actions[name].isRunning()) return true;
    fishingClip = name;
    pendingFishingClip = null;
    stopNonFishingActions();
    return play(name, fade);
  }

  function enterFishing() {
    fishingMode = true;
    afkActive = false;
    idleTimer = 0;
    overrideActive = false;
    jumpLockedUntil = 0;
    fishingClip = null;
    pendingFishingClip = null;
    if (actions.fishingCast) {
      fishingClip = 'fishingCast';
      stopNonFishingActions();
      play('fishingCast', 0.12);
    } else {
      applyFishingClip('fishingIdle', 0.2);
    }
  }

  function exitFishing() {
    fishingMode = false;
    fishingClip = null;
    pendingFishingClip = null;
    restoreLocomotion(0.2);
  }

  function setFishingClip(name) {
    if (!fishingMode || !actions[name]) return;
    if (fishingClip === 'fishingCast' && actions.fishingCast?.isRunning()) {
      pendingFishingClip = name;
      return;
    }
    applyFishingClip(name, 0.15);
  }

  function updateFishing(dt) {
    if (
      fishingClip === 'fishingCast' &&
      actions.fishingCast &&
      !actions.fishingCast.isRunning()
    ) {
      applyFishingClip(pendingFishingClip ?? 'fishingIdle', 0.12);
    } else if (fishingClip && actions[fishingClip] && !actions[fishingClip].isRunning()) {
      play(fishingClip, 0.08);
    }
    mixer.update(dt);
  }

  function update(dt, { moving, grounded, sliding, jumpStarted, throwStarted, fishingMode: fishing = false }) {
    if (fishing || fishingMode) {
      updateFishing(dt);
      return;
    }

    const now = performance.now() / 1000;

    if (throwStarted) {
      playOverride('throw', PLAYER.throwAnimationDuration);
      mixer.update(dt);
      return;
    }

    if (overrideActive) {
      if (now >= overrideUntil) {
        overrideActive = false;
        restoreLocomotion(0.15);
      }
      mixer.update(dt);
      return;
    }

    if (jumpStarted && actions.jump) {
      afkActive = false;
      idleTimer = 0;
      play('jump', 0.08);
      jumpLockedUntil = now + clipDuration(actions.jump) * 0.85;
      mixer.update(dt);
      return;
    }

    if (now < jumpLockedUntil) {
      mixer.update(dt);
      return;
    }

    if (!grounded && actions.jump) {
      if (current !== actions.jump) {
        afkActive = false;
        idleTimer = 0;
        play('jump', 0.1);
      }
    } else if (sliding && actions.slide) {
      afkActive = false;
      idleTimer = 0;
      if (moving) play('slide', 0.15);
      else if (actions.idle) play('idle', 0.2);
    } else if (moving && actions.walk) {
      afkActive = false;
      idleTimer = 0;
      play('walk', 0.15);
    } else if (afkActive) {
      updateAfk(dt, { moving, grounded, sliding });
    } else if (actions.idle) {
      play('idle', 0.2);
      updateAfk(dt, { moving, grounded, sliding });
    }

    mixer.update(dt);
  }

  return { mixer, actions, update, play, playOverride, restoreLocomotion, enterFishing, exitFishing, setFishingClip };
}
