import { mapClientToLocal } from './mobileLayout.js';

/**
 * Bottom-left virtual joystick for touch / coarse-pointer devices.
 * @param {{ onMove?: (x: number, y: number) => void }} [opts]
 *   x: -1…1 (right+), y: -1…1 (forward+/up on stick)
 */
export function createVirtualJoystick(opts = {}) {
  let root = document.getElementById('virtual-joystick');
  if (!root) {
    root = document.createElement('div');
    root.id = 'virtual-joystick';
    root.innerHTML =
      '<div class="vj-base" aria-hidden="true">' +
      '<div class="vj-knob"></div>' +
      '</div>';
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', '移动摇杆');
    document.getElementById('app')?.appendChild(root);
  }

  const base = root.querySelector('.vj-base');
  const knob = root.querySelector('.vj-knob');
  if (!base || !knob) {
    return { setVisible() {}, refresh() {}, dispose() {}, get active() { return false; } };
  }

  let cachedRadius = 48;
  const readRadius = () => {
    const cssR = parseFloat(getComputedStyle(root).getPropertyValue('--vj-radius'));
    cachedRadius = Number.isFinite(cssR) && cssR > 0 ? cssR : 48;
    return cachedRadius;
  };
  readRadius();

  /** @type {number | null} */
  let activePointerId = null;
  let enabled = true;
  let shown = !root.hidden;
  let lastKnobX = NaN;
  let lastKnobY = NaN;
  let lastEmitX = NaN;
  let lastEmitY = NaN;
  let isActiveClass = false;

  function emit(x, y) {
    if (x === lastEmitX && y === lastEmitY) return;
    lastEmitX = x;
    lastEmitY = y;
    opts.onMove?.(x, y);
  }

  function setKnob(dx, dy) {
    if (Math.abs(dx - lastKnobX) < 0.35 && Math.abs(dy - lastKnobY) < 0.35) return;
    lastKnobX = dx;
    lastKnobY = dy;
    knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  }

  function setActiveClass(on) {
    if (on === isActiveClass) return;
    isActiveClass = on;
    root.classList.toggle('is-active', on);
  }

  function reset() {
    activePointerId = null;
    setKnob(0, 0);
    setActiveClass(false);
    emit(0, 0);
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  function updateFromClient(clientX, clientY) {
    const local = mapClientToLocal(base, clientX, clientY);
    const dx = local.x - local.width * 0.5;
    const dy = local.y - local.height * 0.5;
    const r = cachedRadius;
    const len = Math.hypot(dx, dy);
    const scale = len > r && len > 1e-6 ? r / len : 1;
    const kx = dx * scale;
    const ky = dy * scale;
    setKnob(kx, ky);
    emit(kx / r, -ky / r);
  }

  function onPointerDown(e) {
    if (!enabled || activePointerId != null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    activePointerId = e.pointerId;
    readRadius();
    setActiveClass(true);
    root.setPointerCapture?.(e.pointerId);
    updateFromClient(e.clientX, e.clientY);
  }

  function onPointerMove(e) {
    if (e.pointerId !== activePointerId) return;
    e.preventDefault();
    e.stopPropagation();
    updateFromClient(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    if (e.pointerId !== activePointerId) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      root.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    reset();
  }

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  function syncVisibility() {
    const show = enabled;
    if (show === shown) {
      if (!show) return;
      return;
    }
    shown = show;
    root.hidden = !show;
    if (!show) reset();
  }

  syncVisibility();

  return {
    setVisible(v) {
      enabled = Boolean(v);
      syncVisibility();
    },
    refresh() {
      readRadius();
      syncVisibility();
    },
    dispose() {
      reset();
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerUp);
      root.remove();
    },
    get active() {
      return activePointerId != null;
    },
  };
}
