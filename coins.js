import * as THREE from 'three';

export const COIN_TYPES = {
  bronze:  { value: 1,  css: '#e09a5a', radius: 0.45 },
  silver:  { value: 3,  css: '#f2f2f8', radius: 0.5 },
  gold:    { value: 5,  css: '#ffd700', radius: 0.6 },
  diamond: { value: 15, css: '#5ee7ff', radius: 0.5 },
  ruby:    { value: 50, css: '#ff2d55', radius: 0.5 },
};

const PICKUP_DIST = 1.1;
const MAGNET_SPEED = 9;
const DROP_LIFE = 4;
const DROP_GRAVITY = 22;

function buildVisuals() {
  const disc = (r) => new THREE.CylinderGeometry(r, r, 0.12, 32);
  const metal = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.25, ...extra });

  const visuals = {
    bronze: { geo: disc(COIN_TYPES.bronze.radius), mat: metal(0xcd7f32, { roughness: 0.3 }), flat: true },
    silver: { geo: disc(COIN_TYPES.silver.radius), mat: metal(0xe8e8f0, { roughness: 0.15 }), flat: true },
    gold: { geo: disc(COIN_TYPES.gold.radius), mat: metal(0xffd700, { roughness: 0.2, emissive: 0x553300 }), flat: true },
    diamond: {
      geo: new THREE.OctahedronGeometry(0.5),
      mat: new THREE.MeshStandardMaterial({
        color: 0x9ff3ff, metalness: 0.3, roughness: 0.05, emissive: 0x1a6b80, flatShading: true,
      }),
    },
    ruby: {
      geo: new THREE.IcosahedronGeometry(0.5, 0),
      mat: new THREE.MeshStandardMaterial({
        color: 0xff2d55, metalness: 0.3, roughness: 0.1, emissive: 0x660014, flatShading: true,
      }),
    },
  };
  // Monedas que suelta el cocodrilo: doradas y pequeñas
  visuals.drop = { geo: disc(0.3), mat: visuals.gold.mat, flat: true };
  return visuals;
}

export class Coins {
  constructor(scene, limit) {
    this.scene = scene;
    this.limit = limit;
    this.visuals = buildVisuals();
    this.list = [];  // monedas normales
    this.drops = []; // monedas robadas y dispersas
  }

  makeMesh(kind) {
    const v = this.visuals[kind];
    const mesh = new THREE.Mesh(v.geo, v.mat);
    if (v.flat) mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    group.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(group);
    return group;
  }

  pickType(stats) {
    const r = Math.random();
    if (r < stats.rubyChance) return 'ruby';
    if (r < stats.rubyChance + stats.diamondChance) return 'diamond';
    const w = stats.weights;
    let x = Math.random() * (w.bronze + w.silver + w.gold);
    if ((x -= w.bronze) < 0) return 'bronze';
    if ((x -= w.silver) < 0) return 'silver';
    return 'gold';
  }

  freePosition(avoid) {
    const pos = new THREE.Vector3();
    for (let i = 0; i < 30; i++) {
      pos.set(
        THREE.MathUtils.randFloatSpread(this.limit * 2),
        1,
        THREE.MathUtils.randFloatSpread(this.limit * 2)
      );
      const nearPlayer = Math.hypot(pos.x - avoid.x, pos.z - avoid.z) < 4;
      const nearCoin = this.list.some((c) => c.group.position.distanceTo(pos) < 2);
      if (!nearPlayer && !nearCoin) break;
    }
    return pos;
  }

  spawn(stats, avoid) {
    const kind = this.pickType(stats);
    const group = this.makeMesh(kind);
    group.position.copy(this.freePosition(avoid));
    this.list.push({ group, kind, type: COIN_TYPES[kind], offset: Math.random() * Math.PI * 2, pulled: false });
  }

  reset(stats, avoid) {
    this.clear();
    for (let i = 0; i < stats.coinCount; i++) this.spawn(stats, avoid);
  }

  clear() {
    for (const c of [...this.list, ...this.drops]) this.scene.remove(c.group);
    this.list.length = 0;
    this.drops.length = 0;
  }

  // Reparte `amount` monedas en varias piezas que saltan alrededor de `origin`.
  scatter(origin, amount) {
    if (amount <= 0) return;
    const pieces = Math.min(amount, THREE.MathUtils.randInt(5, 10));
    let left = amount;
    for (let i = 0; i < pieces; i++) {
      const value = i === pieces - 1 ? left : Math.floor(amount / pieces);
      left -= value;
      const group = this.makeMesh('drop');
      group.position.set(origin.x, 1.5, origin.z);
      const angle = Math.random() * Math.PI * 2;
      const speed = THREE.MathUtils.randFloat(3, 6);
      const vel = new THREE.Vector3(Math.cos(angle) * speed, THREE.MathUtils.randFloat(6, 9), Math.sin(angle) * speed);
      this.drops.push({ group, value, vel, age: 0, landed: false });
    }
  }

  // Mueve, anima y detecta recogidas. Llama a onCollect(coin) o onRecover(value).
  update(dt, elapsed, playerPos, stats, onCollect, onRecover) {
    const magnet = stats.magnetRadius;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      const p = c.group.position;
      c.group.rotation.y += dt * 2.5;
      p.y = 1 + Math.sin(elapsed * 2 + c.offset) * 0.2;

      const dx = playerPos.x - p.x;
      const dz = playerPos.z - p.z;
      const dist = Math.hypot(dx, dz);

      if (magnet > 0 && dist < magnet + PICKUP_DIST && dist > 0.01) {
        const step = Math.min(dist, MAGNET_SPEED * dt);
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
      }

      if (dist < PICKUP_DIST + c.type.radius * 0.5) {
        this.scene.remove(c.group);
        this.list.splice(i, 1);
        onCollect(c);
        this.spawn(stats, playerPos);
      }
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      const p = d.group.position;
      d.age += dt;
      d.group.rotation.y += dt * 4;

      if (!d.landed) {
        d.vel.y -= DROP_GRAVITY * dt;
        p.addScaledVector(d.vel, dt);
        p.x = THREE.MathUtils.clamp(p.x, -this.limit, this.limit);
        p.z = THREE.MathUtils.clamp(p.z, -this.limit, this.limit);
        if (p.y <= 0.5 && d.vel.y < 0) {
          p.y = 0.5;
          d.landed = true;
        }
      }

      // Parpadea en el último segundo y medio
      d.group.visible = d.age < DROP_LIFE - 1.5 || Math.floor(d.age * 10) % 2 === 0;

      const canPick = d.age > 0.5;
      if (canPick && Math.hypot(playerPos.x - p.x, playerPos.z - p.z) < PICKUP_DIST) {
        this.scene.remove(d.group);
        this.drops.splice(i, 1);
        onRecover(d.value);
      } else if (d.age >= DROP_LIFE) {
        this.scene.remove(d.group);
        this.drops.splice(i, 1);
      }
    }
  }
}
