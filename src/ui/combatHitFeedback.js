import { COMBAT } from '../config/combatConfig.js';

/** Full-screen red vignette pulse when the player is hit. */
export function createCombatHitFeedback() {
  const el = document.createElement('div');
  el.id = 'combat-hit-feedback';
  el.hidden = true;
  document.body.appendChild(el);

  let timer = 0;
  let duration = COMBAT.playerHitVignetteDuration ?? 0.45;

  function pulse(customDuration) {
    duration = customDuration ?? COMBAT.playerHitVignetteDuration ?? 0.45;
    timer = duration;
    el.hidden = false;
    el.style.opacity = '0.9';
  }

  function update(dt) {
    if (timer <= 0) {
      el.hidden = true;
      return;
    }
    timer -= dt;
    const alpha = Math.max(0, timer / duration);
    el.style.opacity = String(alpha * 0.9);
    if (timer <= 0) el.hidden = true;
  }

  function setVisible(visible) {
    if (!visible) {
      timer = 0;
      el.hidden = true;
    }
  }

  function dispose() {
    el.remove();
  }

  return { pulse, update, setVisible, dispose };
}
