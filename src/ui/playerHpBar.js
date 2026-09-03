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
  let lastHp = -1;
  let lastMax = -1;
  let lastPct = -1;
  let lastLow = null;
  let lastCrit = null;
  let lastText = '';

  /**
   * @param {number} hp
   * @param {number} maxHp
   */
  function set(hp, maxHp) {
    const max = Math.max(1, maxHp);
    const cur = Math.max(0, Math.min(max, hp));
    const roundedHp = Math.round(cur);
    const roundedMax = Math.round(max);
    const pct = Math.round((cur / max) * 1000) / 10; // 0.1%
    const low = cur / max <= 0.34;
    const crit = cur / max <= 0.15;
    const label = `${roundedHp}/${roundedMax}`;

    if (
      roundedHp === lastHp &&
      roundedMax === lastMax &&
      pct === lastPct &&
      low === lastLow &&
      crit === lastCrit &&
      label === lastText
    ) {
      return;
    }

    lastHp = roundedHp;
    lastMax = roundedMax;
    lastPct = pct;
    lastLow = low;
    lastCrit = crit;
    lastText = label;

    fill.style.width = `${pct}%`;
    fill.classList.toggle('is-low', low);
    fill.classList.toggle('is-critical', crit);
    text.textContent = label;
    mountEl.setAttribute('aria-valuenow', String(roundedHp));
    mountEl.setAttribute('aria-valuemax', String(roundedMax));
    mountEl.setAttribute('aria-valuetext', `${roundedHp} / ${roundedMax}`);
  }

  set(100, 100);

  return {
    set,
    setVisible(next) {
      const show = Boolean(next);
      if (show === visible) return;
      visible = show;
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
