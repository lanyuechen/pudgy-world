/**
 * Quarks VFX catalog for the config 特效 tab.
 */

/** @typedef {{ id: string, label: string, labelEn: string, path: string }} EffectOption */

/** @type {EffectOption[]} */
export const EFFECT_OPTIONS = [
  {
    id: 'cartoon-bang',
    label: '卡通爆炸',
    labelEn: 'Cartoon Bang',
    path: 'assets/effects/Cartoon Bang.json',
  },
  {
    id: 'confetti-blast',
    label: '彩纸爆破',
    labelEn: 'Confetti Blast',
    path: 'assets/effects/Confetti Blast.json',
  },
  {
    id: 'cartoon-blue-gas',
    label: '卡通蓝气爆炸',
    labelEn: 'Cartoon Blue Gas Explosion',
    path: 'assets/effects/Cartoon Blue Gas Explosion.json',
  },
  {
    id: 'cartoon-energy',
    label: '卡通能量爆炸',
    labelEn: 'Cartoon Energy Explosion',
    path: 'assets/effects/Cartoon Energy Explosion.json',
  },
  {
    id: 'cartoon-star-field',
    label: '卡通星空',
    labelEn: 'Cartoon Star field',
    path: 'assets/effects/Cartoon Star field.json',
  },
];

/** @returns {{ sections: Array<{ id: string, label: string, options: Array<{ value: string, label: string, sublabel?: string }>, openByDefault: boolean }>, byId: Map<string, EffectOption> }} */
export function getEffectOptions() {
  const byId = new Map(EFFECT_OPTIONS.map((o) => [o.id, o]));
  return {
    sections: [
      {
        id: 'effects',
        label: '特效',
        openByDefault: true,
        options: EFFECT_OPTIONS.map((o) => ({
          value: o.id,
          label: o.label,
          sublabel: o.labelEn,
        })),
      },
    ],
    byId,
  };
}
