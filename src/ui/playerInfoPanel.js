import {
  getPlayerStats,
  setPlayerStat,
} from '../config/playerStats.js';

/** @typedef {'strength' | 'agility' | 'accuracy' | 'vitality' | 'damage'} AttrKey */

const ATTRS = [
  {
    key: /** @type {AttrKey} */ ('strength'),
    label: '力量',
    hint: '越高，雪球投得越远',
  },
  {
    key: /** @type {AttrKey} */ ('agility'),
    label: '敏捷',
    hint: '越高，移动速度越快',
  },
  {
    key: /** @type {AttrKey} */ ('accuracy'),
    label: '精准',
    hint: '越高，投掷倾角扰动越小（50 时最大 ±2°）',
  },
  {
    key: /** @type {AttrKey} */ ('vitality'),
    label: '生命',
    hint: '越高，最大生命值越高（0→100，100→300）',
  },
  {
    key: /** @type {AttrKey} */ ('damage'),
    label: '伤害',
    hint: '越高，雪球基础伤害越高（0→20，100→100）',
  },
];

const RADAR_SIZE = 268;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 70;
const RADAR_LABEL_R = RADAR_RADIUS + 30;
const RADAR_RINGS = [0.25, 0.5, 0.75, 1];
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {number} index
 * @param {number} n
 * @param {number} radius
 */
function axisPoint(index, n, radius) {
  const angle = -Math.PI / 2 + (index / n) * Math.PI * 2;
  return {
    x: RADAR_CENTER + Math.cos(angle) * radius,
    y: RADAR_CENTER + Math.sin(angle) * radius,
    cos: Math.cos(angle),
    sin: Math.sin(angle),
  };
}

/**
 * @param {number[]} values 0–100
 */
function valuesToPolygon(values) {
  const n = values.length;
  return values
    .map((v, i) => {
      const t = Math.max(0, Math.min(100, v)) / 100;
      const p = axisPoint(i, n, RADAR_RADIUS * t);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(' ');
}

/**
 * @param {SVGElement} parent
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 */
function svgEl(parent, tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  parent.appendChild(el);
  return el;
}

/**
 * @param {SVGSVGElement} svg
 * @param {PointerEvent} event
 */
function pointerToSvg(svg, event) {
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: RADAR_CENTER, y: RADAR_CENTER };
  return pt.matrixTransform(ctm.inverse());
}

/**
 * @param {number} index
 * @param {number} n
 * @param {{ x: number, y: number }} pos
 */
function valueFromPointer(index, n, pos) {
  const tip = axisPoint(index, n, 1);
  const dx = pos.x - RADAR_CENTER;
  const dy = pos.y - RADAR_CENTER;
  const along = dx * tip.cos + dy * tip.sin;
  return Math.round(Math.max(0, Math.min(100, (along / RADAR_RADIUS) * 100)));
}

/**
 * @param {HTMLElement} mount
 * @param {{ onChange?: (key: AttrKey, value: number) => void }} [opts]
 */
function createRadarChart(mount, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'player-radar';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${RADAR_SIZE} ${RADAR_SIZE}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.classList.add('player-radar-svg');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', '属性雷达图，可拖动顶点调整');

  const n = ATTRS.length;
  /** @type {number[]} */
  let currentValues = ATTRS.map(() => 0);
  /** @type {number | null} */
  let dragIndex = null;

  for (const ring of RADAR_RINGS) {
    const pts = Array.from({ length: n }, (_, i) => {
      const p = axisPoint(i, n, RADAR_RADIUS * ring);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    }).join(' ');
    svgEl(svg, 'polygon', {
      points: pts,
      class: 'player-radar-ring',
    });
  }

  for (let i = 0; i < n; i++) {
    const tip = axisPoint(i, n, RADAR_RADIUS);
    svgEl(svg, 'line', {
      x1: RADAR_CENTER,
      y1: RADAR_CENTER,
      x2: tip.x,
      y2: tip.y,
      class: 'player-radar-axis',
    });
  }

  const valuePoly = svgEl(svg, 'polygon', {
    points: valuesToPolygon(currentValues),
    class: 'player-radar-value',
  });

  /** @type {SVGTextElement[]} */
  const labelEls = [];
  /** @type {{ group: SVGGElement, hit: SVGCircleElement }[]} */
  const vertexEls = [];

  for (let i = 0; i < n; i++) {
    const labelPos = axisPoint(i, n, RADAR_LABEL_R);
    const text = /** @type {SVGTextElement} */ (
      svgEl(svg, 'text', {
        x: labelPos.x,
        y: labelPos.y,
        class: 'player-radar-label',
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      })
    );
    text.textContent = `${ATTRS[i].label} 0`;
    labelEls.push(text);

    // Invisible axis strip for easier grabbing along the spoke.
    const tip = axisPoint(i, n, RADAR_RADIUS);
    svgEl(svg, 'line', {
      x1: RADAR_CENTER,
      y1: RADAR_CENTER,
      x2: tip.x,
      y2: tip.y,
      class: 'player-radar-axis-hit',
      'data-axis': String(i),
    });

    const group = /** @type {SVGGElement} */ (
      svgEl(svg, 'g', {
        class: 'player-radar-vertex',
        'data-axis': String(i),
      })
    );
    const hit = /** @type {SVGCircleElement} */ (
      svgEl(group, 'circle', {
        cx: RADAR_CENTER,
        cy: RADAR_CENTER,
        r: 18,
        class: 'player-radar-hit',
        tabindex: '0',
        role: 'slider',
        'aria-label': ATTRS[i].label,
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': '0',
        title: ATTRS[i].hint,
      })
    );
    vertexEls.push({ group, hit });
  }

  /**
   * @param {number[]} values
   */
  function paint(values) {
    currentValues = values.map((v) => Math.max(0, Math.min(100, Math.round(v))));
    valuePoly.setAttribute('points', valuesToPolygon(currentValues));
    for (let i = 0; i < n; i++) {
      const v = currentValues[i];
      const p = axisPoint(i, n, (RADAR_RADIUS * v) / 100);
      const { hit } = vertexEls[i];
      hit.setAttribute('cx', p.x.toFixed(2));
      hit.setAttribute('cy', p.y.toFixed(2));
      hit.setAttribute('aria-valuenow', String(v));
      labelEls[i].textContent = `${ATTRS[i].label} ${v}`;
    }
  }

  /**
   * @param {number} index
   * @param {number} value
   */
  function applyAxis(index, value) {
    if (currentValues[index] === value) return;
    currentValues[index] = value;
    paint(currentValues);
    opts.onChange?.(ATTRS[index].key, value);
  }

  /**
   * @param {PointerEvent} event
   */
  function onPointerMove(event) {
    if (dragIndex == null) return;
    const pos = pointerToSvg(svg, event);
    applyAxis(dragIndex, valueFromPointer(dragIndex, n, pos));
  }

  function endDrag() {
    if (dragIndex == null) return;
    vertexEls[dragIndex]?.group.classList.remove('is-dragging');
    wrap.classList.remove('is-dragging');
    dragIndex = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
  }

  /**
   * @param {number} index
   * @param {PointerEvent} event
   */
  function beginDrag(index, event) {
    event.preventDefault();
    event.stopPropagation();
    dragIndex = index;
    vertexEls[index].group.classList.add('is-dragging');
    wrap.classList.add('is-dragging');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    const pos = pointerToSvg(svg, event);
    applyAxis(index, valueFromPointer(index, n, pos));
  }

  for (let i = 0; i < n; i++) {
    const { group, hit } = vertexEls[i];
    group.addEventListener('pointerdown', (event) => beginDrag(i, event));

    hit.addEventListener('keydown', (event) => {
      let next = currentValues[i];
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next += 1;
      else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next -= 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = 100;
      else return;
      event.preventDefault();
      applyAxis(i, Math.max(0, Math.min(100, next)));
    });
  }

  // Drag from invisible axis strips.
  for (const el of svg.querySelectorAll('.player-radar-axis-hit')) {
    el.addEventListener('pointerdown', (event) => {
      const index = Number(/** @type {Element} */ (el).getAttribute('data-axis'));
      if (!Number.isFinite(index)) return;
      beginDrag(index, /** @type {PointerEvent} */ (event));
    });
  }

  wrap.appendChild(svg);
  mount.appendChild(wrap);
  paint(currentValues);

  return {
    /**
     * @param {number[]} values
     */
    update(values) {
      if (dragIndex != null) return;
      paint(values);
    },
    dispose() {
      endDrag();
      wrap.remove();
    },
  };
}

/**
 * Player attributes panel — interactive radar only.
 * @param {HTMLElement} containerEl
 * @param {{ onChange?: (stats: import('../config/playerStats.js').PlayerStats) => void }} [opts]
 */
export function createPlayerInfoPanel(containerEl, opts = {}) {
  if (!containerEl) {
    return { refresh() {}, updateLayout() {}, dispose() {} };
  }

  containerEl.classList.add('player-info-panel');
  containerEl.innerHTML = '';

  const title = document.createElement('p');
  title.className = 'config-section-title';
  title.textContent = '属性';
  containerEl.appendChild(title);

  /**
   * @param {AttrKey} key
   * @param {number} next
   */
  function commit(key, next) {
    const stats = setPlayerStat(key, next);
    opts.onChange?.(stats);
  }

  const radar = createRadarChart(containerEl, {
    onChange(key, value) {
      commit(key, value);
    },
  });

  function syncUi() {
    const stats = getPlayerStats();
    radar.update(ATTRS.map((def) => Math.round(stats[def.key])));
  }

  syncUi();

  return {
    refresh: syncUi,
    updateLayout() {},
    dispose() {
      radar.dispose();
      containerEl.innerHTML = '';
      containerEl.classList.remove('player-info-panel');
    },
  };
}
