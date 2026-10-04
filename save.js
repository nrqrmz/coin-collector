const SAVE_KEY = 'coin-collector-save-v2';
const BEST_KEY = 'coin-collector-best-v2';

export const GOAL = 1_000_000;

export function newSave() {
  return { bank: 0, levels: {}, attempts: 0, spent: 0, totalCollected: 0, bites: 0, playTime: 0 };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? { ...newSave(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* sin almacenamiento disponible */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* sin almacenamiento disponible */
  }
}

export function loadBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeBest(best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    /* sin almacenamiento disponible */
  }
}

// 950 → "950", 1234 → "1,2K", 35_000 → "35K", 1_250_000 → "1,25M"
export function fmt(n) {
  n = Math.floor(n);
  const short = (v, suffix) =>
    v.toLocaleString('es', { maximumFractionDigits: v < 10 ? 2 : v < 100 ? 1 : 0 }) + suffix;
  if (n < 1000) return String(n);
  if (n < 1_000_000) return short(n / 1000, 'K');
  return short(n / 1_000_000, 'M');
}

export function fmtTime(seconds) {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return `${m} min ${String(s % 60).padStart(2, '0')} s`;
}
