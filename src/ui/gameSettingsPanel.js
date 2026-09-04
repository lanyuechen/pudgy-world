import {
  GAME_SETTINGS_DEFAULTS,
  applyGameSettings,
  loadGameSettings,
  saveGameSettings,
} from '../config/gameSettings.js';

/**
 * Settings form for the config panel (mouse / camera prefs).
 * @param {HTMLElement} containerEl
 * @param {{ exploreControls?: object | null, onChange?: (s: import('../config/gameSettings.js').GameSettings) => void }} [opts]
 */
export function createGameSettingsPanel(containerEl, opts = {}) {
  containerEl.classList.add('settings-form');
  containerEl.innerHTML = '';

  /** @type {import('../config/gameSettings.js').GameSettings} */
  let state = loadGameSettings();

  /**
   * @param {string} label
   * @param {string} hint
   * @param {HTMLElement} control
   */
  function addRow(label, hint, control) {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const meta = document.createElement('div');
    meta.className = 'settings-meta';
    const title = document.createElement('span');
    title.className = 'settings-label';
    title.textContent = label;
    meta.appendChild(title);
    if (hint) {
      const h = document.createElement('span');
      h.className = 'settings-hint';
      h.textContent = hint;
      meta.appendChild(h);
    }

    const controlWrap = document.createElement('div');
    controlWrap.className = 'settings-control';
    controlWrap.appendChild(control);

    row.appendChild(meta);
    row.appendChild(controlWrap);
    containerEl.appendChild(row);
    return { row, controlWrap };
  }

  function commit(partial) {
    state = applyGameSettings(
      { ...state, ...partial },
      { exploreControls: opts.exploreControls ?? null },
    );
    saveGameSettings(state);
    syncUi();
    opts.onChange?.(state);
  }

  const yawModeOptions = [
    {
      value: 'cameraFollow',
      title: '角色跟随相机 Yaw',
      hint: '鼠标拖动镜头转，角色身体自动跟着镜头一起转向',
    },
    {
      value: 'independent',
      title: '角色独立 Yaw',
      hint: '移动时角色转向移动方向，镜头在移动时跟随角色',
    },
  ];

  const yawModeGroup = document.createElement('div');
  yawModeGroup.className = 'settings-choice-group';
  /** @type {HTMLInputElement[]} */
  const yawModeInputs = [];
  for (const opt of yawModeOptions) {
    const choice = document.createElement('label');
    choice.className = 'settings-choice';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'third-person-yaw-mode';
    input.value = opt.value;
    input.className = 'settings-radio';
    input.addEventListener('change', () => {
      if (input.checked) commit({ thirdPersonYawMode: opt.value });
    });

    const text = document.createElement('span');
    text.className = 'settings-choice-text';
    const title = document.createElement('span');
    title.className = 'settings-choice-title';
    title.textContent = opt.title;
    text.appendChild(title);
    if (opt.hint) {
      const hint = document.createElement('span');
      hint.className = 'settings-choice-hint';
      hint.textContent = opt.hint;
      text.appendChild(hint);
    }

    choice.appendChild(input);
    choice.appendChild(text);
    yawModeGroup.appendChild(choice);
    yawModeInputs.push(input);
  }

  const yawModeRow = document.createElement('div');
  yawModeRow.className = 'settings-row settings-row--stacked';
  const yawModeMeta = document.createElement('div');
  yawModeMeta.className = 'settings-meta';
  const yawModeLabel = document.createElement('span');
  yawModeLabel.className = 'settings-label';
  yawModeLabel.textContent = '第三人称模式';
  yawModeMeta.appendChild(yawModeLabel);
  const yawModeControl = document.createElement('div');
  yawModeControl.className = 'settings-control settings-control--stacked';
  yawModeControl.appendChild(yawModeGroup);
  yawModeRow.appendChild(yawModeMeta);
  yawModeRow.appendChild(yawModeControl);
  containerEl.appendChild(yawModeRow);

  const sensValue = document.createElement('span');
  sensValue.className = 'settings-value';
  const sensSlider = document.createElement('input');
  sensSlider.type = 'range';
  sensSlider.min = '0.04';
  sensSlider.max = '0.55';
  sensSlider.step = '0.01';
  sensSlider.className = 'settings-slider';
  sensSlider.setAttribute('aria-label', '鼠标灵敏度');
  const sensControl = document.createElement('div');
  sensControl.className = 'settings-slider-wrap';
  sensControl.appendChild(sensSlider);
  sensControl.appendChild(sensValue);
  addRow('鼠标灵敏度', '拖拽视角时的旋转速度', sensControl);
  sensSlider.addEventListener('input', () => {
    commit({ mouseSensitivity: Number(sensSlider.value) });
  });

  const zoomValue = document.createElement('span');
  zoomValue.className = 'settings-value';
  const zoomSlider = document.createElement('input');
  zoomSlider.type = 'range';
  zoomSlider.min = '0.003';
  zoomSlider.max = '0.04';
  zoomSlider.step = '0.001';
  zoomSlider.className = 'settings-slider';
  zoomSlider.setAttribute('aria-label', '滚轮缩放灵敏度');
  const zoomControl = document.createElement('div');
  zoomControl.className = 'settings-slider-wrap';
  zoomControl.appendChild(zoomSlider);
  zoomControl.appendChild(zoomValue);
  addRow('滚轮缩放', '滚轮拉近 / 拉远镜头的速度', zoomControl);
  zoomSlider.addEventListener('input', () => {
    commit({ zoomSensitivity: Number(zoomSlider.value) });
  });

  const invertToggle = document.createElement('input');
  invertToggle.type = 'checkbox';
  invertToggle.className = 'settings-checkbox';
  invertToggle.setAttribute('aria-label', '反转垂直视角');
  addRow('反转 Y 轴', '向上拖动镜头向下看', invertToggle);
  invertToggle.addEventListener('change', () => {
    commit({ invertLookY: invertToggle.checked });
  });

  const invertXToggle = document.createElement('input');
  invertXToggle.type = 'checkbox';
  invertXToggle.className = 'settings-checkbox';
  invertXToggle.setAttribute('aria-label', '反转水平视角');
  addRow('反转 X 轴', '左右拖动镜头时方向相反', invertXToggle);
  invertXToggle.addEventListener('change', () => {
    commit({ invertLookX: invertXToggle.checked });
  });

  const graphicsTitle = document.createElement('p');
  graphicsTitle.className = 'settings-section-title';
  graphicsTitle.textContent = '画面';
  containerEl.appendChild(graphicsTitle);

  const ppToggle = document.createElement('input');
  ppToggle.type = 'checkbox';
  ppToggle.className = 'settings-checkbox';
  ppToggle.setAttribute('aria-label', '后处理描边');
  addRow('后处理描边', '描边 + SSAO（较耗性能）', ppToggle);
  ppToggle.addEventListener('change', () => {
    commit({ postProcessOutline: ppToggle.checked });
  });

  const aaToggle = document.createElement('input');
  aaToggle.type = 'checkbox';
  aaToggle.className = 'settings-checkbox';
  aaToggle.setAttribute('aria-label', '抗锯齿');
  addRow('抗锯齿', '切换后刷新页面生效', aaToggle);
  aaToggle.addEventListener('change', () => {
    const nextAa = aaToggle.checked;
    commit({ antialias: nextAa });
    // MSAA is fixed at WebGL context creation — reload to apply.
    window.location.reload();
  });

  const cullToggle = document.createElement('input');
  cullToggle.type = 'checkbox';
  cullToggle.className = 'settings-checkbox';
  cullToggle.setAttribute('aria-label', '距离裁剪');
  addRow('距离裁剪', '缩短相机远裁剪面，远处不绘制', cullToggle);
  cullToggle.addEventListener('change', () => {
    commit({ distanceCullEnabled: cullToggle.checked });
  });

  const cullValue = document.createElement('span');
  cullValue.className = 'settings-value';
  const cullSlider = document.createElement('input');
  cullSlider.type = 'range';
  cullSlider.min = '20';
  cullSlider.max = '400';
  cullSlider.step = '5';
  cullSlider.className = 'settings-slider';
  cullSlider.setAttribute('aria-label', '裁剪距离');
  const cullControl = document.createElement('div');
  cullControl.className = 'settings-slider-wrap';
  cullControl.appendChild(cullSlider);
  cullControl.appendChild(cullValue);
  const cullDistanceRow = addRow('裁剪距离', '单位：米（开启距离裁剪后生效）', cullControl);
  cullSlider.addEventListener('input', () => {
    commit({ distanceCullDistance: Number(cullSlider.value) });
  });

  const actions = document.createElement('div');
  actions.className = 'settings-actions';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'settings-reset';
  resetBtn.textContent = '恢复默认';
  resetBtn.addEventListener('click', () => {
    const prevAa = state.antialias;
    commit({ ...GAME_SETTINGS_DEFAULTS });
    if (prevAa !== GAME_SETTINGS_DEFAULTS.antialias) {
      window.location.reload();
    }
  });
  actions.appendChild(resetBtn);
  containerEl.appendChild(actions);

  function formatSens(v) {
    return `${Math.round((v / GAME_SETTINGS_DEFAULTS.mouseSensitivity) * 100)}%`;
  }

  function formatZoom(v) {
    return `${Math.round((v / GAME_SETTINGS_DEFAULTS.zoomSensitivity) * 100)}%`;
  }

  function syncUi() {
    for (const input of yawModeInputs) {
      input.checked = state.thirdPersonYawMode === input.value;
    }
    sensSlider.value = String(state.mouseSensitivity);
    sensValue.textContent = formatSens(state.mouseSensitivity);
    invertToggle.checked = state.invertLookY;
    invertXToggle.checked = state.invertLookX;
    zoomSlider.value = String(state.zoomSensitivity);
    zoomValue.textContent = formatZoom(state.zoomSensitivity);
    ppToggle.checked = state.postProcessOutline;
    aaToggle.checked = state.antialias;
    cullToggle.checked = state.distanceCullEnabled;
    cullSlider.value = String(state.distanceCullDistance);
    cullValue.textContent = `${Math.round(state.distanceCullDistance)}m`;
    cullSlider.disabled = !state.distanceCullEnabled;
    cullDistanceRow.row.classList.toggle('is-disabled', !state.distanceCullEnabled);
  }

  // Apply stored prefs on create.
  state = applyGameSettings(state, { exploreControls: opts.exploreControls ?? null });
  syncUi();

  return {
    refresh() {
      state = loadGameSettings();
      state = applyGameSettings(state, { exploreControls: opts.exploreControls ?? null });
      syncUi();
    },
    dispose() {
      containerEl.innerHTML = '';
      containerEl.classList.remove('settings-form');
    },
  };
}
