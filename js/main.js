// Bootstrap: monta cena, satélites, sinais, fenômenos, UI, timeline e
// dados ao vivo; orquestra sequências de eventos históricos (flare -> CME).
import { loadData } from './data.js';
import { createScene, setEffectTargets, updateEffects } from './scene.js';
import { createSatellites } from './satellites.js';
import { createSignals } from './signal.js';
import { createPhenomena } from './phenomena.js';
import { createTimeline } from './timeline.js';
import { createUI } from './ui.js';
import { startLiveData } from './livedata.js';

async function init() {
  const data = await loadData();
  const container = document.getElementById('canvas-container');
  const sceneCtx = createScene(container);
  const satsApi = createSatellites(sceneCtx);
  const signals = createSignals(sceneCtx, satsApi);

  let activeId = null;
  let sequenceQueue = [];   // fases restantes de um evento histórico

  const timeline = createTimeline(data, (id) => select(id));

  const phenomena = createPhenomena(
    sceneCtx,
    (item) => timeline.arrived(item),                    // impacto
    (item, progress) => {
      if (progress < 1) timeline.tick(item, progress);   // relógio simulado
    },
    (item) => {                                          // fim de uma fase
      if (sequenceQueue.length > 0) {
        phenomena.launch(sequenceQueue.shift(), timeline.speed);
      } else if (activeId && (item.id === activeId || item.eventoId === activeId)) {
        setEffectTargets({});                            // cena volta a acalmar
      }
    }
  );

  const ui = createUI(data, {
    onSelect: (id) => select(id),
    onClear: () => clearSelection(),
    onReplay: (id) => startItem(data.byId[id])
  });

  startLiveData((byCard) => ui.updateLive(byCard));

  // Constrói as fases de um evento histórico como itens sintéticos
  function eventPhases(evento) {
    return evento.sequencia.map((fase) => ({
      ...fase,
      id: `${evento.id}-${fase.estilo}`,
      eventoId: evento.id,
      icone: evento.icone,
      cor: evento.cor
    }));
  }

  function startItem(item) {
    sequenceQueue = [];
    timeline.setActive(item.tipo === 'fenomeno' ? item.id : null);
    setEffectTargets({});          // cena acalma enquanto as partículas viajam

    if (item.tipo === 'evento') {
      const phases = eventPhases(item);
      sequenceQueue = phases.slice(1);
      phenomena.launch(phases[0], timeline.speed);
    } else {
      phenomena.launch(item, timeline.speed);
    }
  }

  function select(id) {
    const item = data.byId[id];
    if (!item) return;

    if (activeId === id && item.tipo === 'indice') { clearSelection(); return; }
    activeId = id;
    ui.setActive(id);
    ui.showPanel(item);

    if (item.tipo === 'indice') {
      sequenceQueue = [];
      phenomena.stop();
      timeline.clear();
      setEffectTargets(item.efeitoCena);
    } else {
      startItem(item);
    }
  }

  function clearSelection() {
    activeId = null;
    sequenceQueue = [];
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
