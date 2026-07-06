// Animações Sol -> Terra com visual baseado em imagens reais:
//  - Flare: estrias de fótons em feixe (raios-X/EUV viajando em linha reta)
//  - SEP: prótons com movimento de giro helicoidal (gyração em torno do campo)
//  - CME: frente brilhante + interior difuso expandindo (referência SOHO/LASCO)
//  - HSS: leque contínuo de fluxo com curvatura de espiral de Parker
// Duração log-comprimida vs. tempo real; relógio simulado corre em timeline.js.
import * as THREE from 'three';
import { SUN_POS, IONO_RADIUS, setEffectTargets, effects } from './scene.js';

function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export function createPhenomena(sceneCtx, onArrival, onProgress, onDone) {
  const { scene } = sceneCtx;
  const dotTex = makeDotTexture();
  let active = null;

  const earthPos = new THREE.Vector3(0, 0, 0);
  const axis = earthPos.clone().sub(SUN_POS).normalize(); // Sol -> Terra
  const sideA = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
  const sideB = axis.clone().cross(sideA).normalize();
  const travelDist = SUN_POS.distanceTo(earthPos) - IONO_RADIUS;

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  // Direção aleatória dentro de um cone em torno do eixo Sol->Terra
  function coneDir(halfAngle, out) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * halfAngle;
    out.copy(axis)
      .addScaledVector(sideA, Math.cos(a) * Math.sin(r))
      .addScaledVector(sideB, Math.sin(a) * Math.sin(r))
      .normalize();
    return out;
  }

  // ---------- Construtores por estilo ----------

  // Flare: feixe de estrias (LineSegments), fótons viajando à velocidade da luz
  function buildFlare(group) {
    const N = 170;
    const pos = new Float32Array(N * 2 * 3);
    const meta = [];
    for (let i = 0; i < N; i++) {
      meta.push({
        delay: Math.random() * 0.25,
        dir: coneDir(0.055, new THREE.Vector3()).clone(),
        len: 4 + Math.random() * 5,
        speedJit: 0.95 + Math.random() * 0.1
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xfff3c4, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    group.add(lines);

    return (t, dur) => {
      const posAttr = geo.attributes.position;
      for (let i = 0; i < N; i++) {
        const m = meta[i];
        let p = ((t / dur) - m.delay) * m.speedJit;
        p = Math.max(0, Math.min(1, p));
        const head = Math.min(travelDist, p * (travelDist + m.len));
        const tail = Math.max(0, head - m.len);
        tmp.copy(SUN_POS).addScaledVector(m.dir, 16 + head);
        tmp2.copy(SUN_POS).addScaledVector(m.dir, 16 + tail);
        posAttr.setXYZ(i * 2, tmp.x, tmp.y, tmp.z);
        posAttr.setXYZ(i * 2 + 1, tmp2.x, tmp2.y, tmp2.z);
      }
      posAttr.needsUpdate = true;
      return [mat];
    };
  }

  // SEP: prótons com gyração helicoidal em torno da direção de propagação,
  // desviando para os polos ao se aproximar do campo terrestre
  function buildSep(group) {
    const N = 260;
    const pos = new Float32Array(N * 3);
    const meta = [];
    for (let i = 0; i < N; i++) {
      const pole = Math.random() < 0.5 ? 1 : -1;
      meta.push({
        delay: Math.random() * 0.3,
        dir: coneDir(0.10, new THREE.Vector3()).clone(),
        target: new THREE.Vector3((Math.random() - 0.5) * 7, pole * IONO_RADIUS * 0.85, (Math.random() - 0.5) * 7),
        gyro: 0.5 + Math.random() * 0.9,
        freq: 22 + Math.random() * 26,
        phase: Math.random() * Math.PI * 2
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xe879f9, size: 1.25, map: dotTex, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    group.add(pts);

    return (t, dur) => {
      const posAttr = geo.attributes.position;
      for (let i = 0; i < N; i++) {
        const m = meta[i];
        let p = (t / dur) - m.delay;
        p = Math.max(0, Math.min(1, p));
        // Trajetória reta no começo, curvando para o alvo polar no final
        const straight = tmp.copy(SUN_POS).addScaledVector(m.dir, 16 + p * travelDist);
        const curveW = p * p;
        tmp.lerpVectors(straight, tmp2.lerpVectors(SUN_POS, m.target, p), curveW);
        // Gyração: hélice apertada em torno da trajetória
        const th = p * m.freq + m.phase;
        tmp.addScaledVector(sideA, Math.cos(th) * m.gyro)
           .addScaledVector(sideB, Math.sin(th) * m.gyro);
        posAttr.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      posAttr.needsUpdate = true;
      return [mat];
    };
  }

  // CME: casca frontal brilhante (frente de choque) + nuvem interior difusa,
  // expandindo lateralmente enquanto viaja — o visual clássico do LASCO C2
  function buildCme(group) {
    const FRONT = 520, INNER = 680;

    function capDirs(n) {
      const arr = [];
      for (let i = 0; i < n; i++) arr.push(coneDir(1, new THREE.Vector3()).clone());
      return arr;
    }
    const frontDirs = capDirs(FRONT);
    const innerDirs = capDirs(INNER);
    const innerDepth = new Float32Array(INNER);
    for (let i = 0; i < INNER; i++) innerDepth[i] = 0.45 + Math.random() * 0.5;

    function makePts(n, color, size, opacity) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const mat = new THREE.PointsMaterial({
        color, size, map: dotTex, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      group.add(pts);
      return { geo, mat };
    }
    const front = makePts(FRONT, 0xffd9a0, 2.1, 0.9);  // frente: quente e brilhante
    const inner = makePts(INNER, 0xff5a38, 1.6, 0.5);  // interior: vermelho difuso

    return (t, dur) => {
      const p = Math.max(0, Math.min(1, t / dur));
      const R = 6 + p * travelDist;               // raio da frente
      const halfAngle = 0.26 + p * 0.22;          // abre em leque conforme viaja
      const wob = 1 + Math.sin(t * 3.1) * 0.015;  // turbulência sutil

      const fPos = front.geo.attributes.position;
      for (let i = 0; i < FRONT; i++) {
        const d = frontDirs[i];
        // Reprojeta a direção pré-gerada (cone unitário) para a abertura atual
        tmp.copy(axis)
          .addScaledVector(sideA, (d.dot(sideA)) * halfAngle * 3.4)
          .addScaledVector(sideB, (d.dot(sideB)) * halfAngle * 3.4)
          .normalize();
        tmp2.copy(SUN_POS).addScaledVector(tmp, 16 + R * wob);
        fPos.setXYZ(i, tmp2.x, tmp2.y, tmp2.z);
      }
      fPos.needsUpdate = true;

      const iPos = inner.geo.attributes.position;
      for (let i = 0; i < INNER; i++) {
        const d = innerDirs[i];
        tmp.copy(axis)
          .addScaledVector(sideA, (d.dot(sideA)) * halfAngle * 3.0)
          .addScaledVector(sideB, (d.dot(sideB)) * halfAngle * 3.0)
          .normalize();
        tmp2.copy(SUN_POS).addScaledVector(tmp, 16 + R * innerDepth[i]);
        iPos.setXYZ(i, tmp2.x, tmp2.y, tmp2.z);
      }
      iPos.needsUpdate = true;

      return [front.mat, inner.mat];
    };
  }

  // HSS: leque contínuo de partículas com curvatura de espiral de Parker
  // (a fonte gira com o Sol, o fluxo chega "de lado")
  function buildHss(group) {
    const N = 540;
    const pos = new Float32Array(N * 3);
    const meta = [];
    for (let i = 0; i < N; i++) {
      meta.push({
        delay: Math.random(),
        dir: coneDir(0.16, new THREE.Vector3()).clone(),
        curve: 6 + Math.random() * 7,
        jit: Math.random() * 10
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x5eead4, size: 1.15, map: dotTex, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    group.add(pts);

    return (t, dur) => {
      const posAttr = geo.attributes.position;
      for (let i = 0; i < N; i++) {
        const m = meta[i];
        // Fluxo contínuo: cada partícula recomeça do Sol ao chegar
        let p = ((t / dur) - m.delay) % 1;
        if (p < 0) p += 1;
        tmp.copy(SUN_POS).addScaledVector(m.dir, 16 + p * travelDist);
        // Curvatura de Parker: desvio lateral que cresce e depois endireita
        const bend = Math.sin(p * Math.PI) * m.curve;
        tmp.addScaledVector(sideB, bend)
           .addScaledVector(sideA, Math.sin(p * 9 + m.jit + t * 1.5) * 0.5);
        posAttr.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      posAttr.needsUpdate = true;
      return [mat];
    };
  }

  const BUILDERS = { flare: buildFlare, sep: buildSep, cme: buildCme, hss: buildHss };

  // ---------- Ciclo de vida ----------

  function launch(item, speedFactor = 1) {
    stop();
    const estilo = item.estilo || item.id;
    const build = BUILDERS[estilo];
    if (!build) return;

    const group = new THREE.Group();
    scene.add(group);
    const step = build(group);

    // Clarão de partida no Sol (a erupção em si)
    if (estilo === 'flare' || estilo === 'cme') effects.target.flash = Math.max(effects.target.flash, 0.45);

    active = {
      item, group, step,
      dur: item.animDur / speedFactor,
      t: 0,
      arrived: false,
      holdAfterArrival: 6,
      doneAt: null,
      mats: []
    };
  }

  function stop() {
    if (!active) return;
    active.group.traverse((obj) => {
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
    scene.remove(active.group);
    active = null;
  }

  function update(dt) {
    if (!active) return;
    active.t += dt;
    const { item, dur } = active;

    const front = Math.min(1, active.t / dur);
    onProgress?.(item, front);

    active.mats = active.step(active.t, dur) || [];

    if (!active.arrived && front >= 1) {
      active.arrived = true;
      setEffectTargets(item.efeitoCena);
      if ((item.estilo || item.id) === 'flare') effects.target.flash = 1.0;
      onArrival?.(item);
      active.doneAt = active.t + active.holdAfterArrival;
    }

    if (active.arrived) {
      for (const m of active.mats) m.opacity = Math.max(0, m.opacity - dt * 0.3);
      if (active.t >= active.doneAt) {
        const finished = active.item;
        stop();
        onDone?.(finished);
      }
    }
  }

  return { launch, stop, update, get active() { return active; } };
}
