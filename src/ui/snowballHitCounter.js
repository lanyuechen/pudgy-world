/**
 * Snowball.cs → EventManager.PlayerEvents.OnSnowballHit → SnowballHitCounter
 * Top-left HUD matching Pengu_Plaza SnowballHitCounter layout.
 */
export function createSnowballHitCounter() {
  let el = document.getElementById('snowball-hit-counter');
  if (!el) {
    el = document.createElement('div');
    el.id = 'snowball-hit-counter';
    el.innerHTML =
      '<span class="snowball-icon" aria-hidden="true"></span><span class="snowball-count">0</span>';
    document.getElementById('app')?.appendChild(el);
  }

  const countEl = el.querySelector('.snowball-count');
  let count = 0;

  function setCount(value) {
    if (count === value) return;
    count = value;
    if (countEl) countEl.textContent = String(count);
  }

  function onHit() {
    setCount(count + 1);
  }

  function reset() {
    setCount(0);
  }

  function setVisible(visible) {
    el.hidden = !visible;
  }

  return { onHit, reset, setVisible, get count() { return count; } };
}
