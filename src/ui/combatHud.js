/**
 * Survival combat HUD — top-right kills / wave total.
 */
export function createCombatHud() {
  let el = document.getElementById('combat-hud');
  if (!el) {
    el = document.createElement('div');
    el.id = 'combat-hud';
    el.innerHTML =
      '<div class="combat-hud-inner">' +
      '<span class="combat-hud-score">0/0</span>' +
      '</div>';
    document.getElementById('app')?.appendChild(el);
  }

  const scoreEl = el.querySelector('.combat-hud-score');
  let kills = 0;
  let waveTotal = 0;

  function renderScore() {
    if (scoreEl) scoreEl.textContent = `${kills}/${waveTotal}`;
  }

  function setVisible(visible) {
    el.hidden = !visible;
  }

  function setWaveTotal(total) {
    waveTotal = Math.max(0, total | 0);
    renderScore();
  }

  function addKill() {
    kills += 1;
    renderScore();
  }

  function resetWave(total) {
    kills = 0;
    setWaveTotal(total);
  }

  function reset(total = 0) {
    resetWave(total);
  }

  function update() {}

  function dispose() {
    el.remove();
  }

  return {
    setVisible,
    setWaveTotal,
    addKill,
    resetWave,
    reset,
    update,
    dispose,
  };
}
