import { SKILLS, SKILL_IDS } from '../config/skillConfig.js';
import { renderSkillIcon } from './skillIcons.js';

/**
 * Bottom-right skill bar: 3 skill buttons.
 */
export function createSkillBar({ onSelectSkill } = {}) {
  let el = document.getElementById('combat-skill-bar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'combat-skill-bar';
    el.innerHTML =
      '<div class="skill-bar-inner"></div>';
    document.getElementById('app')?.appendChild(el);
  }

  const inner = el.querySelector('.skill-bar-inner');
  inner.innerHTML = '';

  /** @type {Map<string, HTMLButtonElement>} */
  const skillBtns = new Map();
  /** @type {Map<string, HTMLElement>} */
  const cooldownEls = new Map();

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
  }

  function setVisible(v) {
    el.hidden = !v;
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
    el.remove();
  }

  return { setVisible, sync, dispose };
}
