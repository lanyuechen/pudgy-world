/**
 * Collapsible config sections — shared by scene & skin panes.
 *
 * - accordion: only one section open at a time (skin)
 * - independent: each section toggles on its own (scene)
 * - Section titles stay fixed; option lists scroll when content exceeds space.
 */

/** @typedef {{ value: string, label: string, sublabel?: string }} ConfigSectionOption */
/** @typedef {{ id: string, label: string, options: ConfigSectionOption[], count?: number, openByDefault?: boolean }} ConfigSectionDef */

export function createConfigSectionPanel(containerEl, { sections, accordion = false, onSelect }) {
  if (!containerEl) {
    return {
      syncSelection() {},
      setAllDisabled() {},
      dispose() {},
    };
  }

  containerEl.classList.add('config-section-panel');
  if (accordion) containerEl.classList.add('config-section-panel--accordion');

  /** @type {Map<string, Map<string, HTMLButtonElement>>} */
  const itemsBySection = new Map();

  /** @type {{
   *   id: string,
   *   section: HTMLElement,
   *   toggle: HTMLButtonElement,
   *   body: HTMLElement,
   *   list: HTMLElement,
   * }[]} */
  const entries = [];

  /** @type {ResizeObserver|null} */
  let resizeObserver = null;

  function setSectionOpen(entry, open) {
    entry.section.classList.toggle('is-open', open);
    entry.toggle.setAttribute('aria-expanded', String(open));
    entry.body.hidden = !open;
  }

  function openSectionExclusive(target) {
    for (const entry of entries) {
      setSectionOpen(entry, entry === target);
    }
  }

  function updateScrollLayout() {
    for (const entry of entries) {
      entry.body.classList.remove('is-scrollable');
      entry.list.style.maxHeight = '';
      entry.list.style.overflowY = '';
    }

    const openEntries = entries.filter((e) => e.section.classList.contains('is-open'));
    if (openEntries.length === 0) return;

    const panelHeight = containerEl.clientHeight;
    if (panelHeight <= 0) return;

    let fixedHeight = 0;
    for (const entry of entries) {
      fixedHeight += entry.toggle.offsetHeight;
    }
    for (let i = 1; i < entries.length; i += 1) {
      const section = entries[i].section;
      if (section.classList.contains('config-section-block--divider')) {
        const style = getComputedStyle(section);
        fixedHeight += parseFloat(style.marginTop) + parseFloat(style.paddingTop) + 1;
      }
    }
    for (const entry of openEntries) {
      const blockStyle = getComputedStyle(entry.section);
      fixedHeight += parseFloat(blockStyle.rowGap || blockStyle.gap || '0') || 0;
    }

    const available = panelHeight - fixedHeight;
    if (available <= 40) {
      // Not enough room for an inner list scroller (e.g. many accordion headers).
      // Let the parent pane scroll the whole panel instead.
      return;
    }

    // When multiple sections are open, split remaining space; accordion usually has one.
    const share = Math.floor(available / openEntries.length);

    for (const entry of openEntries) {
      const listHeight = entry.list.scrollHeight;
      if (listHeight > share) {
        entry.body.classList.add('is-scrollable');
        entry.list.style.maxHeight = `${share}px`;
        entry.list.style.overflowY = 'auto';
      }
    }
  }

  function scheduleLayoutUpdate() {
    requestAnimationFrame(updateScrollLayout);
  }

  for (const [index, def] of sections.entries()) {
    const openByDefault = def.openByDefault ?? false;

    const section = document.createElement('section');
    section.className = 'config-section-block';
    if (index > 0) section.classList.add('config-section-block--divider');
    if (openByDefault) section.classList.add('is-open');
    section.dataset.sectionId = def.id;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'config-section-toggle';
    toggle.setAttribute('aria-expanded', String(openByDefault));
    toggle.innerHTML = `<span class="config-section-heading"><span class="config-section-name">${def.label}</span><span class="config-section-count">(${def.count ?? def.options.length})</span></span><span class="config-section-chevron" aria-hidden="true"></span>`;

    const body = document.createElement('div');
    body.className = 'config-section-body';
    body.hidden = !openByDefault;

    const list = document.createElement('div');
    list.className = 'config-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', def.label);

    /** @type {Map<string, HTMLButtonElement>} */
    const itemMap = new Map();

    for (const opt of def.options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'config-list-item';
      item.dataset.value = opt.value;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      if (opt.sublabel) {
        item.classList.add('config-list-item--stacked');
        const primary = document.createElement('span');
        primary.className = 'config-list-item-label';
        primary.textContent = opt.label;
        const secondary = document.createElement('span');
        secondary.className = 'config-list-item-sublabel';
        secondary.textContent = opt.sublabel;
        item.append(primary, secondary);
        item.setAttribute('aria-label', `${opt.label} ${opt.sublabel}`);
      } else {
        item.textContent = opt.label;
      }
      item.addEventListener('click', () => onSelect(def.id, opt.value));
      list.appendChild(item);
      itemMap.set(opt.value, item);
    }

    body.appendChild(list);
    section.append(toggle, body);
    containerEl.appendChild(section);

    const entry = { id: def.id, section, toggle, body, list };
    entries.push(entry);
    itemsBySection.set(def.id, itemMap);
    setSectionOpen(entry, openByDefault);

    toggle.addEventListener('click', () => {
      const isOpen = entry.section.classList.contains('is-open');
      if (accordion) {
        if (isOpen) {
          setSectionOpen(entry, false);
        } else {
          openSectionExclusive(entry);
        }
      } else {
        setSectionOpen(entry, !isOpen);
      }
      scheduleLayoutUpdate();
    });
  }

  function syncSelection(getSelected) {
    for (const [sectionId, itemMap] of itemsBySection) {
      const active = getSelected(sectionId) ?? '';
      for (const [value, item] of itemMap) {
        const selected = value === active;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-selected', String(selected));
      }
    }
  }

  function setAllDisabled(disabled) {
    for (const itemMap of itemsBySection.values()) {
      for (const item of itemMap.values()) item.disabled = disabled;
    }
  }

  function dispose() {
    resizeObserver?.disconnect();
    resizeObserver = null;
    itemsBySection.clear();
    entries.length = 0;
    containerEl.replaceChildren();
    containerEl.classList.remove('config-section-panel', 'config-section-panel--accordion');
  }

  resizeObserver = new ResizeObserver(scheduleLayoutUpdate);
  resizeObserver.observe(containerEl);

  scheduleLayoutUpdate();

  return { syncSelection, setAllDisabled, updateLayout: scheduleLayoutUpdate, dispose };
}
