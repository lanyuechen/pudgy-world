import * as THREE from 'three';

const CLIP_ALIASES = {
  idle: ['Armature|Idle', 'Idle', 'idle'],
  walk: ['Armature|Walk', 'Walk', 'walk'],
  jump: ['Armature|Air', 'Air', 'jump', 'Jump'],
  slide: ['Armature|BellySurfing', 'BellySurfing', 'slide', 'Slide', 'Armature|BellySlide'],
};

function findClip(animations, aliases) {
  for (const name of aliases) {
    const hit = animations.find((a) => a.name === name || a.name.endsWith(`|${name}`));
    if (hit) return hit;
  }
  // fuzzy
  for (const name of aliases) {
    const key = name.toLowerCase();
    const hit = animations.find((a) => a.name.toLowerCase().includes(key));
    if (hit) return hit;
  }
  return null;
}

/**
 * Animation mixer matching Unity triggers: idle / walk / slide / jump.
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
    if (key === 'jump') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
    actions[key] = action;
  }

  let current = null;
  let jumpLockedUntil = 0;

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
  }

  // Start in idle
  if (actions.idle) {
    actions.idle.play();
    current = actions.idle;
  }

  function update(dt, { moving, grounded, sliding, jumpStarted }) {
    const now = performance.now() / 1000;

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
      // Unity: slide when isSliding && |vel| >= threshold (moving)
      if (moving) play('slide', 0.15);
      else if (actions.idle) play('idle', 0.2);
    } else if (moving && actions.walk) {
      play('walk', 0.15);
    } else if (actions.idle) {
      play('idle', 0.2);
    }

    mixer.update(dt);
  }

  return { mixer, actions, update, play };
}
