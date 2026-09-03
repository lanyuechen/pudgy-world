import { COMBAT } from '../config/combatConfig.js';
import { mapClientToLocal } from '../ui/mobileLayout.js';

/**
 * Input layer — docs §3.2
 * WASD move · Shift run · Space jump · LMB drag look · wheel zoom
 * LMB hold (no drag) charge snowball throw · short click interact
 * Virtual stick (touch) merges into move.
 * Fishing: setUiOpen locks everything.
 * Config panel: setMoveLocked / setLookLocked independently.
 */

export function createControlInput(domElement) {
  const keys = new Set();
  let moveLocked = false;
  let lookLocked = false;

  let moveX = 0;
  let moveY = 0;
  /** External virtual joystick (−1…1). */
  let stickX = 0;
  let stickY = 0;
  let jumpPressed = false;
  let runHeld = false;
  let rotateCamera = false;
  let lookAccumX = 0;
  let lookAccumY = 0;
  let zoomAccum = 0;

  let pointerDown = false;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerDownAt = 0;
  let pointerDragged = false;
  let chargePointerActive = false;
  let throwChargeEnabled = false;
  /** @type {{ clientX:number, clientY:number }|null} */
  let interactClick = null;
  let throwRequested = false;
  let chargeRelease = null;
  let chargeLevel = 0;
  let isCharging = false;
  let returnPressed = false;
  /** Normalized pointer vs canvas: left=-1 … right=+1, bottom=-1 … top=+1 */
  let pointerNX = 0;
  let pointerNY = 0;
  let pointerClientX = 0;
  let pointerClientY = 0;
  let pointerOnCanvas = false;

  function updatePointerNorm(clientX, clientY) {
    const local = mapClientToLocal(domElement, clientX, clientY);
    if (local.width <= 0 || local.height <= 0) return;
    const nx = (local.x / local.width) * 2 - 1;
    const ny = -((local.y / local.height) * 2 - 1);
    pointerNX = Math.min(1, Math.max(-1, nx));
    pointerNY = Math.min(1, Math.max(-1, ny));
  }

  function refreshMove() {
    if (moveLocked) {
      moveX = 0;
      moveY = 0;
      return;
    }
    let x = stickX;
    let y = stickY;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      moveX = x / len;
      moveY = y / len;
    } else {
      moveX = x;
      moveY = y;
    }
  }

  /**
   * Keep only the dominant joystick axis so slight diagonals don't spin the camera.
   * e.g. mostly-right + a bit forward → pure strafe right.
   * @param {number} x
   * @param {number} y
   */
  function quantizeStickToCardinal(x, y) {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (ax < 1e-4 && ay < 1e-4) return { x: 0, y: 0 };
    const mag = Math.min(1, Math.hypot(x, y));
    if (ax > ay) return { x: Math.sign(x) * mag, y: 0 };
    return { x: 0, y: Math.sign(y) * mag };
  }

  /**
   * Virtual joystick axes (−1…1). y+ = forward.
   * Stick is snapped to one cardinal direction (dominant axis only).
   * @param {number} x
   * @param {number} y
   */
  function setStick(x, y) {
    const rawX = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    const rawY = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
    const q = quantizeStickToCardinal(rawX, rawY);
    stickX = q.x;
    stickY = q.y;
    refreshMove();
  }

  function clearLookState() {
    rotateCamera = false;
    lookAccumX = 0;
    lookAccumY = 0;
    zoomAccum = 0;
    pointerDown = false;
    chargePointerActive = false;
    isCharging = false;
    chargeLevel = 0;
  }

  function updateChargeState(now) {
    if (
      throwChargeEnabled &&
      chargePointerActive &&
      pointerDown &&
      !pointerDragged &&
      !moveLocked &&
      !lookLocked
    ) {
      const held = (now - pointerDownAt) / 1000;
      const grace = COMBAT.cameraDragGrace ?? 0.15;
      if (held < grace) {
        isCharging = false;
        chargeLevel = 0;
        return;
      }
      isCharging = true;
      const span = Math.max(0.01, COMBAT.chargeMaxHold - COMBAT.chargeMinHold);
      chargeLevel = Math.min(1, Math.max(0, (held - grace) / span));
      return;
    }
    if (!chargePointerActive || pointerDragged || moveLocked || lookLocked) {
      isCharging = false;
      chargeLevel = 0;
      return;
    }
    const held = (now - pointerDownAt) / 1000;
    if (held < COMBAT.chargeMinHold) {
      isCharging = false;
      chargeLevel = 0;
      return;
    }
    isCharging = true;
    const span = COMBAT.chargeMaxHold - COMBAT.chargeMinHold;
    chargeLevel = span > 0 ? Math.min(1, (held - COMBAT.chargeMinHold) / span) : 1;
  }

  function setThrowChargeEnabled(v) {
    throwChargeEnabled = !!v;
  }

  /** @deprecated use setThrowChargeEnabled */
  function setThrowAimLock(v) {
    throwChargeEnabled = !!v;
  }

  /** Full freeze (fishing / legacy UI). */
  function setUiOpen(v) {
    const on = !!v;
    moveLocked = on;
    lookLocked = on;
    if (on) {
      stickX = 0;
      stickY = 0;
      moveX = 0;
      moveY = 0;
      jumpPressed = false;
      runHeld = false;
      clearLookState();
    } else {
      refreshMove();
    }
  }

  function setMoveLocked(v) {
    moveLocked = !!v;
    if (moveLocked) {
      stickX = 0;
      stickY = 0;
      moveX = 0;
      moveY = 0;
      jumpPressed = false;
      runHeld = false;
    } else {
      refreshMove();
    }
  }

  function setLookLocked(v) {
    lookLocked = !!v;
    if (lookLocked) clearLookState();
  }

  function onKeyDown(e) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'Escape' && !e.repeat) returnPressed = true;
    if (moveLocked) return;
    if (e.code === 'Space') {
      if (!e.repeat) jumpPressed = true;
    }
    if (e.code === 'KeyF' && !e.repeat) throwRequested = true;
    keys.add(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') runHeld = true;
    refreshMove();
  }

  function onKeyUp(e) {
    keys.delete(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      runHeld = !moveLocked && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
    }
    refreshMove();
  }

  function trackPointer(clientX, clientY) {
    pointerClientX = clientX;
    pointerClientY = clientY;
    updatePointerNorm(clientX, clientY);
  }

  function onPointerDown(e) {
    if (e.button !== 0 || e.target !== domElement || lookLocked) return;
    pointerDown = true;
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    pointerDownAt = performance.now();
    pointerDragged = false;
    chargePointerActive = !moveLocked;
    rotateCamera = false;
    pointerOnCanvas = true;
    trackPointer(e.clientX, e.clientY);
    domElement.setPointerCapture?.(e.pointerId);
  }

  function onPointerUp(e) {
    if (e.button !== 0) return;
    const now = performance.now();
    const dragged =
      pointerDragged || Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > 4;
    const held = (now - pointerDownAt) / 1000;

    if (!moveLocked && !lookLocked && pointerDown) {
      if (throwChargeEnabled) {
        if (isCharging) {
          const span = Math.max(0.01, COMBAT.chargeMaxHold - COMBAT.chargeMinHold);
          const grace = COMBAT.cameraDragGrace ?? 0.15;
          const power = Math.min(1, Math.max(0, (held - grace) / span));
          chargeRelease = {
            chargeLevel: power,
            clientX: e.clientX,
            clientY: e.clientY,
          };
        }
      } else if (!dragged && held >= COMBAT.chargeMinHold) {
        const span = COMBAT.chargeMaxHold - COMBAT.chargeMinHold;
        const power =
          span > 0
            ? Math.min(1, (Math.min(held, COMBAT.chargeMaxHold) - COMBAT.chargeMinHold) / span)
            : 1;
        chargeRelease = {
          chargeLevel: power,
          clientX: e.clientX,
          clientY: e.clientY,
        };
      } else if (!dragged && e.target === domElement) {
        interactClick = { clientX: e.clientX, clientY: e.clientY };
      }
    }

    pointerDown = false;
    pointerDragged = false;
    chargePointerActive = false;
    rotateCamera = false;
    isCharging = false;
    chargeLevel = 0;
    try {
      domElement.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPointerMove(e) {
    if (lookLocked) return;
    trackPointer(e.clientX, e.clientY);
    if (!pointerDown || (e.buttons & 1) === 0) return;

    if (throwChargeEnabled && isCharging) return;

    const held = (performance.now() - pointerDownAt) / 1000;
    if (chargePointerActive && held >= COMBAT.chargeMinHold && !throwChargeEnabled) return;

    if (Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > 4) {
      pointerDragged = true;
      rotateCamera = true;
    }
    if (!rotateCamera) return;
    lookAccumX += e.movementX;
    lookAccumY += e.movementY;
  }

  function onPointerEnter(e) {
    if (lookLocked) return;
    pointerOnCanvas = true;
    trackPointer(e.clientX, e.clientY);
  }

  function onPointerLeave() {
    pointerOnCanvas = false;
  }

  function onWheel(e) {
    e.preventDefault();
    if (!lookLocked) zoomAccum += e.deltaY;
  }

  function onBlur() {
    keys.clear();
    stickX = 0;
    stickY = 0;
    moveX = 0;
    moveY = 0;
    runHeld = false;
    rotateCamera = false;
    pointerDown = false;
    pointerOnCanvas = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerenter', onPointerEnter);
  domElement.addEventListener('pointerleave', onPointerLeave);
  domElement.addEventListener('wheel', onWheel, { passive: false });
  domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  function consume() {
    updateChargeState(performance.now());
    const uiOpen = moveLocked && lookLocked;
    const frame = {
      moveX: moveLocked ? 0 : moveX,
      moveY: moveLocked ? 0 : moveY,
      lookX: lookLocked ? 0 : lookAccumX,
      lookY: lookLocked ? 0 : lookAccumY,
      zoomDelta: lookLocked ? 0 : zoomAccum,
      jump: !moveLocked && jumpPressed,
      run: !moveLocked && runHeld,
      slide: !moveLocked && runHeld,
      rotateCamera: !lookLocked && rotateCamera,
      pointerNX: lookLocked ? 0 : pointerNX,
      pointerNY: lookLocked ? 0 : pointerNY,
      pointerClientX: lookLocked ? 0 : pointerClientX,
      pointerClientY: lookLocked ? 0 : pointerClientY,
      pointerOnCanvas: !lookLocked && pointerOnCanvas,
      pointerDown: !moveLocked && !lookLocked && pointerDown,
      throwSnowball: !moveLocked && throwRequested,
      chargeRelease,
      chargeLevel: !moveLocked && !lookLocked ? chargeLevel : 0,
      isCharging: !moveLocked && !lookLocked && isCharging,
      returnPressed,
      interactClick: moveLocked || lookLocked ? null : interactClick,
      locked: moveLocked,
      uiOpen,
      moveLocked,
      lookLocked,
    };
    lookAccumX = 0;
    lookAccumY = 0;
    zoomAccum = 0;
    jumpPressed = false;
    throwRequested = false;
    chargeRelease = null;
    returnPressed = false;
    interactClick = null;
    return frame;
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    domElement.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerenter', onPointerEnter);
    domElement.removeEventListener('pointerleave', onPointerLeave);
    domElement.removeEventListener('wheel', onWheel);
  }

  return {
    consume,
    setUiOpen,
    setMoveLocked,
    setLookLocked,
    setStick,
    setThrowChargeEnabled,
    setThrowAimLock,
    dispose,
    get uiOpen() {
      return moveLocked && lookLocked;
    },
    get moveLocked() {
      return moveLocked;
    },
    get lookLocked() {
      return lookLocked;
    },
  };
}
