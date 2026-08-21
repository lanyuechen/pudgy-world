/**
 * Keyboard / mouse input matching Unity InputSystem_Actions.
 * Move: WASD → Vector2 (x=A/D, y=W/S)
 * RotateCamera: hold LMB · Look: pointer delta while held
 */
export function createPlayerInput(domElement) {
  const keys = new Set();
  const state = {
    moveX: 0,
    moveY: 0,
    jumpPressed: false,
    slidePressed: false,
    rotateCamera: false,
  };

  let lookAccumX = 0;
  let lookAccumY = 0;

  function refreshMove() {
    let x = 0;
    let y = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
    const len = Math.hypot(x, y) || 1;
    state.moveX = x / Math.max(len, 1);
    state.moveY = y / Math.max(len, 1);
    if (len > 1) {
      state.moveX = x / len;
      state.moveY = y / len;
    } else {
      state.moveX = x;
      state.moveY = y;
    }
  }

  function onKeyDown(e) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'Space') state.jumpPressed = true;
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
    // Ignore clicks on UI (scene select)
    if (e.target !== domElement) return;
    state.rotateCamera = true;
    domElement.setPointerCapture?.(e.pointerId);
  }

  function onPointerUp(e) {
    if (e.button !== 0) return;
    state.rotateCamera = false;
    try {
      domElement.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  }

  function onPointerMove(e) {
    if (!state.rotateCamera) return;
    lookAccumX += e.movementX;
    lookAccumY += e.movementY;
  }

  function onBlur() {
    keys.clear();
    state.moveX = 0;
    state.moveY = 0;
    state.slidePressed = false;
    state.rotateCamera = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  function consume() {
    const lookX = lookAccumX * 0.08;
    const lookY = lookAccumY * 0.08;
    lookAccumX = 0;
    lookAccumY = 0;
    const jump = state.jumpPressed;
    state.jumpPressed = false;
    return {
      moveX: state.moveX,
      moveY: state.moveY,
      lookX,
      lookY,
      jump,
      slide: state.slidePressed,
      rotateCamera: state.rotateCamera,
    };
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    domElement.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointermove', onPointerMove);
  }

  return { consume, dispose };
}
