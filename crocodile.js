import * as THREE from 'three';

const GREEN = 0x3f8f3a;
const DARK_GREEN = 0x2b6a29;
const BELLY = 0xb5c97a;

function angleLerp(from, to, t) {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * t;
}

// Modelo mirando hacia +Z, igual que el jugador.
function buildModel() {
  const skin = new THREE.MeshStandardMaterial({ color: GREEN, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: DARK_GREEN, roughness: 0.7 });
  const belly = new THREE.MeshStandardMaterial({ color: BELLY, roughness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const black = new THREE.MeshBasicMaterial({ color: 0x111111 });

  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Cuerpo: cápsula tumbada y aplanada
  const torso = mesh(new THREE.CapsuleGeometry(0.45, 1.4, 8, 16), skin, body, 0, 0.5, 0);
  torso.rotation.x = Math.PI / 2;
  torso.scale.set(1.25, 1, 0.75);
  const underside = mesh(new THREE.BoxGeometry(0.8, 0.1, 1.6), belly, body, 0, 0.22, 0);
  underside.castShadow = false;

  // Crestas en el lomo
  const ridgeGeo = new THREE.ConeGeometry(0.09, 0.2, 4);
  for (let i = 0; i < 6; i++) {
    for (const x of [-0.15, 0.15]) mesh(ridgeGeo, dark, body, x, 0.88, -0.75 + i * 0.3);
  }

  // Cabeza: mandíbula inferior fija + superior con bisagra
  const head = new THREE.Group();
  head.position.set(0, 0.45, 1.05);
  body.add(head);
  mesh(new THREE.BoxGeometry(0.6, 0.18, 1.0), skin, head, 0, -0.05, 0.5);

  const upperJaw = new THREE.Group();
  upperJaw.position.set(0, 0.06, 0);
  head.add(upperJaw);
  mesh(new THREE.BoxGeometry(0.66, 0.22, 1.05), skin, upperJaw, 0, 0.1, 0.52);
  mesh(new THREE.SphereGeometry(0.05, 8, 6), black, upperJaw, -0.12, 0.22, 1.0); // fosas nasales
  mesh(new THREE.SphereGeometry(0.05, 8, 6), black, upperJaw, 0.12, 0.22, 1.0);

  const toothGeo = new THREE.ConeGeometry(0.04, 0.12, 4);
  for (let i = 0; i < 4; i++) {
    for (const x of [-0.28, 0.28]) {
      const tooth = mesh(toothGeo, white, upperJaw, x, -0.05, 0.25 + i * 0.22);
      tooth.rotation.x = Math.PI;
    }
  }

  // Ojos saltones
  for (const x of [-0.2, 0.2]) {
    mesh(new THREE.SphereGeometry(0.13, 12, 10), skin, upperJaw, x, 0.25, 0.1);
    mesh(new THREE.SphereGeometry(0.09, 12, 10), white, upperJaw, x, 0.3, 0.17);
    mesh(new THREE.SphereGeometry(0.045, 8, 6), black, upperJaw, x, 0.32, 0.25);
  }

  // Patas
  const legs = [];
  const legGeo = new THREE.BoxGeometry(0.2, 0.35, 0.28);
  for (const [x, z] of [[-0.55, 0.55], [0.55, 0.55], [-0.55, -0.55], [0.55, -0.55]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.4, z);
    mesh(legGeo, skin, pivot, 0, -0.2, 0);
    body.add(pivot);
    legs.push(pivot);
  }

  // Cola: cadena de segmentos que se estrechan
  const tail = [];
  let parent = body;
  let z = -1.0;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0.45 : 0, z);
    parent.add(seg);
    const w = 0.5 - i * 0.1;
    mesh(new THREE.BoxGeometry(w, 0.3 - i * 0.05, 0.55), skin, seg, 0, 0, -0.27);
    mesh(ridgeGeo, dark, seg, 0, 0.2 - i * 0.03, -0.27);
    tail.push(seg);
    parent = seg;
    z = -0.5;
  }

  return { root, body, upperJaw, legs, tail };
}

export class Crocodile {
  constructor(scene) {
    this.model = buildModel();
    this.root = this.model.root;
    this.stun = 0;
    this.phase = Math.random() * 10;
    scene.add(this.root);
    this.head = new THREE.Vector3();
  }

  get position() {
    return this.root.position;
  }

  // Punta del hocico en coordenadas del mundo (para detectar la mordida).
  headPosition() {
    const a = this.root.rotation.y;
    return this.head.set(
      this.root.position.x + Math.sin(a) * 1.7,
      0,
      this.root.position.z + Math.cos(a) * 1.7
    );
  }

  update(dt, target, speed, limit) {
    const { upperJaw, legs, tail, body } = this.model;
    const pos = this.root.position;

    if (this.stun > 0) {
      // Masticando: mandíbula rápida, sin moverse
      this.stun -= dt;
      this.phase += dt * 18;
      upperJaw.rotation.x = -0.15 - Math.abs(Math.sin(this.phase)) * 0.25;
      body.position.y = 0;
      return;
    }

    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const targetAngle = Math.atan2(dx, dz);
    this.root.rotation.y = angleLerp(this.root.rotation.y, targetAngle, Math.min(1, dt * 3));

    // Avanza hacia donde mira (así gira de forma natural)
    const a = this.root.rotation.y;
    pos.x = THREE.MathUtils.clamp(pos.x + Math.sin(a) * speed * dt, -limit, limit);
    pos.z = THREE.MathUtils.clamp(pos.z + Math.cos(a) * speed * dt, -limit, limit);

    this.phase += dt * speed * 2.2;
    const swing = Math.sin(this.phase) * 0.6;
    legs[0].rotation.x = swing;
    legs[3].rotation.x = swing;
    legs[1].rotation.x = -swing;
    legs[2].rotation.x = -swing;
    tail.forEach((seg, i) => {
      seg.rotation.y = Math.sin(this.phase * 0.7 - i * 0.8) * 0.3;
    });
    body.position.y = Math.abs(Math.sin(this.phase)) * 0.04;

    // Abre más la boca cuando está cerca
    const open = dist < 5 ? 0.55 : 0.15;
    upperJaw.rotation.x = -(open * (0.6 + 0.4 * Math.sin(this.phase * 0.5)));
  }
}
