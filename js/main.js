// Bootstrap: monta cena, satélites, sinais, fenômenos, UI e timeline.
import { loadData } from './data.js';
import { createScene, setEffectTargets, updateEffects } from './scene.js';
import { createSatellites } from './satellites.js';
import { createSignals } from './signal.js';
import { createPhenomena } from './phenomena.js';
import { createTimeline } from './timeline.js';
import { createUI } from './ui.js';

async function init() {
  const data = await loadData();
  const container = document.getElementById('canvas-container');
  const sceneCtx = createScene(container);
  const satsApi = createSatellites(sceneCtx);
  const signals = createSignals(sceneCtx, satsApi);

  let activeId = null;

  const timeline = createTimeline(data, (id) => select(id));

  const phenomena = createPhenomena(
    sceneCtx,
    (item) => timeline.arrived(item),                    // impacto
    (item, progress) => {
      if (progress < 1) timeline.tick(item, progress);   // relógio simulado
    },
    (item) => {                                          // fim do fenômeno
      if (activeId === item.id) setEffectTargets({});    // cena volta a acalmar
    }
  );

  const ui = createUI(data, {
    onSelect: (id) => select(id),
    onClear: () => clearSelection(),
    onReplay: (id) => startPhenomenon(data.byId[id])
  });

  function startPhenomenon(item) {
    timeline.setActive(item.id);
    setEffectTargets({});          // cena acalma enquanto as partículas viajam
    phenomena.launch(item, timeline.speed);
  }

  function select(id) {
    const item = data.byId[id];
    if (!item) return;

    if (activeId === id && item.tipo === 'indice') { clearSelection(); return; }
    activeId = id;
    ui.setActive(id);
    ui.showPanel(item);

    if (item.tipo === 'fenomeno') {
      startPhenomenon(item);
    } else {
      phenomena.stop();
      timeline.clear();
      setEffectTargets(item.efeitoCena);
    }
  }

  function clearSelection() {
    activeId = null;
    ui.setActive(null);
    ui.hidePanel();
    phenomena.stop();
    timeline.clear();
    setEffectTargets({});
  }

  window.addEventListener('resize', () => sceneCtx.resize());

  let last = performance.now();
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    updateEffects(dt);
    satsApi.update(dt, sceneCtx.elapsed);
    signals.update(dt, sceneCtx.elapsed);
    phenomena.update(dt);
    sceneCtx.update(dt);
  }
  requestAnimationFrame(animate);
}

init().catch((err) => {
  console.error(err);
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#f87171;font-family:sans-serif;padding:20px;text-align:center;z-index:99';
  div.textContent = 'Erro ao carregar o visualizador: ' + err.message;
  document.body.appendChild(div);
});
