import * as THREE from 'three';

// Muñeco blanco "gordito": torso y extremidades de cápsula, cabeza esférica.
export function createPlayer() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const root = new THREE.Group();
  const body = new THREE.Group(); // se anima (respirar / rebotar) sin afectar la posición del root
  root.add(body);

  const addMesh = (geo, parent, y = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // Torso
  addMesh(new THREE.CapsuleGeometry(0.42, 0.35, 8, 16), body, 1.45);

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

  return { root, body, armL, armR, legL, legR, walkPhase: 0 };
}

export function animatePlayer(player, dt, moving, elapsed, stride = 1) {
  const { body, armL, armR, legL, legR } = player;
  let swing = 0;
  if (moving) {
    player.walkPhase += dt * 11 * stride;
    swing = Math.sin(player.walkPhase) * 0.8;
    body.position.y = Math.abs(Math.cos(player.walkPhase)) * 0.08;
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
