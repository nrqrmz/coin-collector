import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPlayer, animatePlayer } from './player.js';
import { Coins, COIN_TYPES } from './coins.js';
import { Crocodile } from './crocodile.js';
import { computeStats } from './upgrades.js';
import { renderShop } from './shop.js';
import { GOAL, newSave, loadSave, writeSave, clearSave, loadBest, writeBest, fmt, fmtTime } from './save.js';

// ---------- Configuración ----------
const WORLD_HALF = 20; // el suelo mide 40×40
const PLAY_LIMIT = WORLD_HALF - 1.2;
const BASE_SPEED = 7;
const SPRINT_MULT = 1.8;
const SPRINT_DURATION = 1.2;
const BITE_DIST = 1.0;
const INVULN_TIME = 2;
const CROC_STUN = 1.5;
const SECOND_CROC_ATTEMPT = 15;

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'),
  roundCoins: $('round-coins'),
  bank: $('bank'),
  bankBar: $('bank-bar'),
  time: $('time'),
  combo: $('combo'),
  shields: $('shields'),
  popups: $('popups'),
  joystick: $('joystick'),
  knob: $('knob'),
  sprintBtn: $('sprint-btn'),
  startScreen: $('start-screen'),
  continueBtn: $('continue-btn'),
  newBtn: $('new-btn'),
  shopScreen: $('shop-screen'),
  shopTitle: $('shop-title'),
  shopSummary: $('shop-summary'),
  shopBank: $('shop-bank'),
  shopBar: $('shop-bar'),
  nextBtn: $('next-btn'),
  victoryScreen: $('victory-screen'),
  restartBtn: $('restart-btn'),
};

// ---------- Escena ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 25, 60);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

// Entorno para que los metales (plata, oro, bronce) tengan reflejos
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;
pmrem.dispose();

scene.add(new THREE.HemisphereLight(0xffffff, 0x5a8f3a, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(10, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 60 });
scene.add(sun);

// ---------- Mundo ----------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
  new THREE.MeshStandardMaterial({ color: 0x6cc24a, roughness: 0.9 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
for (const [x, z, w, d] of [
  [0, -WORLD_HALF, WORLD_HALF * 2, 0.5],
  [0, WORLD_HALF, WORLD_HALF * 2, 0.5],
  [-WORLD_HALF, 0, 0.5, WORLD_HALF * 2],
  [WORLD_HALF, 0, 0.5, WORLD_HALF * 2],
]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, d), wallMat);
  wall.position.set(x, 0.4, z);
  wall.castShadow = wall.receiveShadow = true;
  scene.add(wall);
}

// ---------- Entidades ----------
const player = createPlayer();
scene.add(player.root);

const coins = new Coins(scene, PLAY_LIMIT);
const crocs = [];

function setupCrocs(count) {
  while (crocs.length < count) crocs.push(new Crocodile(scene));
  crocs.forEach((croc, i) => {
    croc.root.visible = i < count;
    // Aparecen en esquinas opuestas, lejos del jugador
    const corner = i === 0 ? [1, 1] : [-1, 1];
    croc.position.set(corner[0] * (PLAY_LIMIT - 1), 0, corner[1] * (PLAY_LIMIT - 1) * -1);
    croc.root.rotation.y = Math.atan2(-croc.position.x, -croc.position.z);
    croc.stun = 0;
  });
}

// ---------- Input ----------
const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Enter') {
    if (state === 'menu') (save ? continueGame : newGame)();
    else if (state === 'shop') startAttempt();
  }
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') && state === 'playing') {
    e.preventDefault();
    trySprint();
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const joystick = { x: 0, y: 0, pointerId: null };
const JOY_MAX = 50;

function updateJoystick(e) {
  const rect = ui.joystick.getBoundingClientRect();
  let dx = e.clientX - (rect.left + rect.width / 2);
  let dy = e.clientY - (rect.top + rect.height / 2);
  const len = Math.hypot(dx, dy);
  if (len > JOY_MAX) {
    dx = (dx / len) * JOY_MAX;
    dy = (dy / len) * JOY_MAX;
  }
  ui.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  joystick.x = dx / JOY_MAX;
  joystick.y = dy / JOY_MAX;
}

function resetJoystick() {
  joystick.x = joystick.y = 0;
  joystick.pointerId = null;
  ui.knob.style.transform = '';
}

ui.joystick.addEventListener('pointerdown', (e) => {
  joystick.pointerId = e.pointerId;
  ui.joystick.setPointerCapture(e.pointerId);
  updateJoystick(e);
});
ui.joystick.addEventListener('pointermove', (e) => {
  if (e.pointerId === joystick.pointerId) updateJoystick(e);
});
ui.joystick.addEventListener('pointerup', resetJoystick);
ui.joystick.addEventListener('pointercancel', resetJoystick);

ui.sprintBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  trySprint();
});

// Dirección de movimiento en el plano XZ (la cámara mira hacia -Z).
const inputDir = new THREE.Vector3();
function readInput() {
  let x = joystick.x;
  let z = joystick.y;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  inputDir.set(x, 0, z);
  if (inputDir.lengthSq() > 1) inputDir.normalize();
  return inputDir;
}

// ---------- Cámara ----------
const camOffset = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function updateCameraProjection() {
  const portrait = innerWidth / innerHeight < 1;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = portrait ? 72 : 60;
  camera.updateProjectionMatrix();
  camOffset.set(0, 6, 10).multiplyScalar(portrait ? 1.3 : 1);
}

function updateCamera(snap = false) {
  camTarget.copy(player.root.position).add(camOffset);
  if (snap) camera.position.copy(camTarget);
  else camera.position.lerp(camTarget, 0.1);
  lookTarget.copy(player.root.position).setY(1.2);
  camera.lookAt(lookTarget);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  updateCameraProjection();
});
updateCameraProjection();

// ---------- Popups ----------
const screenPos = new THREE.Vector3();
function showPopup(text, color, className = '') {
  screenPos.copy(player.root.position).setY(3);
  screenPos.project(camera);
  const el = document.createElement('div');
  el.className = 'popup ' + className;
  el.textContent = text;
  if (color) el.style.color = color;
  el.style.left = `${(screenPos.x * 0.5 + 0.5) * innerWidth + THREE.MathUtils.randFloatSpread(40)}px`;
  el.style.top = `${(-screenPos.y * 0.5 + 0.5) * innerHeight}px`;
  ui.popups.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ---------- Estado ----------
let state = 'menu'; // menu | playing | shop | victory
let save = loadSave();
let stats = computeStats({});
const round = {
  coins: 0, stolen: 0, recovered: 0, timeLeft: 0, elapsed: 0,
  shields: 0, invuln: 0,
  comboCount: 0, comboTimer: 0, comboMult: 1,
  sprintTime: 0, sprintCooldown: 0,
};

function showScreen(name) {
  ui.startScreen.classList.toggle('hidden', name !== 'menu');
  ui.shopScreen.classList.toggle('hidden', name !== 'shop');
  ui.victoryScreen.classList.toggle('hidden', name !== 'victory');
  const playing = name === 'playing';
  ui.hud.classList.toggle('hidden', !playing);
  ui.joystick.classList.toggle('hidden', !playing);
  ui.sprintBtn.classList.toggle('hidden', !playing || !stats.sprintEnabled);
  state = name;
}

function newGame() {
  if (save && save.attempts > 0 && !confirm('¿Empezar una partida nueva? Se perderá el progreso actual.')) return;
  save = newSave();
  writeSave(save);
  startAttempt();
}

function continueGame() {
  if (!save) return newGame();
  openShop(null);
}

function startAttempt() {
  stats = computeStats(save.levels);
  Object.assign(round, {
    coins: 0, stolen: 0, recovered: 0, timeLeft: stats.roundTime, elapsed: 0,
    shields: stats.shields, invuln: 0,
    comboCount: 0, comboTimer: 0, comboMult: 1,
    sprintTime: 0, sprintCooldown: 0,
  });
  player.root.position.set(0, 0, 0);
  player.root.rotation.y = 0;
  player.root.visible = true;
  coins.reset(stats, player.root.position);
  setupCrocs(save.attempts + 1 >= SECOND_CROC_ATTEMPT ? 2 : 1);
  keys.clear();
  resetJoystick();
  updateCamera(true);
  showScreen('playing');
  updateHud();
}

function endAttempt() {
  coins.clear();
  player.root.visible = true;
  resetJoystick();

  save.attempts += 1;
  save.bank += round.coins;
  const interest = Math.min(Math.floor(save.bank * stats.interest), round.coins);
  save.bank += interest;
  save.totalCollected += round.coins + interest;
  save.playTime += round.elapsed;
  writeSave(save);

  if (save.bank >= GOAL) showVictory();
  else openShop({ collected: round.coins, stolen: round.stolen, recovered: round.recovered, interest });
}

function openShop(summary) {
  ui.shopTitle.textContent = summary ? `Intento ${save.attempts} terminado` : `Tienda · intento ${save.attempts + 1}`;
  ui.shopSummary.replaceChildren();
  if (summary) {
    const item = (label, value, cls = '') => {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = `${label} ${value}`;
      ui.shopSummary.append(s);
    };
    item('Recogido', `🪙 ${fmt(summary.collected)}`);
    if (summary.stolen) item('Robado 🐊', `−${fmt(summary.stolen)}`, 'neg');
    if (summary.recovered) item('Recuperado', `+${fmt(summary.recovered)}`, 'pos');
    if (summary.interest) item('Interés', `+${fmt(summary.interest)}`, 'pos');
  }
  refreshShop();
  ui.shopScreen.scrollTop = 0;
  showScreen('shop');
}

function refreshShop() {
  ui.shopBank.textContent = fmt(save.bank);
  ui.shopBar.style.width = `${Math.min(100, (save.bank / GOAL) * 100)}%`;
  renderShop(save, (upgrade, cost) => {
    if (save.bank < cost) return;
    save.bank -= cost;
    save.spent += cost;
    save.levels[upgrade.id] = (save.levels[upgrade.id] || 0) + 1;
    writeSave(save);
    refreshShop();
  });
}

function showVictory() {
  const prev = loadBest();
  const isBest = !prev || save.attempts < prev.attempts;
  if (isBest) writeBest({ attempts: save.attempts, spent: save.spent, playTime: save.playTime });
  const best = isBest ? save : prev;

  $('v-attempts').textContent = save.attempts;
  $('v-spent').textContent = `🪙 ${fmt(save.spent)}`;
  $('v-collected').textContent = `🪙 ${fmt(save.totalCollected)}`;
  $('v-bites').textContent = save.bites;
  $('v-time').textContent = fmtTime(save.playTime);
  $('v-best').textContent = `${best.attempts} intentos${isBest ? ' 🆕' : ''}`;

  clearSave();
  save = null;
  showScreen('victory');
}

function showMenu() {
  ui.continueBtn.classList.toggle('hidden', !save);
  ui.continueBtn.textContent = save ? `Continuar (🏦 ${fmt(save.bank)})` : 'Continuar';
  showScreen('menu');
}

ui.continueBtn.addEventListener('click', continueGame);
ui.newBtn.addEventListener('click', newGame);
ui.nextBtn.addEventListener('click', startAttempt);
ui.restartBtn.addEventListener('click', () => {
  save = null;
  newGame();
});

// ---------- Mecánicas ----------
function trySprint() {
  if (!stats.sprintEnabled || round.sprintCooldown > 0) return;
  round.sprintTime = SPRINT_DURATION;
  round.sprintCooldown = stats.sprintCooldown;
}

function collectCoin(coin) {
  if (stats.comboEnabled) {
    round.comboCount = round.comboTimer > 0 ? round.comboCount + 1 : 1;
    round.comboTimer = stats.comboWindow;
    round.comboMult = Math.min(stats.comboMax, 1 + 0.1 * (round.comboCount - 1));
  }
  const value = Math.max(1, Math.round(coin.type.value * stats.valueMult * round.comboMult));
  round.coins += value;
  showPopup(`+${fmt(value)}`, COIN_TYPES[coin.kind].css);
}

function recoverCoins(value) {
  round.coins += value;
  round.recovered += value;
  showPopup(`+${fmt(value)}`, '#8dffa0');
}

function bite(croc) {
  croc.stun = CROC_STUN;
  round.invuln = INVULN_TIME;

  if (round.shields > 0) {
    round.shields -= 1;
    showPopup('🛡 ¡Bloqueado!', '#7fd8ff', 'bite');
    return;
  }

  save.bites += 1;
  const attempt = save.attempts + 1;
  const raw = 5 + attempt + THREE.MathUtils.randFloat(0.1, 0.25) * round.coins;
  const amount = Math.min(round.coins, Math.round(raw * (1 - stats.pockets)));
  round.coins -= amount;
  round.stolen += amount;
  round.comboTimer = 0;
  round.comboMult = 1;
  showPopup(amount > 0 ? `🐊 −${fmt(amount)}` : '🐊 ¡Ñam!', null, 'bite');
  coins.scatter(player.root.position, amount);
}

function crocSpeed() {
  const attempt = save.attempts + 1;
  return BASE_SPEED * Math.min(0.85, 0.55 + 0.015 * (attempt - 1));
}

function updateHud() {
  ui.roundCoins.textContent = fmt(round.coins);
  ui.bank.textContent = fmt(save.bank);
  ui.bankBar.style.width = `${Math.min(100, (save.bank / GOAL) * 100)}%`;
  const t = Math.ceil(round.timeLeft);
  ui.time.textContent = t;
  ui.time.classList.toggle('low', t <= 5);

  const showCombo = stats.comboEnabled && round.comboTimer > 0 && round.comboMult > 1;
  ui.combo.classList.toggle('hidden', !showCombo);
  if (showCombo) ui.combo.textContent = `🔥 ×${round.comboMult.toFixed(1).replace('.', ',')}`;

  ui.shields.classList.toggle('hidden', stats.shields === 0);
  ui.shields.textContent = `🛡 ${round.shields}`;

  if (stats.sprintEnabled) {
    const ready = 1 - Math.max(0, round.sprintCooldown) / stats.sprintCooldown;
    ui.sprintBtn.style.setProperty('--p', `${ready * 100}%`);
  }
}

// ---------- Loop ----------
const clock = new THREE.Clock();

function angleLerp(from, to, t) {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * t;
}

function update() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  let moving = false;
  let stride = 1;

  if (state === 'playing') {
    round.elapsed += dt;
    round.sprintTime -= dt;
    round.sprintCooldown -= dt;
    round.comboTimer -= dt;
    round.invuln -= dt;

    // Jugador
    const dir = readInput();
    moving = dir.lengthSq() > 0.01;
    if (moving) {
      const sprinting = round.sprintTime > 0;
      stride = sprinting ? 1.6 : 1;
      const speed = BASE_SPEED * stats.speedMult * (sprinting ? SPRINT_MULT : 1);
      const pos = player.root.position;
      pos.addScaledVector(dir, speed * dt);
      pos.x = THREE.MathUtils.clamp(pos.x, -PLAY_LIMIT, PLAY_LIMIT);
      pos.z = THREE.MathUtils.clamp(pos.z, -PLAY_LIMIT, PLAY_LIMIT);
      player.root.rotation.y = angleLerp(player.root.rotation.y, Math.atan2(dir.x, dir.z), Math.min(1, dt * 12));
    }
    player.root.visible = round.invuln <= 0 || Math.floor(elapsed * 12) % 2 === 0;

    // Monedas
    coins.update(dt, elapsed, player.root.position, stats, collectCoin, recoverCoins);

    // Cocodrilos
    const speed = crocSpeed();
    for (const croc of crocs) {
      if (!croc.root.visible) continue;
      croc.update(dt, player.root.position, speed, PLAY_LIMIT);
      if (croc.stun <= 0 && round.invuln <= 0) {
        const head = croc.headPosition();
        const p = player.root.position;
        if (Math.hypot(head.x - p.x, head.z - p.z) < BITE_DIST) bite(croc);
      }
    }

    round.timeLeft -= dt;
    updateHud();
    if (round.timeLeft <= 0) {
      round.timeLeft = 0;
      endAttempt();
    }
  }

  animatePlayer(player, dt, moving, elapsed, stride);
  updateCamera();
  renderer.render(scene, camera);
}

setupCrocs(1);
updateCamera(true);
showMenu();
renderer.setAnimationLoop(update);
