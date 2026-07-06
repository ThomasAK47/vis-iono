// Cena base: Sol (shader de granulação + streamers), Terra, ionosfera (shader),
// campo magnético terrestre (dipolo com compressão diurna e cauda), auroras e estrelas.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const EARTH_RADIUS = 10;
export const IONO_RADIUS = 13;
export const ORBIT_RADIUS = 26;
export const SUN_POS = new THREE.Vector3(-150, 14, -55);

// Vetor de estado dos efeitos visuais (0..1). "target" é para onde os valores
// convergem a cada frame; os cards e fenômenos escrevem em target.
export const EFFECT_KEYS = ['sun', 'flash', 'storm', 'disturbance', 'bubbles', 'tecBend', 'ampScint', 'phaseScint', 'lock', 'poles'];
export const effects = { current: {}, target: {} };
for (const k of EFFECT_KEYS) { effects.current[k] = 0; effects.target[k] = 0; }

export function setEffectTargets(map = {}) {
  for (const k of EFFECT_KEYS) effects.target[k] = map[k] ?? 0;
}

export function updateEffects(dt) {
  const speed = 2.2;
  for (const k of EFFECT_KEYS) {
    const c = effects.current[k], t = effects.target[k];
    effects.current[k] = c + (t - c) * Math.min(1, dt * speed);
  }
  // O flash decai sozinho depois do impacto
  effects.target.flash *= Math.max(0, 1 - dt * 1.2);
}

function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,180,60,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(',1)', ',0.55)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Streamers coronais (referência: coronógrafo SOHO/LASCO C2): raios radiais
// em leque com brilho variável, desenhados numa textura de sprite.
function makeStreamerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.translate(256, 256);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 34; i++) {
    const ang = rnd() * Math.PI * 2;
    const len = 120 + rnd() * 130;
    const width = 0.05 + rnd() * 0.16;
    const alpha = 0.05 + rnd() * 0.16;
    const g = ctx.createRadialGradient(0, 0, 30, 0, 0, len);
    g.addColorStop(0, `rgba(255,190,120,${alpha})`);
    g.addColorStop(0.5, `rgba(255,150,80,${alpha * 0.55})`);
    g.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, len, ang - width, ang + width);
    ctx.closePath();
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

// Textura estilizada da Terra (oceano + continentes procedurais).
function makeEarthTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#0d2b52');
  g.addColorStop(0.5, '#123c6e');
  g.addColorStop(1, '#0d2b52');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);

  // Continentes: blobs pseudo-aleatórios determinísticos
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  ctx.fillStyle = '#2e7d4f';
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 512, y = 40 + rnd() * 176, r = 14 + rnd() * 34;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const rr = r * (0.6 + rnd() * 0.7);
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.65);
    }
    ctx.closePath();
    ctx.fill();
  }
  // Calotas polares
  ctx.fillStyle = 'rgba(230,240,255,0.85)';
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillRect(0, 242, 512, 14);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Ruído compartilhado pelos shaders (Sol e ionosfera)
const GLSL_NOISE = /* glsl */`
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.1;
      a *= 0.5;
    }
    return v;
  }
`;

// Superfície solar (referência: SDO/AIA 304 Å): granulação fina vermelho-
// alaranjada, filamentos escuros serpenteando, regiões ativas amarelo-brancas
// e limbo brilhante difuso.
const SUN_VERT = /* glsl */`
  varying vec3 vObjPos;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vObjPos = normalize(position);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SUN_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uActivity;
  uniform float uFlash;
  varying vec3 vObjPos;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  ${GLSL_NOISE}

  void main() {
    vec3 p = vObjPos;

    // Granulação fina (mosqueado da cromosfera)
    float gran = fbm(p * 16.0 + vec3(uTime * 0.02, 0.0, -uTime * 0.015));
    // Estrutura média (manchas claras/escuras maiores)
    float mid = fbm(p * 5.0 + vec3(0.0, uTime * 0.008, 0.0));
    // Filamentos escuros (linhas serpenteantes)
    float fil = fbm(p * 3.2 + vec3(4.7, 9.1, 1.3));
    float filament = smoothstep(0.02, 0.06, abs(fil - 0.5));

    // Rampa de cor: vermelho profundo -> laranja vivo
    vec3 deep = vec3(0.55, 0.10, 0.03);
    vec3 hot  = vec3(1.00, 0.45, 0.10);
    vec3 col = mix(deep, hot, clamp(mid * 0.7 + gran * 0.55, 0.0, 1.0));
    col *= 0.75 + 0.5 * gran;       // textura granulada
    col *= 0.72 + 0.28 * filament;  // filamentos escurecem

    // Regiões ativas: bolsões amarelo-brancos, mais numerosos com atividade alta
    float ar = fbm(p * 2.4 + vec3(11.0, 3.0, 7.0));
    float activeReg = smoothstep(0.66 - uActivity * 0.10, 0.80 - uActivity * 0.08, ar);
    col = mix(col, vec3(1.0, 0.92, 0.62), activeReg * (0.75 + uActivity * 0.25));

    // Limbo brilhante (em EUV a borda é mais clara e difusa)
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - abs(dot(viewDir, normalize(vNormalW))), 2.0);
    col += vec3(1.0, 0.55, 0.22) * rim * (0.55 + uActivity * 0.3);

    // Flash de flare: clarão geral
    col += vec3(1.0, 0.97, 0.88) * uFlash * 0.8;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const IONO_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const IONO_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uDisturbance;
  uniform float uBubbles;
  uniform float uFlash;
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  ${GLSL_NOISE}

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 2.2);

    vec3 p = normalize(vWorldPos);
    float n = noise(p * 4.0 + vec3(uTime * 0.05, 0.0, uTime * 0.03));

    // Cor base: ciano calmo -> laranja/vermelho perturbado
    vec3 calm = vec3(0.25, 0.75, 1.0);
    vec3 storm = vec3(1.0, 0.42, 0.18);
    vec3 col = mix(calm, storm, clamp(uDisturbance * (0.45 + 0.75 * n), 0.0, 1.0));

    // Bolhas de plasma: estrias magenta na faixa equatorial, subindo pós-pôr do sol
    float lat = asin(clamp(p.y, -1.0, 1.0));
    float band = exp(-pow(lat / 0.38, 2.0));
    float streak = smoothstep(0.55, 0.9, noise(vec3(p.x * 9.0, p.y * 2.5 - uTime * 0.25, p.z * 9.0)));
    col += vec3(0.85, 0.25, 0.9) * uBubbles * band * streak * 1.4;

    // Flash no lado diurno (flare)
    float day = max(dot(normalize(vNormal), normalize(uSunDir)), 0.0);
    col += vec3(1.0, 0.95, 0.8) * uFlash * day * 1.6;

    float alpha = fresnel * (0.35 + 0.55 * uDisturbance)
                + uBubbles * band * streak * 0.35
                + uFlash * day * 0.4
                + 0.05;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.9));
  }
`;

// Linhas de campo do dipolo terrestre: r = L·cos²(λ). Compressão do lado
// diurno (pressão do vento solar) e alongamento em cauda no lado noturno,
// ambos intensificados durante tempestades.
function createMagnetosphere(scene) {
  const L_SHELLS = [1.7, 2.3, 3.1, 4.0];
  const N_LON = 10;
  const STEPS = 48;
  const lines = [];
  const group = new THREE.Group();
  group.rotation.z = 0.19; // inclinação ~11° do eixo do dipolo

  const colorCalm = new THREE.Color(0x4fc3f7);
  const colorStorm = new THREE.Color(0x9dffb0);

  for (const L of L_SHELLS) {
    const lamMax = Math.acos(Math.sqrt(1 / L));
    for (let j = 0; j < N_LON; j++) {
      const lon = (j / N_LON) * Math.PI * 2;
      const base = new Float32Array((STEPS + 1) * 3);
      for (let i = 0; i <= STEPS; i++) {
        const lam = -lamMax + (i / STEPS) * 2 * lamMax;
        const r = L * Math.cos(lam) * Math.cos(lam) * EARTH_RADIUS;
        const horiz = r * Math.cos(lam);
        base[i * 3] = horiz * Math.cos(lon);
        base[i * 3 + 1] = r * Math.sin(lam);
        base[i * 3 + 2] = horiz * Math.sin(lon);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
      const mat = new THREE.LineBasicMaterial({
        color: colorCalm.clone(), transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      group.add(line);
      lines.push({ base, geo, mat });
    }
  }
  scene.add(group);

  const toSun = SUN_POS.clone().normalize(); // direção Terra -> Sol
  const p = new THREE.Vector3();

  function update(storm) {
    const compress = 0.10 + 0.28 * storm;
    const tail = 0.22 + 0.55 * storm;
    for (const l of lines) {
      const pos = l.geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        p.set(l.base[i * 3], l.base[i * 3 + 1], l.base[i * 3 + 2]);
        const r = p.length();
        if (r > 0.001) {
          const s = p.dot(toSun) / r; // +1 lado diurno, -1 lado noturno
          if (s > 0) {
            p.multiplyScalar(1 - compress * Math.pow(s, 1.5));
          } else {
            p.addScaledVector(toSun, -r * tail * s * s * ((r / EARTH_RADIUS) / 4));
          }
        }
        pos.setXYZ(i, p.x, p.y, p.z);
      }
      pos.needsUpdate = true;
      l.mat.opacity = 0.14 + storm * 0.30;
      l.mat.color.copy(colorCalm).lerp(colorStorm, storm * 0.8);
    }
  }

  return { update };
}

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);

  const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 2000);
  camera.position.set(26, 16, 52);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(-14, 2, -4);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 18;
  controls.maxDistance = 320;

  // Luzes
  const sunLight = new THREE.DirectionalLight(0xfff4d6, 2.2);
  sunLight.position.copy(SUN_POS);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x334466, 0.9));

  // Estrelas
  {
    const n = 1600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(700 + Math.random() * 300);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xbfd0ff, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.8 });
    scene.add(new THREE.Points(geo, mat));
  }

  // ===== Sol =====
  const sunGroup = new THREE.Group();
  sunGroup.position.copy(SUN_POS);
  const sunUniforms = {
    uTime: { value: 0 },
    uActivity: { value: 0 },
    uFlash: { value: 0 }
  };
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(16, 64, 64),
    new THREE.ShaderMaterial({ vertexShader: SUN_VERT, fragmentShader: SUN_FRAG, uniforms: sunUniforms })
  );
  sunGroup.add(sunMesh);

  const glowTex = makeGlowTexture('rgba(255,170,80,1)', 'rgba(255,110,40,0)');
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff9a45, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  sunGlow.scale.setScalar(66);
  sunGroup.add(sunGlow);

  // Streamers coronais (leque de raios radiais, gira lentamente)
  const streamers = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeStreamerTexture(), color: 0xffc080, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  streamers.scale.setScalar(120);
  sunGroup.add(streamers);

  const flareGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  flareGlow.scale.setScalar(90);
  sunGroup.add(flareGlow);
  scene.add(sunGroup);

  // ===== Terra =====
  const earthGroup = new THREE.Group();
  const earthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 48, 48),
    new THREE.MeshPhongMaterial({ map: makeEarthTexture(), shininess: 18, specular: 0x223355 })
  );
  earthGroup.add(earthMesh);

  // Atmosfera fina
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.03, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false })
  );
  earthGroup.add(atmo);

  // ===== Ionosfera (shader) =====
  const ionoUniforms = {
    uTime: { value: 0 },
    uDisturbance: { value: 0 },
    uBubbles: { value: 0 },
    uFlash: { value: 0 },
    uSunDir: { value: SUN_POS.clone().normalize() }
  };
  const ionoMesh = new THREE.Mesh(
    new THREE.SphereGeometry(IONO_RADIUS, 64, 64),
    new THREE.ShaderMaterial({
      vertexShader: IONO_VERT,
      fragmentShader: IONO_FRAG,
      uniforms: ionoUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  earthGroup.add(ionoMesh);

  // ===== Auroras polares (tempestade / SEP) =====
  const auroraTex = makeGlowTexture('rgba(120,255,180,1)', 'rgba(60,255,160,0)');
  const auroras = [];
  for (const y of [EARTH_RADIUS * 1.05, -EARTH_RADIUS * 1.05]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.2, 1.3, 12, 40),
      new THREE.MeshBasicMaterial({ color: 0x53ffa0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.position.y = y;
    ring.rotation.x = Math.PI / 2;
    earthGroup.add(ring);
    auroras.push(ring);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: auroraTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.y = y * 1.12;
    glow.scale.setScalar(13);
    earthGroup.add(glow);
    auroras.push(glow);
  }

  scene.add(earthGroup);

  // ===== Campo magnético terrestre =====
  const magnetosphere = createMagnetosphere(scene);

  const ctx = {
    renderer, scene, camera, controls,
    earthGroup, earthMesh, ionoUniforms, sunGlow, flareGlow, auroras,
    elapsed: 0
  };

  ctx.update = (dt) => {
    ctx.elapsed += dt;
    const e = effects.current;

    earthMesh.rotation.y += dt * 0.03;
    sunMesh.rotation.y += dt * 0.008;
    streamers.material.rotation += dt * 0.012;
    ionoUniforms.uTime.value = ctx.elapsed;
    ionoUniforms.uDisturbance.value = e.disturbance;
    ionoUniforms.uBubbles.value = e.bubbles;
    ionoUniforms.uFlash.value = e.flash;

    sunUniforms.uTime.value = ctx.elapsed;
    sunUniforms.uActivity.value = e.sun;
    sunUniforms.uFlash.value = e.flash;

    // Sol: brilho cresce com atividade + flash de flare
    const pulse = 1 + Math.sin(ctx.elapsed * 2.2) * 0.02;
    sunGlow.scale.setScalar((66 + e.sun * 22) * pulse);
    sunGlow.material.opacity = 0.7 + e.sun * 0.25;
    streamers.material.opacity = 0.42 + e.sun * 0.3;
    streamers.scale.setScalar(120 + e.sun * 25);
    flareGlow.material.opacity = e.flash * 0.9;
    flareGlow.scale.setScalar(90 + e.flash * 55);

    // Auroras
    for (const a of auroras) a.material.opacity = Math.min(0.75, e.poles * 0.7 + e.storm * 0.25);

    // Magnetosfera: comprime e brilha com a tempestade
    magnetosphere.update(e.storm);

    controls.update();
    renderer.render(scene, camera);
  };

  ctx.resize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };

  return ctx;
}
