// Caminhos de sinal satélite -> estação: retos em condições calmas,
// curvados (atraso/refração TEC), ondulados (cintilação de fase),
// piscando (cintilação de amplitude) e caindo (perda de lock).
import * as THREE from 'three';
import { effects } from './scene.js';

const SEGMENTS = 40;
const COLOR_OK = new THREE.Color(0x39e6a3);
const COLOR_WARN = new THREE.Color(0xffd54a);
const COLOR_BAD = new THREE.Color(0xf87171);

export function createSignals(sceneCtx, satsApi) {
  const { scene } = sceneCtx;
  const links = [];

  for (const sat of satsApi.sats) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
    const mat = new THREE.LineBasicMaterial({ color: COLOR_OK.clone(), transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    links.push({
      sat, line, mat,
      seed: Math.random() * 100,
      lockLostUntil: 0 // instante (elapsed) até o qual o link está "caído"
    });
  }

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const point = new THREE.Vector3();

  function update(dt, elapsed) {
    const e = effects.current;
    const severity = Math.max(e.ampScint, e.phaseScint, e.storm * 0.7, e.tecBend * 0.5);

    for (const link of links) {
      const satPos = link.sat.mesh.position;
      tmpA.copy(satsApi.stationPos);
      tmpB.copy(satPos);

      // Satélite abaixo do horizonte da estação: link invisível
      const toSat = tmpB.clone().sub(tmpA).normalize();
      if (toSat.dot(satsApi.stationDir) < 0.06) {
        link.line.visible = false;
        continue;
      }
      link.line.visible = true;

      // Perda de lock: com "lock" alto, links caem aleatoriamente por instantes
      if (e.lock > 0.05 && elapsed > link.lockLostUntil && Math.random() < e.lock * dt * 0.9) {
        link.lockLostUntil = elapsed + 0.4 + Math.random() * 1.2;
      }
      const lockLost = elapsed < link.lockLostUntil;

      // Vetores perpendiculares ao caminho para curvatura e ondulação
      side.crossVectors(toSat, satsApi.stationDir).normalize();
      if (side.lengthSq() < 0.01) side.set(0, 1, 0);
      up.crossVectors(side, toSat).normalize();

      const positions = link.line.geometry.attributes.position;
      for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        point.lerpVectors(tmpA, tmpB, t);

        // Envelope: máximo no meio do caminho (onde o sinal cruza a ionosfera)
        const env = Math.sin(t * Math.PI);

        // Curvatura suave = atraso/refração por TEC
        const bend = e.tecBend * 2.6 * env;
        point.addScaledVector(up, bend);

        // Ondulação de alta frequência = cintilação de fase
        const wig = e.phaseScint * 0.55 * env;
        point.addScaledVector(side, Math.sin(t * 46 + elapsed * 14 + link.seed) * wig);
        point.addScaledVector(up, Math.cos(t * 38 + elapsed * 11 + link.seed * 2) * wig * 0.7);

        positions.setXYZ(i, point.x, point.y, point.z);
      }
      positions.needsUpdate = true;

      // Cor por severidade + flicker de amplitude
      const c = link.mat.color;
      if (lockLost) {
        c.copy(COLOR_BAD);
        link.mat.opacity = (Math.sin(elapsed * 40 + link.seed) > 0.4) ? 0.55 : 0.0;
      } else {
        if (severity < 0.35) c.copy(COLOR_OK).lerp(COLOR_WARN, severity / 0.35 * 0.5);
        else c.copy(COLOR_WARN).lerp(COLOR_BAD, Math.min(1, (severity - 0.35) / 0.5));
        const flicker = e.ampScint * (0.5 * Math.abs(Math.sin(elapsed * 17 + link.seed * 3)) + 0.35 * Math.random());
        link.mat.opacity = Math.max(0.08, 0.85 - flicker);
      }
    }
  }

  return { update };
}
