// Tabla de mejoras. Coste del nivel n = baseCost × growth^n.
// `effect(level)` describe el efecto acumulado con ese nivel (se muestra en la tienda).
export const UPGRADES = [
  {
    id: 'time', icon: '⏱', name: 'Tiempo', max: 15, baseCost: 20, growth: 1.45,
    effect: (l) => `${15 + 3 * l} s`,
  },
  {
    id: 'speed', icon: '👟', name: 'Velocidad', max: 10, baseCost: 25, growth: 1.5,
    effect: (l) => `+${6 * l}%`,
  },
  {
    id: 'coins', icon: '🪙', name: 'Más monedas', max: 9, baseCost: 30, growth: 1.5,
    effect: (l) => `${12 + 2 * l} en el mapa`,
  },
  {
    id: 'magnet', icon: '🧲', name: 'Imán', max: 8, baseCost: 40, growth: 1.55,
    effect: (l) => (l ? `radio ${(0.75 * l).toFixed(2).replace('.', ',')} m` : 'sin imán'),
  },
  {
    id: 'luck', icon: '🍀', name: 'Suerte', max: 10, baseCost: 50, growth: 1.5,
    effect: (l) => {
      const w = luckWeights(l);
      return `plata ${w.silver}% · oro ${w.gold}%`;
    },
  },
  {
    id: 'value', icon: '💰', name: 'Valor', max: 25, baseCost: 60, growth: 1.5,
    effect: (l) => `×${formatMult(1.25 ** l)}`,
  },
  {
    id: 'pockets', icon: '👖', name: 'Bolsillos', max: 10, baseCost: 80, growth: 1.5,
    effect: (l) => `−${8 * l}% robo`,
  },
  {
    id: 'combo', icon: '🔥', name: 'Combo', max: 8, baseCost: 200, growth: 1.6,
    effect: (l) => (l ? `máx ×${formatMult(comboMax(l))} · ${comboWindow(l).toFixed(1).replace('.', ',')} s` : 'sin combo'),
  },
  {
    id: 'sprint', icon: '⚡', name: 'Sprint', max: 6, baseCost: 150, growth: 1.7,
    effect: (l) => (l ? `recarga ${sprintCooldown(l).toFixed(1).replace('.', ',')} s` : 'bloqueado'),
  },
  {
    id: 'shield', icon: '🛡', name: 'Escudo', max: 3, baseCost: 300, growth: 4,
    effect: (l) => `${l} por intento`,
  },
  {
    id: 'interest', icon: '🏦', name: 'Interés', max: 10, baseCost: 500, growth: 1.65,
    effect: (l) => `${l}% del banco`,
  },
  {
    id: 'diamond', icon: '💎', name: 'Diamante', max: 6, baseCost: 1000, growth: 1.8,
    effect: (l) => (l ? `${2 * l}% de aparición` : 'bloqueado'),
  },
  {
    id: 'ruby', icon: '♦️', name: 'Rubí', max: 6, baseCost: 20000, growth: 1.8, requires: 'diamond',
    effect: (l) => (l ? `${formatPct(rubyChance(l) * 100)}% de aparición` : 'bloqueado'),
  },
];

function formatMult(n) {
  return n < 10 ? n.toFixed(2).replace('.', ',') : Math.round(n).toString();
}

function formatPct(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

function luckWeights(l) {
  const bronze = Math.max(20, 70 - 5 * l);
  const silver = 25 + 3 * l;
  return { bronze, silver, gold: 100 - bronze - silver };
}

const comboWindow = (l) => 1 + 0.2 * l;
const comboMax = (l) => 1 + 0.5 * l;
const sprintCooldown = (l) => 6 - 0.8 * (l - 1);
const rubyChance = (l) => (l ? 0.005 + 0.009 * (l - 1) : 0);

export function upgradeCost(upgrade, level) {
  return Math.round(upgrade.baseCost * upgrade.growth ** level);
}

export function isLocked(upgrade, levels) {
  return upgrade.requires ? !(levels[upgrade.requires] > 0) : false;
}

// Valores efectivos de juego a partir de los niveles comprados.
export function computeStats(levels) {
  const l = (id) => levels[id] || 0;
  return {
    roundTime: 15 + 3 * l('time'),
    speedMult: 1 + 0.06 * l('speed'),
    coinCount: 12 + 2 * l('coins'),
    magnetRadius: 0.75 * l('magnet'),
    weights: luckWeights(l('luck')),
    valueMult: 1.25 ** l('value'),
    pockets: 0.08 * l('pockets'),
    comboEnabled: l('combo') > 0,
    comboWindow: comboWindow(l('combo')),
    comboMax: comboMax(l('combo')),
    sprintEnabled: l('sprint') > 0,
    sprintCooldown: l('sprint') ? sprintCooldown(l('sprint')) : Infinity,
    shields: l('shield'),
    interest: 0.01 * l('interest'),
    diamondChance: 0.02 * l('diamond'),
    rubyChance: rubyChance(l('ruby')),
  };
}
