import {
  COSMETIC_TRAIT_TYPES,
  TRAIT_TYPE_LABELS,
  traitsForType,
} from '../config/traitsConfig.js';
import { saveCosmeticTraitLoadoutSnapshot } from '../config/traitPersistence.js';
import { createConfigSectionPanel } from './configSectionPanel.js';

/**
 * Skin panel — accordion sections via shared configSectionPanel.
 */
export function createTraitCustomizer(traitEquipper, containerEl) {
  if (!traitEquipper || !containerEl) {
    return { dispose() {} };
  }

  let isInitializing = true;
  let busy = false;

  const sections = COSMETIC_TRAIT_TYPES.map((type, index) => {
    const traits = traitsForType(type);
    return {
      id: type,
      label: TRAIT_TYPE_LABELS[type] ?? type,
      count: traits.length,
      openByDefault: index === 0,
      options: [
        { value: '', label: '默认' },
        ...traits.map((t) => ({ value: t.id, label: t.label })),
      ],
    };
  });

  async function applyTrait(type, id) {
    if (busy) return;
    const prev = traitEquipper.getActiveId(type) ?? '';
    if ((id || '') === prev) return;

    busy = true;
    panel.setAllDisabled(true);
    try {
      if (!id) traitEquipper.removeTraitOfType(type);
      else await traitEquipper.equipTrait(id);
    } catch (err) {
      console.error('[traits]', err);
      traitEquipper.removeTraitOfType(type);
    } finally {
      busy = false;
      panel.setAllDisabled(false);
      syncFromEquipper();
      if (!isInitializing) {
        saveCosmeticTraitLoadoutSnapshot(traitEquipper);
      }
    }
  }

  const panel = createConfigSectionPanel(containerEl, {
    sections,
    accordion: true,
    onSelect: (type, id) => {
      applyTrait(type, id);
    },
  });

  function syncFromEquipper() {
    panel.syncSelection((type) => traitEquipper.getActiveId(type) ?? '');
  }

  syncFromEquipper();
  isInitializing = false;

  return {
    syncFromEquipper,
    updateLayout: () => panel.updateLayout(),
    dispose: () => panel.dispose(),
  };
}
