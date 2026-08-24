import * as THREE from 'three';
import { PLAYER } from '../config/playerConfig.js';

const CLIP_ALIASES = {
  idle: ['Armature|Idle', 'Idle', 'idle'],
  walk: ['Armature|Walk', 'Walk', 'walk'],
  jump: ['Armature|Air', 'Air', 'jump', 'Jump'],
  slide: ['Armature|BellySurfing', 'BellySurfing', 'slide', 'Slide', 'Armature|BellySlide'],
  throw: ['Armature|Throw', 'Throw', 'throw'],
};

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

/**
 * Animation mixer matching Unity PlayerAnimator triggers + override (throw).
 */
export function createPlayerAnimator(modelRoot, animations = []) {
  const mixer = new THREE.AnimationMixer(modelRoot);
  const actions = {};

  for (const [key, aliases] of Object.entries(CLIP_ALIASES)) {
    const clip = findClip(animations, aliases);
    if (!clip) {
      console.warn(`[player-anim] missing clip for "${key}"`, animations.map((a) => a.name));
      continue;
    }
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    if (key === 'jump' || key === 'throw') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
    actions[key] = action;
  }

  let current = null;
  let lastLocomotion = 'idle';
  let jumpLockedUntil = 0;
  let overrideUntil = 0;
  let overrideActive = false;

  function play(name, fade = 0.2) {
    const next = actions[name];
    if (!next) return;
    if (current === next && next.isRunning()) return;

    next.reset();
    next.play();
    if (current && current !== next) {
      current.crossFadeTo(next, fade, false);
    } else {
      next.fadeIn(fade);
    }
    current = next;
    if (name !== 'throw') lastLocomotion = name;
  }

  /**
   * Unity PlayerAnimator.HandleOverrideAnimationTriggerRequested:
   * play trigger, ignore locomotion until duration, then restore last trigger.
   */
  function playOverride(name, duration = PLAYER.throwAnimationDuration) {
    if (!actions[name]) return;
    overrideActive = true;
    overrideUntil = performance.now() / 1000 + duration;
    play(name, 0.08);
  }

  if (actions.idle) {
    actions.idle.play();
    current = actions.idle;
    lastLocomotion = 'idle';
  }

  function update(dt, { moving, grounded, sliding, jumpStarted, throwStarted }) {
    const now = performance.now() / 1000;

    if (throwStarted) {
      playOverride('throw', PLAYER.throwAnimationDuration);
      mixer.update(dt);
      return;
    }

    if (overrideActive) {
      if (now >= overrideUntil) {
        overrideActive = false;
        if (actions[lastLocomotion]) play(lastLocomotion, 0.15);
      }
      mixer.update(dt);
      return;
    }

    if (jumpStarted && actions.jump) {
      play('jump', 0.08);
      jumpLockedUntil = now + (actions.jump.getClip()?.duration ?? 0.5) * 0.85;
      mixer.update(dt);
      return;
    }

    if (now < jumpLockedUntil) {
      mixer.update(dt);
      return;
    }

    if (!grounded && actions.jump) {
      if (current !== actions.jump) play('jump', 0.1);
    } else if (sliding && actions.slide) {
      if (moving) play('slide', 0.15);
      else if (actions.idle) play('idle', 0.2);
    } else if (moving && actions.walk) {
      play('walk', 0.15);
    } else if (actions.idle) {
      play('idle', 0.2);
    }

    mixer.update(dt);
  }

  return { mixer, actions, update, play, playOverride };
}
