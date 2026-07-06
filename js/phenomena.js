// Animações Sol -> Terra: fótons (flare), prótons (SEP), nuvem de plasma (CME)
// e fluxo contínuo (HSS). Duração da animação é log-comprimida em relação ao
// tempo real de trânsito; um relógio simulado corre em paralelo (timeline.js).
import * as THREE from 'three';
import { SUN_POS, IONO_RADIUS, setEffectTargets, effects } from './scene.js';

const STYLES = {
  flare: { count: 260, color: 0xfff3b0, size: 1.5, spread: 3.5, trail: 0.06 },
  sep:   { count: 220, color: 0xe879f9, size: 1.2, spread: 7.0, trail: 0.10, poleBend: true },
  cme:   { count: 900, color: 0xff7a5c, size: 1.9, spread: 22.0, trail: 0.22, cloud: true },
  hss:   { count: 500, color: 0x5eead4, size: 1.1, spread: 12.0, trail: 0.35, stream: true }
};

export function createPhenomena(sceneCtx, onArrival, onProgress, onDone) {
  const { scene } = sceneCtx;
  let active = null;

  function makeTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }
  const dotTex = makeTexture();

  function launch(item, speedFactor = 1) {
    stop();
    const style = STYLES[item.id];
    if (!style) return;

    const dur = item.animDur / speedFactor;
    const n = style.count;
    const positions = new Float32Array(n * 3);
    const meta = []; // { delay, offset(Vector3), target(Vector3) }
    const earthPos = new THREE.Vector3(0, 0, 0);
    const dir = earthPos.clone().sub(SUN_POS).normalize();
    const sideA = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const sideB = dir.clone().cross(sideA).normalize();

    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.6) * style.spread;
      const off = sideA.clone().multiplyScalar(Math.cos(a) * r)
        .add(sideB.clone().multiplyScalar(Math.sin(a) * r));

      // Alvo: superfície da ionosfera; SEP curva para os polos
      let target;
      if (style.poleBend) {
        const pole = Math.random() < 0.5 ? 1 : -1;
        target = new THREE.Vector3((Math.random() - 0.5) * 6, pole * IONO_RADIUS * 0.85, (Math.random() - 0.5) * 6);
      } else {
        target = dir.clone().multiplyScalar(-IONO_RADIUS)
          .add(off.clone().multiplyScalar(style.cloud ? 0.55 : 0.18));
      }

      meta.push({
        delay: style.stream ? Math.random() * 0.55 : Math.random() * style.trail,
        off, target,
        jitter: Math.random() * 10
      });
      positions.set([SUN_POS.x, SUN_POS.y, SUN_POS.z], i * 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: style.color, size: style.size, map: dotTex,
      transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    active = {
      item, points, geo, mat, meta, dur,
      t: 0,
      arrived: false,
      holdAfterArrival: 6,
      doneAt: null
    };
  }

  function stop() {
    if (!active) return;
    scene.remove(active.points);
    active.geo.dispose();
    active.mat.dispose();
    active = null;
  }

  const tmp = new THREE.Vector3();

  function update(dt) {
    if (!active) return;
    active.t += dt;
    const { meta, dur, item } = active;
    const positions = active.geo.attributes.position;

    // Progresso da frente da animação (0..1 até o impacto)
    const front = Math.min(1, active.t / dur);
    onProgress?.(item, front);

    for (let i = 0; i < meta.length; i++) {
      const m = meta[i];
      let p = (active.t - m.delay * dur) / dur;
      if (STYLES[item.id].stream) p = p % 1.15; // fluxo contínuo recomeça
      p = Math.max(0, Math.min(1, p));

      // Trajetória: Sol -> alvo, com espalhamento máximo no meio do caminho
      tmp.lerpVectors(SUN_POS, m.target, p);
      const envelope = Math.sin(p * Math.PI);
      tmp.addScaledVector(m.off, envelope * (0.4 + 0.6 * p));
      tmp.x += Math.sin(active.t * 3 + m.jitter) * 0.3 * envelope;
      tmp.y += Math.cos(active.t * 2.6 + m.jitter) * 0.3 * envelope;
      positions.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    positions.needsUpdate = true;

    // Impacto: aplica os efeitos do fenômeno na cena
    if (!active.arrived && front >= 1) {
      active.arrived = true;
      setEffectTargets(item.efeitoCena);
      if (item.id === 'flare') effects.target.flash = 1.0;
      onArrival?.(item);
      active.doneAt = active.t + active.holdAfterArrival;
    }

    // Fade-out das partículas depois do impacto
    if (active.arrived) {
      active.mat.opacity = Math.max(0, active.mat.opacity - dt * 0.35);
      if (active.t >= active.doneAt) {
        const finished = active.item;
        stop();
        onDone?.(finished);
      }
    }
  }

  return { launch, stop, update, get active() { return active; } };
}
