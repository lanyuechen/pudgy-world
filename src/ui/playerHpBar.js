/**
 * Horizontal HP bar shown to the right of the player avatar.
 * @param {HTMLElement | null} mountEl
 */
export function createPlayerHpBar(mountEl) {
  if (!mountEl) {
    return {
      set() {},
      setVisible() {},
      dispose() {},
    };
  }

  mountEl.classList.add('player-hp-bar');
  mountEl.hidden = false;
  mountEl.setAttribute('role', 'meter');
  mountEl.setAttribute('aria-label', '生命值');
  mountEl.setAttribute('aria-valuemin', '0');

  const track = document.createElement('div');
  track.className = 'player-hp-track';

  const fill = document.createElement('div');
  fill.className = 'player-hp-fill';

  const text = document.createElement('span');
  text.className = 'player-hp-text';

  track.appendChild(fill);
  mountEl.append(track, text);

  let visible = true;

  /**
   * @param {number} hp
   * @param {number} maxHp
   */
  function set(hp, maxHp) {
    const max = Math.max(1, maxHp);
    const cur = Math.max(0, Math.min(max, hp));
    const ratio = cur / max;
    fill.style.width = `${(ratio * 100).toFixed(1)}%`;
    fill.classList.toggle('is-low', ratio <= 0.34);
    fill.classList.toggle('is-critical', ratio <= 0.15);
    text.textContent = `${Math.round(cur)}/${Math.round(max)}`;
    mountEl.setAttribute('aria-valuenow', String(Math.round(cur)));
    mountEl.setAttribute('aria-valuemax', String(Math.round(max)));
    mountEl.setAttribute('aria-valuetext', `${Math.round(cur)} / ${Math.round(max)}`);
  }

  set(100, 100);

  return {
    set,
    setVisible(next) {
      visible = Boolean(next);
      mountEl.hidden = !visible;
    },
    dispose() {
      mountEl.replaceChildren();
      mountEl.classList.remove('player-hp-bar');
      mountEl.removeAttribute('role');
      mountEl.removeAttribute('aria-label');
      mountEl.removeAttribute('aria-valuemin');
      mountEl.removeAttribute('aria-valuemax');
      mountEl.removeAttribute('aria-valuenow');
      mountEl.removeAttribute('aria-valuetext');
    },
  };
}
