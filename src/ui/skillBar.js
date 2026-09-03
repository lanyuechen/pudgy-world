import { SKILLS, SKILL_IDS } from '../config/skillConfig.js';
import { renderSkillIcon } from './skillIcons.js';

const ATTACK_ICON =
  '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="7.2" fill="currentColor" opacity="0.22"/>' +
  '<circle cx="12" cy="12" r="4.6" fill="currentColor"/>' +
  '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
  'd="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M6.1 6.1l1.7 1.7M16.2 16.2l1.7 1.7M17.9 6.1l-1.7 1.7M7.8 16.2l-1.7 1.7"/>' +
  '</svg>';

/**
 * Place skills on the upper-left quarter-circle around the attack button.
 * Angles: 90° (up) → 180° (left), math CCW from +X.
 */
function layoutSkillArc(hostEl, buttons) {
  const n = buttons.length;
  if (!n) return;
  const cssR = parseFloat(getComputedStyle(hostEl).getPropertyValue('--arc-r'));
  const radius = Number.isFinite(cssR) && cssR > 0 ? cssR : 88;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const angleRad = (Math.PI / 2) * (1 + t); // π/2 … π
    const x = Math.cos(angleRad) * radius;
    const y = Math.sin(angleRad) * radius;
    const btn = buttons[i];
    btn.style.setProperty('--arc-x', `${x.toFixed(1)}px`);
    btn.style.setProperty('--arc-y', `${y.toFixed(1)}px`);
  }
}

/**
 * Bottom-right combat controls: attack hub + skills on upper-left arc.
 */
export function createSkillBar({ onSelectSkill, onAttack } = {}) {
  let el = document.getElementById('combat-skill-bar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'combat-skill-bar';
    el.innerHTML =
      '<div class="skill-bar-pad">' +
      '<div class="skill-bar-inner"></div>' +
      `<button type="button" class="attack-btn" aria-label="攻击，长按连续攻击">${ATTACK_ICON}<span class="attack-btn-label">攻击</span></button>` +
      '</div>';
    document.getElementById('app')?.appendChild(el);
  }

  const inner = el.querySelector('.skill-bar-inner');
  const attackBtn = el.querySelector('.attack-btn');
  inner.innerHTML = '';

  /** @type {Map<string, HTMLButtonElement>} */
  const skillBtns = new Map();
  /** @type {Map<string, HTMLElement>} */
  const cooldownEls = new Map();
  /** @type {HTMLButtonElement[]} */
  const orderedBtns = [];

  for (const id of SKILL_IDS) {
    const cfg = SKILLS[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'skill-btn';
    btn.dataset.skill = id;
    btn.setAttribute('aria-label', cfg.name);
    btn.title = cfg.name;
    btn.innerHTML =
      renderSkillIcon(id, 'skill-btn-icon') +
      '<span class="skill-btn-cooldown" aria-hidden="true"></span>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      onSelectSkill?.(id);
    });
    inner.appendChild(btn);
    skillBtns.set(id, btn);
    cooldownEls.set(id, btn.querySelector('.skill-btn-cooldown'));
    orderedBtns.push(btn);
  }

  layoutSkillArc(el, orderedBtns);

  /** Hold-to-fire: first shot on press, then repeat while held. */
  const ATTACK_REPEAT_MS = 220;
  let attackHolding = false;
  let attackHoldTimer = 0;
  let attackRepeatTimer = 0;

  function stopAttackHold() {
    attackHolding = false;
    window.clearTimeout(attackHoldTimer);
    window.clearInterval(attackRepeatTimer);
    attackHoldTimer = 0;
    attackRepeatTimer = 0;
  }

  function startAttackHold(e) {
    e.preventDefault();
    e.stopPropagation();
    if (attackHolding) return;
    attackHolding = true;
    onAttack?.();
    attackHoldTimer = window.setTimeout(() => {
      if (!attackHolding) return;
      onAttack?.();
      attackRepeatTimer = window.setInterval(() => {
        if (!attackHolding) return;
        onAttack?.();
      }, ATTACK_REPEAT_MS);
    }, ATTACK_REPEAT_MS);
  }

  if (attackBtn) {
    attackBtn.style.touchAction = 'none';
    attackBtn.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      try {
        attackBtn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      startAttackHold(e);
    });
    attackBtn.addEventListener('pointerup', stopAttackHold);
    attackBtn.addEventListener('pointercancel', stopAttackHold);
    attackBtn.addEventListener('lostpointercapture', stopAttackHold);
    attackBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const onResize = () => layoutSkillArc(el, orderedBtns);
  window.addEventListener('resize', onResize);

  function setVisible(v) {
    if (!v) stopAttackHold();
    el.hidden = !v;
    if (v) layoutSkillArc(el, orderedBtns);
  }

  /**
   * @param {{ selected: string | null, cooldowns: Record<string, number>, executing?: boolean }} state
   */
  function sync(state) {
    const selected = state.selected;
    for (const id of SKILL_IDS) {
      const btn = skillBtns.get(id);
      const cdEl = cooldownEls.get(id);
      if (!btn || !cdEl) continue;
      const cd = state.cooldowns[id] ?? 0;
      const ready = cd <= 0 && !state.executing;
      btn.disabled = !ready;
      btn.classList.toggle('is-selected', selected === id);
      btn.classList.toggle('is-cooling', cd > 0);
      if (cd > 0) {
        const max = SKILLS[id].cooldown;
        const pct = 1 - cd / max;
        cdEl.textContent = cd >= 1 ? `${Math.ceil(cd)}` : `${cd.toFixed(1)}`;
        cdEl.style.setProperty('--cd-pct', String(pct));
        btn.style.setProperty('--cd-pct', String(pct));
      } else {
        cdEl.textContent = '';
        cdEl.style.removeProperty('--cd-pct');
        btn.style.removeProperty('--cd-pct');
      }
    }
  }

  function dispose() {
    stopAttackHold();
    window.removeEventListener('resize', onResize);
    el.remove();
  }

  return { setVisible, sync, dispose };
}
