/**
 * Keyboard / mouse input matching Unity InputSystem_Actions.
 * Move: WASD → Vector2 (x=A/D, y=W/S)
 * Sprint/Slide: Shift → OnSlide
 * Jump: Space
 * ThrowSnowball: F (Keyboard) / buttonWest (Gamepad)
 * RotateCamera: hold LMB · Look: pointer delta
 * Soft look: pointer position vs canvas center (normalized [-1,1])
 */
import { PLAYER } from '../config/playerConfig.js';

export function createPlayerInput(domElement) {
  const keys = new Set();
  const state = {
    moveX: 0,
    moveY: 0,
    jumpPressed: false,
    /** Unity: ThrowSnowballPressed |= pressed */
    throwSnowballRequested: false,
    returnPressed: false,
    slidePressed: false,
    rotateCamera: false,
    /** Normalized pointer vs canvas center: left=-1 … right=+1 */
    pointerNX: 0,
    /** Normalized pointer vs canvas center: bottom=-1 … top=+1 */
    pointerNY: 0,
  };

  let lookAccumX = 0;
  let lookAccumY = 0;
  let zoomAccum = 0;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerDragged = false;
  let pointerDown = false;
  /** @type {{ clientX: number, clientY: number } | null} */
  let interactClick = null;

  function refreshMove() {
    let x = 0;
    let y = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      state.moveX = x / len;
      state.moveY = y / len;
    } else {
      state.moveX = x;
      state.moveY = y;
    }
  }

  function updatePointerNorm(clientX, clientY) {
    const rect = domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
    state.pointerNX = THREE_CLAMP(nx, -1, 1);
    state.pointerNY = THREE_CLAMP(ny, -1, 1);
  }

  function THREE_CLAMP(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function onKeyDown(e) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'Space' && !e.repeat) state.jumpPressed = true;
    if ((e.code === 'KeyF') && !e.repeat) {
      state.throwSnowballRequested = true;
    }
    if (e.code === 'Escape' && !e.repeat) state.returnPressed = true;
    keys.add(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.slidePressed = true;
    refreshMove();
  }

  function onKeyUp(e) {
    keys.delete(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      state.slidePressed = keys.has('ShiftLeft') || keys.has('ShiftRight');
    }
    refreshMove();
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    if (e.target !== domElement) return;
    pointerDown = true;
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    pointerDragged = false;
    state.rotateCamera = false;
    updatePointerNorm(e.clientX, e.clientY);
    domElement.setPointerCapture?.(e.pointerId);
  }

  function onPointerUp(e) {
    if (e.button !== 0) return;
    const dragged =
      pointerDragged ||
      Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > 4;
    if (pointerDown && !dragged && e.target === domElement) {
      interactClick = { clientX: e.clientX, clientY: e.clientY };
    }
    pointerDown = false;
    pointerDragged = false;
    state.rotateCamera = false;
    try {
      domElement.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  }

  function onPointerMove(e) {
    updatePointerNorm(e.clientX, e.clientY);
    if (!pointerDown || (e.buttons & 1) === 0) return;

    const dragDist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
    if (dragDist > 4) {
      pointerDragged = true;
      state.rotateCamera = true;
    }
    if (!state.rotateCamera) return;
    lookAccumX += e.movementX;
    lookAccumY += e.movementY;
  }

  function onPointerLeave() {
    // Ease soft-look back to center when cursor leaves the game view
    state.pointerNX = 0;
    state.pointerNY = 0;
  }

  function onWheel(e) {
    e.preventDefault();
    // Positive deltaY = scroll down = zoom out (increase distance)
    zoomAccum += e.deltaY;
  }

  function onBlur() {
    keys.clear();
    state.moveX = 0;
    state.moveY = 0;
    state.slidePressed = false;
    state.rotateCamera = false;
    pointerDown = false;
    pointerDragged = false;
    state.pointerNX = 0;
    state.pointerNY = 0;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerleave', onPointerLeave);
  domElement.addEventListener('wheel', onWheel, { passive: false });
  domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  function consume() {
    const lookX = lookAccumX * PLAYER.mouseDeltaScale;
    const lookY = lookAccumY * PLAYER.mouseDeltaScale;
    const zoomDelta = zoomAccum;
    lookAccumX = 0;
    lookAccumY = 0;
    zoomAccum = 0;
    const jump = state.jumpPressed;
    state.jumpPressed = false;
    const throwSnowball = state.throwSnowballRequested;
    state.throwSnowballRequested = false;
    const returnPressed = state.returnPressed;
    state.returnPressed = false;
    const click = interactClick;
    interactClick = null;
    return {
      moveX: state.moveX,
      moveY: state.moveY,
      lookX,
      lookY,
      zoomDelta,
      jump,
      throwSnowball,
      returnPressed,
      interactClick: click,
      slide: state.slidePressed,
      rotateCamera: state.rotateCamera,
      pointerNX: state.pointerNX,
      pointerNY: state.pointerNY,
    };
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    domElement.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerleave', onPointerLeave);
    domElement.removeEventListener('wheel', onWheel);
  }

  return { consume, dispose };
}
