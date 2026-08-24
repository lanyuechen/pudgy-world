import {
  COSMETIC_TRAIT_TYPES,
  TRAIT_TYPE_LABELS,
  traitsForType,
} from '../config/traitsConfig.js';

/**
 * Settings-panel trait picker (Skin / Head / Face / Body).
 */
export function createTraitCustomizer(traitEquipper, containerEl) {
  if (!traitEquipper || !containerEl) {
    return { dispose() {} };
  }

  const selects = new Map();

  const title = document.createElement('p');
  title.className = 'config-subtitle';
  title.textContent = 'Appearance';
  containerEl.appendChild(title);

  for (const type of COSMETIC_TRAIT_TYPES) {
    const field = document.createElement('label');
    field.className = 'config-field config-field--trait';

    const label = document.createElement('span');
    label.className = 'label';
    const options = traitsForType(type);
    label.textContent = `${TRAIT_TYPE_LABELS[type] ?? type} (${options.length})`;

    const select = document.createElement('select');
    select.dataset.traitType = type;
    select.setAttribute('aria-label', TRAIT_TYPE_LABELS[type] ?? type);

    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Default';
    select.appendChild(none);

    for (const trait of options) {
      const opt = document.createElement('option');
      opt.value = trait.id;
      opt.textContent = trait.label;
      select.appendChild(opt);
    }

    select.addEventListener('change', async () => {
      const id = select.value;
      const prev = traitEquipper.getActiveId(type) ?? '';
      select.disabled = true;
      try {
        if (!id) traitEquipper.removeTraitOfType(type);
        else await traitEquipper.equipTrait(id);
      } catch (err) {
        console.error('[traits]', err);
        select.value = prev;
        traitEquipper.removeTraitOfType(type);
      } finally {
        select.disabled = false;
      }
    });

    field.appendChild(label);
    field.appendChild(select);
    containerEl.appendChild(field);
    selects.set(type, select);
  }

  function syncFromEquipper() {
    for (const [type, select] of selects) {
      select.value = traitEquipper.getActiveId(type) ?? '';
    }
  }

  syncFromEquipper();

  function dispose() {
    for (const select of selects.values()) {
      select.replaceWith(select.cloneNode(true));
    }
    selects.clear();
    title.remove();
  }

  return { syncFromEquipper, dispose };
}
