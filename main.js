import * as THREE from 'three';

// ---------- Configuración ----------
const GAME_TIME = 60;
const WORLD_HALF = 20;      // el suelo mide 40×40
const PLAY_LIMIT = WORLD_HALF - 1.2;
const PLAYER_SPEED = 7;
const COIN_COUNT = 12;
const PICKUP_DIST = 1.1;

const COIN_TYPES = [
  { name: 'bronce', color: 0xcd7f32, css: '#cd7f32', value: 1, weight: 60, radius: 0.45, emissive: 0x000000 },
  { name: 'plata',  color: 0xc0c0c0, css: '#e0e0e0', value: 3, weight: 30, radius: 0.5,  emissive: 0x000000 },
  { name: 'oro',    color: 0xffd700, css: '#ffd700', value: 5, weight: 10, radius: 0.6,  emissive: 0x664400 },
];

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const scoreEl = $('score');
const timeEl = $('time');
const popupsEl = $('popups');
const startScreen = $('start-screen');
const overScreen = $('over-screen');
const finalScoreEl = $('final-score');
const bestScoreEl = $('best-score');

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

scene.add(new THREE.HemisphereLight(0xffffff, 0x5a8f3a, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
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

// Bordes
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

// ---------- Jugador humanoide ----------
function createPlayer() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const root = new THREE.Group();
  const body = new THREE.Group(); // se anima (respirar) sin afectar la posición del root
  root.add(body);

  const addMesh = (geo, parent, y = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // Torso
  const torso = addMesh(new THREE.CapsuleGeometry(0.42, 0.35, 8, 16), body, 1.45);

  // Cabeza con ojos
  const head = addMesh(new THREE.SphereGeometry(0.4, 24, 16), body, 2.42);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  for (const x of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), eyeMat);
    eye.position.set(x, 0.06, 0.36);
    head.add(eye);
  }

  // Extremidades: cada una cuelga de un pivote (hombro / cadera)
  const limb = (x, y, radius, length) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    addMesh(new THREE.CapsuleGeometry(radius, length, 6, 12), pivot, -(length / 2 + radius));
    body.add(pivot);
    return pivot;
  };

  const armL = limb(-0.6, 1.85, 0.16, 0.45);
  const armR = limb(0.6, 1.85, 0.16, 0.45);
  const legL = limb(-0.22, 0.9, 0.18, 0.5);
  const legR = limb(0.22, 0.9, 0.18, 0.5);
  armL.rotation.z = -0.15;
  armR.rotation.z = 0.15;

  return { root, body, torso, armL, armR, legL, legR };
}

const player = createPlayer();
scene.add(player.root);

let walkPhase = 0;
function animatePlayer(dt, moving, elapsed) {
  const { body, armL, armR, legL, legR } = player;
  let swing = 0;
  if (moving) {
    walkPhase += dt * 11;
    swing = Math.sin(walkPhase) * 0.8;
    body.position.y = Math.abs(Math.cos(walkPhase)) * 0.08;
    body.scale.y = 1;
  } else {
    body.position.y = THREE.MathUtils.lerp(body.position.y, 0, 0.2);
    body.scale.y = 1 + Math.sin(elapsed * 2.5) * 0.015; // respirar
  }
  const k = moving ? 1 : 0.15;
  legL.rotation.x = THREE.MathUtils.lerp(legL.rotation.x, swing, k);
  legR.rotation.x = THREE.MathUtils.lerp(legR.rotation.x, -swing, k);
  armL.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, -swing, k);
  armR.rotation.x = THREE.MathUtils.lerp(armR.rotation.x, swing, k);
}

// ---------- Monedas ----------
const coinMaterials = new Map(
  COIN_TYPES.map((t) => [
    t,
    new THREE.MeshStandardMaterial({ color: t.color, metalness: 0.9, roughness: 0.25, emissive: t.emissive }),
  ])
);
const coinGeometries = new Map(
  COIN_TYPES.map((t) => [t, new THREE.CylinderGeometry(t.radius, t.radius, 0.12, 32)])
);
const totalWeight = COIN_TYPES.reduce((s, t) => s + t.weight, 0);

function randomCoinType() {
  let r = Math.random() * totalWeight;
  for (const t of COIN_TYPES) {
    if ((r -= t.weight) < 0) return t;
  }
  return COIN_TYPES[0];
}

const coins = [];

function randomFreePosition() {
  const pos = new THREE.Vector3();
  for (let i = 0; i < 30; i++) {
    pos.set(
      THREE.MathUtils.randFloatSpread(PLAY_LIMIT * 2),
      0,
      THREE.MathUtils.randFloatSpread(PLAY_LIMIT * 2)
    );
    const nearPlayer = pos.distanceTo(player.root.position) < 4;
    const nearCoin = coins.some((c) => c.group.position.distanceTo(pos) < 2);
    if (!nearPlayer && !nearCoin) break;
  }
  return pos;
}

function spawnCoin() {
  const type = randomCoinType();
  const mesh = new THREE.Mesh(coinGeometries.get(type), coinMaterials.get(type));
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  group.position.copy(randomFreePosition());
  group.rotation.y = Math.random() * Math.PI * 2;
  scene.add(group);
  coins.push({ group, type, offset: Math.random() * Math.PI * 2 });
}

function clearCoins() {
  for (const c of coins) scene.remove(c.group);
  coins.length = 0;
}

function showPopup(type) {
  const el = document.createElement('div');
  el.className = 'popup';
  el.textContent = `+${type.value}`;
  el.style.color = type.css;
  popupsEl.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ---------- Input ----------
const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Enter' && state !== 'playing') startGame();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const joystick = { x: 0, y: 0, pointerId: null };
const joyEl = $('joystick');
const knobEl = $('knob');
const JOY_MAX = 50;

function updateJoystick(e) {
  const rect = joyEl.getBoundingClientRect();
  let dx = e.clientX - (rect.left + rect.width / 2);
  let dy = e.clientY - (rect.top + rect.height / 2);
  const len = Math.hypot(dx, dy);
  if (len > JOY_MAX) {
    dx = (dx / len) * JOY_MAX;
    dy = (dy / len) * JOY_MAX;
  }
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  joystick.x = dx / JOY_MAX;
  joystick.y = dy / JOY_MAX;
}

function resetJoystick() {
  joystick.x = joystick.y = 0;
  joystick.pointerId = null;
  knobEl.style.transform = '';
}

joyEl.addEventListener('pointerdown', (e) => {
  joystick.pointerId = e.pointerId;
  joyEl.setPointerCapture(e.pointerId);
  updateJoystick(e);
});
joyEl.addEventListener('pointermove', (e) => {
  if (e.pointerId === joystick.pointerId) updateJoystick(e);
});
joyEl.addEventListener('pointerup', resetJoystick);
joyEl.addEventListener('pointercancel', resetJoystick);

// Devuelve la dirección de movimiento en el plano XZ (la cámara mira hacia -Z).
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

// ---------- Estado del juego ----------
let state = 'start';
let score = 0;
let timeLeft = GAME_TIME;

function loadBest() {
  try {
    return Number(localStorage.getItem('coin-collector-best')) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem('coin-collector-best', String(value));
  } catch {
    /* sin almacenamiento disponible */
  }
}

function updateHud() {
  scoreEl.textContent = score;
  const t = Math.ceil(timeLeft);
  timeEl.textContent = t;
  timeEl.classList.toggle('low', t <= 10);
}

function startGame() {
  score = 0;
  timeLeft = GAME_TIME;
  player.root.position.set(0, 0, 0);
  player.root.rotation.y = 0;
  clearCoins();
  for (let i = 0; i < COIN_COUNT; i++) spawnCoin();
  startScreen.classList.add('hidden');
  overScreen.classList.add('hidden');
  updateCamera(true);
  updateHud();
  state = 'playing';
}

function endGame() {
  state = 'gameover';
  keys.clear();
  resetJoystick();
  const best = Math.max(loadBest(), score);
  saveBest(best);
  finalScoreEl.textContent = score;
  bestScoreEl.textContent = best;
  overScreen.classList.remove('hidden');
}

$('play-btn').addEventListener('click', startGame);
$('retry-btn').addEventListener('click', startGame);

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
  if (state === 'playing') {
    const dir = readInput();
    moving = dir.lengthSq() > 0.01;
    if (moving) {
      const pos = player.root.position;
      pos.addScaledVector(dir, PLAYER_SPEED * dt);
      pos.x = THREE.MathUtils.clamp(pos.x, -PLAY_LIMIT, PLAY_LIMIT);
      pos.z = THREE.MathUtils.clamp(pos.z, -PLAY_LIMIT, PLAY_LIMIT);
      const targetAngle = Math.atan2(dir.x, dir.z);
      player.root.rotation.y = angleLerp(player.root.rotation.y, targetAngle, Math.min(1, dt * 12));
    }

    // Recoger monedas
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      const dx = c.group.position.x - player.root.position.x;
      const dz = c.group.position.z - player.root.position.z;
      if (Math.hypot(dx, dz) < PICKUP_DIST + c.type.radius * 0.5) {
        score += c.type.value;
        showPopup(c.type);
        scene.remove(c.group);
        coins.splice(i, 1);
        spawnCoin();
      }
    }

    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame();
    }
    updateHud();
  }

  // Monedas giran y flotan
  for (const c of coins) {
    c.group.rotation.y += dt * 2.5;
    c.group.position.y = 1 + Math.sin(elapsed * 2 + c.offset) * 0.2;
  }

  animatePlayer(dt, moving, elapsed);
  updateCamera();
  renderer.render(scene, camera);
}

updateCamera(true);
renderer.setAnimationLoop(update);
