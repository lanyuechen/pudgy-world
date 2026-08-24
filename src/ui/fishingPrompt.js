/**
 * Fishing HUD — range hint, struggle progress, exit.
 */
export function createFishingPrompt() {
  let el = document.getElementById('fishing-prompt');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fishing-prompt';
    el.hidden = true;
    document.getElementById('app')?.appendChild(el);
  }

  function setHtml(html) {
    el.innerHTML = html;
  }

  function showNearHole() {
    el.hidden = false;
    setHtml('<span class="fishing-label">Click to fish</span>');
  }

  function showCasting() {
    el.hidden = false;
    setHtml('<span class="fishing-label">Casting…</span><span class="fishing-hint">Esc to leave</span>');
  }

  function showFishing(step, clicks = 0, target = 0) {
    el.hidden = false;
    if (step?.type === 'struggle') {
      setHtml(
        '<span class="fishing-label">Reel in!</span>' +
          `<span class="fishing-struggle">${clicks} / ${target}</span>` +
          '<span class="fishing-hint">Click rapidly · Esc to leave</span>',
      );
    } else if (step?.type === 'cast') {
      setHtml('<span class="fishing-label">Casting…</span><span class="fishing-hint">Esc to leave</span>');
    } else if (step?.type === 'hold') {
      setHtml('<span class="fishing-label">Waiting…</span><span class="fishing-hint">Esc to leave</span>');
    } else {
      setHtml('<span class="fishing-label">Fishing…</span><span class="fishing-hint">Esc to leave</span>');
    }
  }

  /** @param {{ label?: string }} fish */
  function showCatch(fish) {
    el.hidden = false;
    const name = fish?.label ?? 'a fish';
    setHtml(
      `<span class="fishing-label">Caught ${name}!</span>` +
        '<span class="fishing-hint">Nice catch</span>',
    );
  }

  function hide() {
    el.hidden = true;
  }

  return { showNearHole, showCasting, showFishing, showCatch, hide };
}
