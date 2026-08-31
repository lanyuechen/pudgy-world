import { CONTROL } from './playerConfig.js';

export const GAME_SETTINGS_KEY = 'pudgyworld.gameSettings.v1';

/** @typedef {'cameraFollow' | 'independent'} ThirdPersonYawMode */

/** @typedef {{ thirdPersonYawMode: ThirdPersonYawMode, mouseSensitivity: number, invertLookX: boolean, invertLookY: boolean, zoomSensitivity: number }} GameSettings */

/** @type {GameSettings} */
export const GAME_SETTINGS_DEFAULTS = Object.freeze({
  thirdPersonYawMode: 'independent',
  mouseSensitivity: 0.18,
  invertLookX: false,
  invertLookY: false,
  zoomSensitivity: 0.01,
});

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @param {unknown} raw
 * @returns {GameSettings}
 */
export function normalizeGameSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const yawMode =
    src.thirdPersonYawMode === 'cameraFollow' ? 'cameraFollow' : 'independent';
  return {
    thirdPersonYawMode: yawMode,
    mouseSensitivity: clamp(
      Number(src.mouseSensitivity) || GAME_SETTINGS_DEFAULTS.mouseSensitivity,
      0.04,
      0.55,
    ),
    invertLookX: Boolean(src.invertLookX),
    invertLookY: Boolean(src.invertLookY),
    zoomSensitivity: clamp(
      Number(src.zoomSensitivity) || GAME_SETTINGS_DEFAULTS.zoomSensitivity,
      0.003,
      0.04,
    ),
  };
}

/**
 * @returns {GameSettings}
 */
export function loadGameSettings() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { ...GAME_SETTINGS_DEFAULTS };
  }
  try {
    const raw = localStorage.getItem(GAME_SETTINGS_KEY);
    if (!raw) return { ...GAME_SETTINGS_DEFAULTS };
    return normalizeGameSettings(JSON.parse(raw));
  } catch {
    return { ...GAME_SETTINGS_DEFAULTS };
  }
}

/**
 * @param {GameSettings} settings
 */
export function saveGameSettings(settings) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const next = normalizeGameSettings(settings);
  localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(next));
}

/**
 * Push settings into live CONTROL (camera reads these each frame).
 * @param {Partial<GameSettings>} settings
 * @param {{ exploreControls?: { rotateSpeed?: number, zoomSpeed?: number } | null }} [opts]
 * @returns {GameSettings}
 */
export function applyGameSettings(settings, opts = {}) {
  const next = normalizeGameSettings({ ...loadGameSettings(), ...settings });
  CONTROL.thirdPersonYawMode = next.thirdPersonYawMode;
  CONTROL.mouseSensitivity = next.mouseSensitivity;
  CONTROL.invertLookX = next.invertLookX;
  CONTROL.invertLookY = next.invertLookY;
  CONTROL.zoomSensitivity = next.zoomSensitivity;

  const explore = opts.exploreControls;
  if (explore) {
    // OrbitControls: default rotateSpeed 1 ≈ our default mouseSensitivity 0.18
    explore.rotateSpeed = next.mouseSensitivity / GAME_SETTINGS_DEFAULTS.mouseSensitivity;
    explore.zoomSpeed = next.zoomSensitivity / GAME_SETTINGS_DEFAULTS.zoomSensitivity;
  }

  return next;
}
