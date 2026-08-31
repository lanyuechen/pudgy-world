import { SKILLS, SKILL_IDS } from '../config/skillConfig.js';
import { renderSkillIcon } from './skillIcons.js';

/**
 * Skills reference tab in the config panel.
 */
export function createSkillInfoPanel(containerEl) {
  containerEl.classList.add('skill-info-panel');
  containerEl.innerHTML = '';

  for (const id of SKILL_IDS) {
    const skill = SKILLS[id];
    const card = document.createElement('article');
    card.className = 'skill-info-card';

    const head = document.createElement('div');
    head.className = 'skill-info-head';
    head.insertAdjacentHTML('beforeend', renderSkillIcon(id, 'skill-info-icon'));
    const title = document.createElement('h3');
    title.className = 'skill-info-title';
    title.textContent = skill.name;
    head.appendChild(title);

    const desc = document.createElement('p');
    desc.className = 'skill-info-desc';
    desc.textContent = skill.description;

    const meta = document.createElement('p');
    meta.className = 'skill-info-meta';
    meta.textContent = `冷却 ${skill.cooldown} 秒`;

    card.appendChild(head);
    card.appendChild(desc);
    card.appendChild(meta);
    containerEl.appendChild(card);
  }

  return {
    dispose() {
      containerEl.innerHTML = '';
      containerEl.classList.remove('skill-info-panel');
    },
  };
}
