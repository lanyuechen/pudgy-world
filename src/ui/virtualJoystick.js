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
    return { setVisible() {}, dispose() {}, get active() { return false; } };
  }

  const maxRadius = () => {
    const cssR = parseFloat(getComputedStyle(root).getPropertyValue('--vj-radius'));
    return Number.isFinite(cssR) && cssR > 0 ? cssR : 48;
  };

  /** @type {number | null} */
  let activePointerId = null;
  let enabled = true;

  function emit(x, y) {
    opts.onMove?.(x, y);
  }

  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  }

  function reset() {
    activePointerId = null;
    setKnob(0, 0);
    root.classList.remove('is-active');
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
    const r = maxRadius();
    const len = Math.hypot(dx, dy);
    const scale = len > r && len > 1e-6 ? r / len : 1;
    const kx = dx * scale;
    const ky = dy * scale;
    setKnob(kx, ky);
    // Local up (−y) → move forward (y+)
    emit(kx / r, -ky / r);
  }

  function onPointerDown(e) {
    if (!enabled || activePointerId != null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    activePointerId = e.pointerId;
    root.classList.add('is-active');
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
    // Always show for now (desktop testing); gate with isTouchUi() later if needed.
    const show = enabled;
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
