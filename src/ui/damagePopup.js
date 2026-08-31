import * as THREE from 'three';

/**
 * Floating damage numbers projected from world positions (e.g. above enemy head).
 */
export function createDamagePopup(camera, canvas) {
  /** @type {Array<{ el: HTMLElement, age: number, duration: number, world: THREE.Vector3 }>} */
  const popups = [];
  let container = document.getElementById('damage-popups');
  if (!container) {
    container = document.createElement('div');
    container.id = 'damage-popups';
    document.getElementById('app')?.appendChild(container);
  }

  const _ndc = new THREE.Vector3();

  function spawn(worldPos, text = '-1') {
    const el = document.createElement('span');
    el.className = 'damage-popup';
    el.textContent = text;
    container.appendChild(el);
    popups.push({
      el,
      age: 0,
      duration: 0.85,
      world: worldPos.clone?.() ?? new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z),
    });
  }

  function update(dt) {
    const rect = canvas.getBoundingClientRect();
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.age += dt;
      const t = p.age / p.duration;
      if (t >= 1) {
        p.el.remove();
        popups.splice(i, 1);
        continue;
      }

      _ndc.set(p.world.x, p.world.y + 1.4 + t * 0.5, p.world.z);
      _ndc.project(camera);

      if (_ndc.z > 1) {
        p.el.style.visibility = 'hidden';
        continue;
      }
      p.el.style.visibility = 'visible';

      const sx = rect.left + ((_ndc.x + 1) * 0.5) * rect.width;
      const sy = rect.top + ((1 - _ndc.y) * 0.5) * rect.height;

      p.el.style.left = `${sx}px`;
      p.el.style.top = `${sy}px`;
      p.el.style.opacity = String(1 - t);
      p.el.style.transform = `translate(-50%, -50%) scale(${1 + t * 0.12})`;
    }
  }

  function setVisible(visible) {
    container.hidden = !visible;
  }

  function dispose() {
    for (const p of popups) p.el.remove();
    popups.length = 0;
    container.remove();
  }

  return { spawn, update, setVisible, dispose };
}
