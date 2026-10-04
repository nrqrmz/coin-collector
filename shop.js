import { UPGRADES, upgradeCost, isLocked } from './upgrades.js';
import { fmt } from './save.js';

const listEl = document.getElementById('shop-list');

// Dibuja las tarjetas de la tienda. `onBuy(upgrade, cost)` se llama al comprar.
export function renderShop(save, onBuy) {
  listEl.replaceChildren(
    ...UPGRADES.map((u) => {
      const level = save.levels[u.id] || 0;
      const maxed = level >= u.max;
      const locked = isLocked(u, save.levels);
      const cost = maxed ? 0 : upgradeCost(u, level);

      const card = document.createElement('div');
      card.className = 'card' + (maxed ? ' maxed' : '');

      const icon = document.createElement('div');
      icon.className = 'icon';
      icon.textContent = u.icon;

      const info = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = u.name;
      const lvl = document.createElement('span');
      lvl.className = 'lvl';
      lvl.textContent = `${level}/${u.max}`;
      name.append(lvl);

      const eff = document.createElement('div');
      eff.className = 'eff';
      if (locked) {
        eff.textContent = 'Requiere Diamante';
      } else if (maxed) {
        eff.textContent = u.effect(level);
      } else {
        const next = document.createElement('b');
        next.textContent = u.effect(level + 1);
        eff.append(`${u.effect(level)} → `, next);
      }
      info.append(name, eff);

      const btn = document.createElement('button');
      if (maxed) {
        btn.textContent = 'MÁX';
        btn.disabled = true;
      } else {
        btn.textContent = `🪙 ${fmt(cost)}`;
        btn.disabled = locked || save.bank < cost;
        btn.addEventListener('click', () => onBuy(u, cost));
      }

      card.append(icon, info, btn);
      return card;
    })
  );
}
