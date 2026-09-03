/**
 * Mobile helpers: touch UI detection + forced landscape (CSS rotate) sizing/coords.
 */

export function isTouchUi() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  if ('ontouchstart' in window && window.matchMedia('(max-width: 1024px)').matches) {
    return true;
  }
  return false;
}

export function isMobilePortraitForced() {
  return document.documentElement.classList.contains('is-mobile-portrait');
}

/** Keep html classes in sync with device / orientation. */
export function syncMobileLayoutClasses() {
  const touch = isTouchUi();
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  document.documentElement.classList.toggle('is-touch-ui', touch);
  document.documentElement.classList.toggle('is-mobile-portrait', touch && portrait);
  return { touch, portrait: touch && portrait };
}

/**
 * Prefer native landscape lock when the browser allows it (often needs a gesture).
 * @returns {Promise<boolean>}
 */
export async function tryLockLandscape() {
  try {
    const orient = screen.orientation;
    if (!orient?.lock) return false;
    await orient.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

/**
 * Canvas/CSS pixel size for rendering (works with forced-landscape rotate).
 * @param {HTMLCanvasElement | null} [canvas]
 */
export function getRenderSize(canvas) {
  const el = canvas || document.getElementById('c');
  const width = Math.max(1, Math.round(el?.clientWidth || window.innerWidth));
  const height = Math.max(1, Math.round(el?.clientHeight || window.innerHeight));
  return { width, height };
}

/**
 * Map screen client coords → element local CSS pixels (handles forced landscape).
 * @param {HTMLElement} el
 * @param {number} clientX
 * @param {number} clientY
 */
export function mapClientToLocal(el, clientX, clientY) {
  const width = el.clientWidth || 1;
  const height = el.clientHeight || 1;

  if (!isMobilePortraitForced()) {
    const rect = el.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      width,
      height,
    };
  }

  // #app is centered and rotated 90deg CW while sized 100vh × 100vw.
  // Forward (local from center): (lx, ly) → screen (−ly, lx)
  // Inverse: (sx, sy) → (sy, −sx)
  const app = document.getElementById('app');
  const aw = app?.clientWidth || window.innerHeight;
  const ah = app?.clientHeight || window.innerWidth;
  const cx = window.innerWidth * 0.5;
  const cy = window.innerHeight * 0.5;
  const sx = clientX - cx;
  const sy = clientY - cy;
  let appX = sy + aw * 0.5;
  let appY = -sx + ah * 0.5;

  if (app && el !== app) {
    let ox = 0;
    let oy = 0;
    /** @type {HTMLElement | null} */
    let node = el;
    while (node && node !== app) {
      ox += node.offsetLeft;
      oy += node.offsetTop;
      node = /** @type {HTMLElement | null} */ (node.offsetParent);
    }
    if (node === app) {
      appX -= ox;
      appY -= oy;
    }
  }

  return {
    x: appX,
    y: appY,
    width,
    height,
  };
}

/**
 * Install orientation listeners + optional first-gesture landscape lock.
 */
export function installMobileLandscape() {
  syncMobileLayoutClasses();

  const onChange = () => {
    syncMobileLayoutClasses();
    window.dispatchEvent(new Event('resize'));
  };

  window.addEventListener('orientationchange', onChange);
  window.matchMedia('(orientation: portrait)').addEventListener?.('change', onChange);
  window.matchMedia('(pointer: coarse)').addEventListener?.('change', onChange);

  const tryLockOnce = () => {
    if (!isTouchUi()) return;
    void tryLockLandscape().then(() => syncMobileLayoutClasses());
  };
  window.addEventListener('pointerdown', tryLockOnce, { once: true, passive: true });
  window.addEventListener('touchstart', tryLockOnce, { once: true, passive: true });

  return {
    dispose() {
      window.removeEventListener('orientationchange', onChange);
    },
  };
}
