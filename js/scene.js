// Cena base: Sol, Terra, ionosfera (shader), auroras polares e estrelas.
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
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(16, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0xffc94d })
  );
  sunGroup.add(sunMesh);
  const glowTex = makeGlowTexture('rgba(255,200,90,1)', 'rgba(255,140,40,0)');
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffb347, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  sunGlow.scale.setScalar(70);
  sunGroup.add(sunGlow);
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

  const ctx = {
    renderer, scene, camera, controls,
    earthGroup, earthMesh, ionoUniforms, sunGlow, flareGlow, auroras,
    elapsed: 0
  };

  ctx.update = (dt) => {
    ctx.elapsed += dt;
    const e = effects.current;

    earthMesh.rotation.y += dt * 0.03;
    ionoUniforms.uTime.value = ctx.elapsed;
    ionoUniforms.uDisturbance.value = e.disturbance;
    ionoUniforms.uBubbles.value = e.bubbles;
    ionoUniforms.uFlash.value = e.flash;

    // Sol: brilho cresce com atividade + flash de flare
    const pulse = 1 + Math.sin(ctx.elapsed * 2.2) * 0.02;
    sunGlow.scale.setScalar((70 + e.sun * 22) * pulse);
    sunGlow.material.opacity = 0.85 + e.sun * 0.15;
    flareGlow.material.opacity = e.flash * 0.9;
    flareGlow.scale.setScalar(90 + e.flash * 55);

    // Auroras
    for (const a of auroras) a.material.opacity = Math.min(0.75, e.poles * 0.7 + e.storm * 0.25);

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
