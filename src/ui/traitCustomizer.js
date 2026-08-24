import {
  COSMETIC_TRAIT_TYPES,
  TRAIT_TYPE,
  TRAIT_TYPE_LABELS,
  traitsForType,
} from '../config/traitsConfig.js';
import { saveCosmeticTraitLoadoutSnapshot } from '../config/traitPersistence.js';

/**
 * Settings-panel trait picker (Skin / Head / Face / Body / Full Body + Bait).
 */
export function createTraitCustomizer(traitEquipper, containerEl) {
  if (!traitEquipper || !containerEl) {
    return { dispose() {} };
  }

  const selects = new Map();
  let isInitializing = true;
  /** @type {HTMLElement[]} */
  const ownedNodes = [];

  const title = document.createElement('p');
  title.className = 'config-subtitle';
  title.textContent = 'Appearance';
  containerEl.appendChild(title);
  ownedNodes.push(title);

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
        syncFromEquipper();
        if (!isInitializing) {
          saveCosmeticTraitLoadoutSnapshot(traitEquipper);
        }
      }
    });

    field.appendChild(label);
    field.appendChild(select);
    containerEl.appendChild(field);
    ownedNodes.push(field);
    selects.set(type, select);
  }

  const fishingTitle = document.createElement('p');
  fishingTitle.className = 'config-subtitle';
  fishingTitle.textContent = 'Fishing Gear';
  containerEl.appendChild(fishingTitle);
  ownedNodes.push(fishingTitle);

  const baitField = document.createElement('label');
  baitField.className = 'config-field config-field--trait';
  const baitLabel = document.createElement('span');
  baitLabel.className = 'label';
  const baitOptions = traitsForType(TRAIT_TYPE.Bait);
  baitLabel.textContent = `${TRAIT_TYPE_LABELS[TRAIT_TYPE.Bait]} (${baitOptions.length})`;

  const baitSelect = document.createElement('select');
  baitSelect.dataset.traitType = TRAIT_TYPE.Bait;
  baitSelect.setAttribute('aria-label', TRAIT_TYPE_LABELS[TRAIT_TYPE.Bait]);

  for (const trait of baitOptions) {
    const opt = document.createElement('option');
    opt.value = trait.id;
    opt.textContent = trait.label;
    baitSelect.appendChild(opt);
  }

  baitSelect.addEventListener('change', async () => {
    const id = baitSelect.value;
    const prev = traitEquipper.getPreferredBaitId?.() ?? '';
    baitSelect.disabled = true;
    try {
      await traitEquipper.setPreferredBaitId(id);
    } catch (err) {
      console.error('[traits] bait', err);
      baitSelect.value = prev;
    } finally {
      baitSelect.disabled = false;
      syncFromEquipper();
    }
  });

  baitField.appendChild(baitLabel);
  baitField.appendChild(baitSelect);
  containerEl.appendChild(baitField);
  ownedNodes.push(baitField);
  selects.set(TRAIT_TYPE.Bait, baitSelect);

  function syncFromEquipper() {
    for (const [type, select] of selects) {
      if (type === TRAIT_TYPE.Bait) {
        select.value = traitEquipper.getPreferredBaitId?.() ?? '';
        continue;
      }
      select.value = traitEquipper.getActiveId(type) ?? '';
    }
  }

  syncFromEquipper();
  isInitializing = false;

  function dispose() {
    for (const select of selects.values()) {
      select.replaceWith(select.cloneNode(true));
    }
    selects.clear();
    for (const node of ownedNodes) node.remove();
    ownedNodes.length = 0;
  }

  return { syncFromEquipper, dispose };
}
