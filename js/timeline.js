// Timeline segmentada (Luz | Partículas | Plasma) + relógio simulado.
// A animação 3D é log-comprimida; o relógio mostra o tempo real de trânsito
// correndo acelerado, deixando a compressão explícita para o usuário.

function formatSimTime(seconds) {
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172800) {
    const h = seconds / 3600;
    return h < 10 ? `${h.toFixed(1)} h` : `${Math.round(h)} h`;
  }
  return `${(seconds / 86400).toFixed(1)} dias`;
}

export function createTimeline(data, onSelect) {
  const clockWrap = document.getElementById('simClock');
  const clockValue = document.getElementById('simClockValue');
  const btnSpeed = document.getElementById('btnSpeed');
  const markers = {};

  for (const f of data.fenomenos) {
    const segEl = document.querySelector(`.seg-markers[data-seg="${f.seg}"]`);
    if (!segEl) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tl-marker';
    btn.style.setProperty('--card-color', f.cor);
    btn.style.left = `${f.segPos}%`;
    btn.textContent = `${f.icone} ${f.nome.split(' ')[0].replace('—', '').trim()}`;
    btn.title = `${f.nome} — ${f.transitoLabel}`;
    btn.addEventListener('click', () => onSelect(f.id));
    segEl.appendChild(btn);
    markers[f.id] = btn;
  }

  let speed = 1;
  btnSpeed.addEventListener('click', () => {
    speed = speed === 1 ? 2 : 1;
    btnSpeed.textContent = `${speed}×`;
  });

  return {
    get speed() { return speed; },

    setActive(id) {
      for (const [mid, el] of Object.entries(markers)) {
        el.classList.toggle('active', mid === id);
        el.classList.remove('pulsing');
      }
    },

    // progress 0..1 durante o trânsito Sol->Terra
    tick(item, progress) {
      clockWrap.hidden = false;
      clockValue.textContent = formatSimTime(progress * item.transitoSegundos);
      markers[item.id]?.classList.add('pulsing');
    },

    arrived(item) {
      clockValue.textContent = `${formatSimTime(item.transitoSegundos)} — impacto!`;
      markers[item.id]?.classList.remove('pulsing');
    },

    clear() {
      clockWrap.hidden = true;
      this.setActive(null);
    }
  };
}
