// Constelação GNSS estilizada (MEO) + estação terrestre.
import * as THREE from 'three';
import { EARTH_RADIUS, ORBIT_RADIUS } from './scene.js';

function makeSatMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 1.4),
    new THREE.MeshPhongMaterial({ color: 0xd8dee9, emissive: 0x222933 })
  );
  g.add(body);
  const panelMat = new THREE.MeshPhongMaterial({ color: 0x2255cc, emissive: 0x112244, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.0), panelMat);
    panel.position.x = s * 2.0;
    g.add(panel);
  }
  return g;
}

export function createSatellites(sceneCtx) {
  const { scene, earthGroup } = sceneCtx;
  const sats = [];

  // 3 planos orbitais inclinados, 3 satélites por plano
  const planes = [
    { inc: 0.96, node: 0.0 },
    { inc: 0.96, node: 2.09 },
    { inc: 0.96, node: 4.19 }
  ];
  planes.forEach((pl, pi) => {
    for (let i = 0; i < 3; i++) {
      const mesh = makeSatMesh();
      scene.add(mesh);
      sats.push({
        mesh,
        angle: (i / 3) * Math.PI * 2 + pi * 0.7,
        speed: 0.055 + pi * 0.004,
        inc: pl.inc,
        node: pl.node
      });
    }

    // Anel da órbita (linha discreta)
    const pts = [];
    for (let a = 0; a <= 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      pts.push(orbitalPos(t, pl.inc, pl.node, new THREE.Vector3()));
    }
    const orbitLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x3a4a72, transparent: true, opacity: 0.35 })
    );
    scene.add(orbitLine);
  });

  // Estação terrestre (antena) — fixa no lado visível, latitude ~ -10°
  const stationDir = new THREE.Vector3(0.52, -0.17, 0.84).normalize();
  const stationPos = stationDir.clone().multiplyScalar(EARTH_RADIUS);
  const station = new THREE.Group();
  const dish = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 1.1, 16, 1, true),
    new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x3a4a5a, side: THREE.DoubleSide })
  );
  dish.rotation.x = Math.PI;
  dish.position.y = 0.8;
  station.add(dish);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 0.9, 8),
    new THREE.MeshPhongMaterial({ color: 0x9aa7bb })
  );
  base.position.y = 0.3;
  station.add(base);
  station.position.copy(stationPos);
  station.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), stationDir);
  scene.add(station);

  // Marcador pulsante da estação
  const ringGeo = new THREE.RingGeometry(0.9, 1.15, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(stationDir.clone().multiplyScalar(EARTH_RADIUS + 0.05));
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), stationDir);
  scene.add(ring);

  function orbitalPos(angle, inc, node, out) {
    out.set(Math.cos(angle) * ORBIT_RADIUS, 0, Math.sin(angle) * ORBIT_RADIUS);
    out.applyAxisAngle(new THREE.Vector3(1, 0, 0), inc);
    out.applyAxisAngle(new THREE.Vector3(0, 1, 0), node);
    return out;
  }

  const api = {
    sats,
    stationPos,
    stationDir,
    update(dt, elapsed) {
      for (const s of sats) {
        s.angle += dt * s.speed;
        orbitalPos(s.angle, s.inc, s.node, s.mesh.position);
        s.mesh.lookAt(0, 0, 0);
      }
      const k = 1 + Math.sin(elapsed * 2.5) * 0.12;
      ring.scale.setScalar(k);
      ringMat.opacity = 0.45 + Math.sin(elapsed * 2.5) * 0.2;
    }
  };
  return api;
}
