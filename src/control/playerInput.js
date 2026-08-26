/**
 * Input layer — docs §3.2
 * WASD move · Shift run · Space jump · LMB drag look · wheel zoom
 * UIOpen freezes everything.
 */

export function createControlInput(domElement) {
  const keys = new Set();
  let uiOpen = false;

  let moveX = 0;
  let moveY = 0;
  let jumpPressed = false;
  let runHeld = false;
  let rotateCamera = false;
  let lookAccumX = 0;
  let lookAccumY = 0;
  let zoomAccum = 0;

  let pointerDown = false;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerDragged = false;
  /** @type {{ clientX:number, clientY:number }|null} */
  let interactClick = null;
  let throwRequested = false;
  let returnPressed = false;
  /** Normalized pointer vs canvas: left=-1 … right=+1, bottom=-1 … top=+1 */
  let pointerNX = 0;
  let pointerNY = 0;

  function updatePointerNorm(clientX, clientY) {
    const rect = domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
    pointerNX = Math.min(1, Math.max(-1, nx));
    pointerNY = Math.min(1, Math.max(-1, ny));
  }

  function refreshMove() {
    if (uiOpen) {
      moveX = 0;
      moveY = 0;
      return;
    }
    let x = 0;
    let y = 0;
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

  function setUiOpen(v) {
    uiOpen = !!v;
    if (uiOpen) {
      moveX = 0;
      moveY = 0;
      jumpPressed = false;
      runHeld = false;
      rotateCamera = false;
      lookAccumX = 0;
      lookAccumY = 0;
      zoomAccum = 0;
      pointerDown = false;
    } else {
      refreshMove();
    }
  }

  function onKeyDown(e) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (uiOpen) return;
    if (e.code === 'Space') {
      if (!e.repeat) jumpPressed = true;
    }
    if (e.code === 'KeyF' && !e.repeat) throwRequested = true;
    if (e.code === 'Escape' && !e.repeat) returnPressed = true;
    keys.add(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') runHeld = true;
    refreshMove();
  }

  function onKeyUp(e) {
    keys.delete(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      runHeld = !uiOpen && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
    }
    refreshMove();
  }

  function onPointerDown(e) {
    if (e.button !== 0 || e.target !== domElement || uiOpen) return;
    pointerDown = true;
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    pointerDragged = false;
    rotateCamera = false;
    updatePointerNorm(e.clientX, e.clientY);
    domElement.setPointerCapture?.(e.pointerId);
  }

  function onPointerUp(e) {
    if (e.button !== 0) return;
    const dragged =
      pointerDragged || Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > 4;
    if (!uiOpen && pointerDown && !dragged && e.target === domElement) {
      interactClick = { clientX: e.clientX, clientY: e.clientY };
    }
    pointerDown = false;
    pointerDragged = false;
    rotateCamera = false;
    try {
      domElement.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPointerMove(e) {
    if (uiOpen) return;
    updatePointerNorm(e.clientX, e.clientY);
    if (!pointerDown || (e.buttons & 1) === 0) return;
    if (Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) > 4) {
      pointerDragged = true;
      rotateCamera = true;
    }
    if (!rotateCamera) return;
    lookAccumX += e.movementX;
    lookAccumY += e.movementY;
  }

  function onPointerLeave() {
    pointerNX = 0;
    pointerNY = 0;
  }

  function onWheel(e) {
    e.preventDefault();
    if (!uiOpen) zoomAccum += e.deltaY;
  }

  function onBlur() {
    keys.clear();
    moveX = 0;
    moveY = 0;
    runHeld = false;
    rotateCamera = false;
    pointerDown = false;
    pointerNX = 0;
    pointerNY = 0;
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
    const frame = {
      moveX: uiOpen ? 0 : moveX,
      moveY: uiOpen ? 0 : moveY,
      lookX: uiOpen ? 0 : lookAccumX,
      lookY: uiOpen ? 0 : lookAccumY,
      zoomDelta: uiOpen ? 0 : zoomAccum,
      jump: !uiOpen && jumpPressed,
      run: !uiOpen && runHeld,
      slide: !uiOpen && runHeld,
      rotateCamera: !uiOpen && rotateCamera,
      pointerNX: uiOpen ? 0 : pointerNX,
      pointerNY: uiOpen ? 0 : pointerNY,
      throwSnowball: !uiOpen && throwRequested,
      returnPressed,
      interactClick: uiOpen ? null : interactClick,
      locked: uiOpen,
      uiOpen,
    };
    lookAccumX = 0;
    lookAccumY = 0;
    zoomAccum = 0;
    jumpPressed = false;
    throwRequested = false;
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
    domElement.removeEventListener('pointerleave', onPointerLeave);
    domElement.removeEventListener('wheel', onWheel);
  }

  return {
    consume,
    setUiOpen,
    dispose,
    get uiOpen() {
      return uiOpen;
    },
  };
}
