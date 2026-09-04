/**
 * Mobile helpers: touch UI detection + portrait landscape tip (user-triggered lock).
 */

/** True after a successful screen.orientation.lock('landscape'). */
let nativeLandscapeLocked = false;

export function isTouchUi() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  if ('ontouchstart' in window && window.matchMedia('(max-width: 1024px)').matches) {
    return true;
  }
  return false;
}

export function hasNativeLandscapeLock() {
  return nativeLandscapeLocked;
}

/** Keep html classes / landscape tip in sync with device orientation. */
export function syncMobileLayoutClasses() {
  const touch = isTouchUi();
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  document.documentElement.classList.toggle('is-touch-ui', touch);

  const tip = document.getElementById('landscape-tip');
  const showTip = touch && portrait;
  if (tip) {
    tip.hidden = !showTip;
    tip.setAttribute('aria-hidden', showTip ? 'false' : 'true');
  }

  return { touch, portrait: touch && portrait };
}

function isFullscreenActive() {
  const doc = /** @type {Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  }} */ (document);
  return Boolean(
    doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement,
  );
}

/**
 * Enter fullscreen first so orientation.lock is more likely to be allowed.
 * @param {Element} [el]
 * @returns {Promise<boolean>}
 */
export async function tryRequestFullscreen(el = document.documentElement) {
  if (isFullscreenActive()) return true;

  const target = /** @type {Element & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    webkitRequestFullScreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  }} */ (el || document.documentElement);

  const request =
    target.requestFullscreen?.bind(target) ||
    target.webkitRequestFullscreen?.bind(target) ||
    target.webkitRequestFullScreen?.bind(target) ||
    target.mozRequestFullScreen?.bind(target) ||
    target.msRequestFullscreen?.bind(target);

  if (!request) return false;

  try {
    await Promise.resolve(request());
    return isFullscreenActive();
  } catch {
    return false;
  }
}

/**
 * Fullscreen then native landscape lock (same user-gesture chain).
 * @returns {Promise<boolean>}
 */
export async function tryLockLandscape() {
  await tryRequestFullscreen(document.documentElement);

  try {
    const orient = screen.orientation;
    if (!orient?.lock) {
      nativeLandscapeLocked = false;
      return false;
    }
    await orient.lock('landscape');
    nativeLandscapeLocked = true;
    return true;
  } catch {
    nativeLandscapeLocked = false;
    return false;
  }
}

/**
 * Canvas drawing-buffer size.
 * @param {HTMLCanvasElement | null} [canvas]
 */
export function getRenderSize(canvas) {
  const el = canvas || document.getElementById('c');
  const width = Math.max(1, Math.round(el?.clientWidth || window.innerWidth));
  const height = Math.max(1, Math.round(el?.clientHeight || window.innerHeight));
  return { width, height };
}

/**
 * Map screen client coords → element local CSS pixels.
 * @param {HTMLElement} el
 * @param {number} clientX
 * @param {number} clientY
 */
export function mapClientToLocal(el, clientX, clientY) {
  const rect = el.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
    width: el.clientWidth || 1,
    height: el.clientHeight || 1,
  };
}

/**
 * Install orientation listeners + portrait tip that locks landscape on tap.
 */
export function installMobileLandscape() {
  const bumpResize = () => {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
  };

  const onChange = () => {
    syncMobileLayoutClasses();
    bumpResize();
  };

  syncMobileLayoutClasses();

  window.addEventListener('orientationchange', onChange);
  window.matchMedia('(orientation: portrait)').addEventListener?.('change', onChange);
  window.matchMedia('(pointer: coarse)').addEventListener?.('change', onChange);
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);

  const tipBtn = document.getElementById('landscape-tip-btn');
  tipBtn?.addEventListener('click', () => {
    void tryLockLandscape().then(() => {
      syncMobileLayoutClasses();
      bumpResize();
    });
  });

  return {
    dispose() {
      window.removeEventListener('orientationchange', onChange);
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    },
  };
}
