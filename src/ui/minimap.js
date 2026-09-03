import { COMBAT } from '../config/combatConfig.js';
import { bakeTopDownMap } from './minimapMapBake.js';

const MAP_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
  '<path fill="currentColor" d="M12 5.5l1.85 5.05H10.15L12 5.5z"/>' +
  '<path fill="currentColor" opacity="0.42" d="M12 18.5l-1.85-5.05h3.7L12 18.5z"/>' +
  '<circle cx="12" cy="12" r="1.2" fill="currentColor"/>' +
  '</svg>';

/**
 * Circular minimap — baked map window centered on player.
 * Toggle sits at bottom-right; panel expands / collapses toward top-left.
 */
export function createMinimap({
  mapRoot = null,
  size = COMBAT.minimapSize,
  bakeSize = COMBAT.minimapBakeSize,
  range = COMBAT.minimapRange,
} = {}) {
  let el = document.getElementById('combat-minimap');
  if (!el) {
    el = document.createElement('div');
    el.id = 'combat-minimap';
    el.innerHTML =
      `<button type="button" class="minimap-toggle" aria-label="折叠小地图" aria-expanded="true">${MAP_ICON}</button>` +
      '<div class="minimap-panel"><canvas class="minimap-canvas"></canvas></div>';
    document.getElementById('app')?.appendChild(el);
  }

  const toggleBtn = el.querySelector('.minimap-toggle');
  const canvas = el.querySelector('.minimap-canvas');
  const ctx = canvas.getContext('2d');
  const dpr = () => Math.min(window.devicePixelRatio, 2);
  canvas.width = size * dpr();
  canvas.height = size * dpr();
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  let expanded = true;
  let animating = false;
  let animTimer = 0;
  el.classList.add('is-expanded');
  el.classList.remove('is-collapsed');

  const half = () => canvas.width * 0.5;
  const viewRadius = range;
  /** @type {HTMLCanvasElement | null} */
  let mapCanvas = null;
  /** @type {{ minX: number, maxX: number, minZ: number, maxZ: number } | null} */
  let mapBounds = null;
  let mapReady = false;

  const bakePromise = bakeTopDownMap(mapRoot, bakeSize).then((result) => {
    if (!result) return;
    mapCanvas = result.canvas;
    mapBounds = result.bounds;
    mapReady = true;
  });

  function syncToggleUi() {
    el.classList.toggle('is-collapsed', !expanded);
    el.classList.toggle('is-expanded', expanded);
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', String(expanded));
      toggleBtn.setAttribute('aria-label', expanded ? '折叠小地图' : '展开小地图');
    }
  }

  function setExpanded(next) {
    const want = Boolean(next);
    if (want === expanded && !animating) return;
    expanded = want;
    animating = true;
    window.clearTimeout(animTimer);
    syncToggleUi();
    animTimer = window.setTimeout(() => {
      animating = false;
    }, 360);
  }

  function toggleExpanded() {
    setExpanded(!expanded);
  }

  toggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExpanded();
  });

  function setVisible(visible) {
    el.hidden = !visible;
    // Hide collapses; show again opens by default when combat starts.
    setExpanded(Boolean(visible));
  }

  function worldToMapPixel(x, z, out = { x: 0, y: 0 }) {
    if (!mapBounds || !mapCanvas) return out;
    const bw = mapBounds.maxX - mapBounds.minX;
    const bh = mapBounds.maxZ - mapBounds.minZ;
    out.x = bw > 1e-6 ? ((x - mapBounds.minX) / bw) * mapCanvas.width : mapCanvas.width * 0.5;
    out.y = bh > 1e-6 ? ((z - mapBounds.minZ) / bh) * mapCanvas.height : mapCanvas.height * 0.5;
    return out;
  }

  function worldToCanvasRelative(x, z, player, out = { x: 0, y: 0 }) {
    const h = half();
    const usable = h - 4 * dpr();
    const scale = usable / viewRadius;
    out.x = h + (x - player.x) * scale;
    out.y = h + (z - player.z) * scale;
    return out;
  }

  function drawMapWindow(player) {
    if (!mapReady || !mapCanvas || !mapBounds) return;

    const bw = mapBounds.maxX - mapBounds.minX;
    const bh = mapBounds.maxZ - mapBounds.minZ;
    const viewDiameter = viewRadius * 2;
    const srcW = (viewDiameter / bw) * mapCanvas.width;
    const srcH = (viewDiameter / bh) * mapCanvas.height;
    const center = worldToMapPixel(player.x, player.z);
    const sx = center.x - srcW * 0.5;
    const sy = center.y - srcH * 0.5;

    ctx.drawImage(mapCanvas, sx, sy, srcW, srcH, 0, 0, canvas.width, canvas.height);
  }

  function drawDirectionMarker(x, y, yaw, color, fillColor, markerSize, yawAdjust = Math.PI) {
    if (!ctx) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(yawAdjust - yaw);
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, markerSize * 0.14);
    ctx.beginPath();
    ctx.moveTo(0, -markerSize);
    ctx.lineTo(markerSize * 0.62, markerSize * 0.72);
    ctx.lineTo(0, markerSize * 0.28);
    ctx.lineTo(-markerSize * 0.62, markerSize * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function applyEdgeFade(r) {
    const h = half();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createRadialGradient(h, h, r * 0.38, h, h, r);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.62, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.84, 'rgba(255, 255, 255, 0.22)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  const _pt = { x: 0, y: 0 };

  /**
   * @param {{ x:number, z:number, yaw:number }} player
   * @param {Array<{ x:number, z:number, yaw:number }>} enemies
   */
  function update(player, enemies = []) {
    if (!ctx || el.hidden) return;
    // Keep drawing while open or mid-animation so the fold doesn't freeze on a blank frame.
    if (!expanded && !animating) return;
    const h = half();
    const r = h - 2 * dpr();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.beginPath();
    ctx.arc(h, h, r, 0, Math.PI * 2);
    ctx.clip();

    drawMapWindow(player);

    const enemySize = 5.5 * dpr();
    for (const e of enemies) {
      const dx = e.x - player.x;
      const dz = e.z - player.z;
      if (Math.hypot(dx, dz) > viewRadius) continue;
      worldToCanvasRelative(e.x, e.z, player, _pt);
      drawDirectionMarker(_pt.x, _pt.y, e.yaw ?? 0, 'rgba(255, 220, 220, 0.95)', '#ff5f5f', enemySize, 0);
    }

    const playerSize = 7 * dpr();
    drawDirectionMarker(h, h, player.yaw ?? 0, '#ffffff', '#4de4ff', playerSize, Math.PI);

    ctx.restore();

    applyEdgeFade(r);
  }

  function dispose() {
    window.clearTimeout(animTimer);
    el.remove();
  }

  syncToggleUi();

  return {
    setVisible,
    setExpanded,
    toggleExpanded,
    update,
    whenReady: () => bakePromise,
    dispose,
    get expanded() {
      return expanded;
    },
  };
}
