// Cards clicáveis (com valores ao vivo da NOAA), painel lateral de detalhes
// e modal de créditos.

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function createUI(data, { onSelect, onClear, onReplay }) {
  const panel = document.getElementById('detailPanel');
  const panelContent = document.getElementById('panelContent');
  const cardEls = {};
  let live = {};          // id do card -> { valor, nivel }
  let openItem = null;    // item atualmente exibido no painel

  function makeCard(item, sub) {
    const btn = el(`
      <button type="button" class="card-item" style="--card-color:${item.cor}">
        <span class="card-ic">${item.icone}</span>
        <span class="card-txt">
          <span class="card-nome">${esc(item.nome)}</span>
          <span class="card-sub">${esc(sub)}</span>
        </span>
        <span class="card-live" hidden></span>
      </button>
    `);
    btn.addEventListener('click', () => onSelect(item.id));
    cardEls[item.id] = btn;
    return btn;
  }

  const evtContainer = document.getElementById('cardsEventos');
  for (const e of data.eventos ?? []) evtContainer.appendChild(makeCard(e, e.subtitulo));
  const fenContainer = document.getElementById('cardsFenomenos');
  for (const f of data.fenomenos) fenContainer.appendChild(makeCard(f, f.transitoLabel));
  const indContainer = document.getElementById('cardsIndices');
  for (const i of data.indices) indContainer.appendChild(makeCard(i, i.categoria));

  function nivelDot(nivel) {
    const known = ['calmo', 'moderado', 'alto', 'severo'];
    return known.includes(nivel) ? nivel : 'moderado';
  }

  function liveBlockHtml(item) {
    const lv = live[item.id];
    if (!lv) return '';
    return `
      <div class="live-now nivel-${nivelDot(lv.nivel)}" id="liveNowBlock">
        <span class="live-pulse"></span>
        <span>AGORA (NOAA SWPC): <b>${esc(lv.valor)}</b></span>
      </div>
    `;
  }

  function showPanel(item) {
    openItem = item;
    const isIndice = item.tipo === 'indice';
    const isEvento = item.tipo === 'evento';

    let html = `
      <span class="panel-tag" style="--card-color:${item.cor}">${isEvento ? 'Evento histórico' : isIndice ? 'Índice' : 'Fenômeno solar'}</span>
      <h2 class="panel-title">${item.icone} ${esc(item.nome)}</h2>
      <p class="panel-cat">${esc(isIndice ? item.categoria + ' · ' + item.unidade : isEvento ? item.subtitulo : item.medida)}</p>
    `;

    html += liveBlockHtml(item);

    if (!isIndice) {
      html += `<div class="transit-chip">🕑 ${isEvento ? esc(item.transitoLabel) : 'Chega à Terra em ' + esc(item.transitoLabel)}</div>`;
    }

    html += `
      <div class="panel-block">
        <span class="panel-label">${isEvento ? 'O que aconteceu' : 'O que é'}</span>
        <p class="panel-text">${esc(item.definicao)}</p>
      </div>
    `;

    if (isIndice) {
      html += `
        <div class="panel-block">
          <span class="panel-label">Valores típicos (${esc(item.cadencia)})</span>
          <div class="faixa-list">
            ${item.faixas.map(f => `
              <div class="faixa-row">
                <span class="faixa-dot ${nivelDot(f.nivel)}"></span>
                <span class="faixa-valor">${esc(f.valor)}</span>
                <span class="faixa-desc">${esc(f.desc)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="panel-block">
          <span class="panel-label">${isEvento ? 'Cronologia' : 'Acoplamento com a ionosfera'}</span>
          <p class="panel-text">${esc(item.mecanismo)}</p>
        </div>
        <div class="panel-block">
          <span class="panel-label">${isEvento ? 'Números do evento' : 'Faixa típica'}</span>
          <p class="panel-text">${esc(item.faixaTipica)}</p>
        </div>
      `;
    }

    html += `
      <div class="panel-block">
        <span class="panel-label">Efeito no sinal GNSS</span>
        <p class="panel-text">${esc(item.efeitoGNSS)}</p>
      </div>
      <div class="panel-block">
        <span class="panel-label">Fonte de dados</span>
        <p class="panel-text"><a href="${esc(item.fonteUrl)}" target="_blank" rel="noopener">${esc(item.fonte)}</a></p>
      </div>
    `;

    if (!isIndice) {
      html += `<button type="button" class="btn-replay" style="--card-color:${item.cor}" id="btnReplay">▶ Repetir animação</button>`;
    }

    panelContent.innerHTML = html;
    panel.hidden = false;
    panel.scrollTop = 0;
    document.getElementById('btnReplay')?.addEventListener('click', () => onReplay(item.id));
  }

  function updateLive(byCard) {
    live = byCard;
    for (const [id, lv] of Object.entries(byCard)) {
      const badge = cardEls[id]?.querySelector('.card-live');
      if (!badge) continue;
      badge.textContent = lv.valor;
      badge.className = `card-live nivel-${nivelDot(lv.nivel)}`;
      badge.hidden = false;
    }
    // Painel aberto: atualiza o bloco "agora" sem redesenhar tudo
    if (openItem && !panel.hidden) {
      const block = document.getElementById('liveNowBlock');
      const lv = live[openItem.id];
      if (block && lv) {
        block.className = `live-now nivel-${nivelDot(lv.nivel)}`;
        block.querySelector('b').textContent = lv.valor;
      } else if (!block && lv) {
        showPanel(openItem);
      }
    }
  }

  function setActive(id) {
    for (const [cid, elBtn] of Object.entries(cardEls)) {
      elBtn.classList.toggle('active', cid === id);
    }
  }

  function hidePanel() {
    panel.hidden = true;
    openItem = null;
    setActive(null);
  }

  document.getElementById('panelClose').addEventListener('click', () => { hidePanel(); onClear(); });
  document.getElementById('btnReset').addEventListener('click', () => { hidePanel(); onClear(); });

  // Sidebar colapsável no mobile
  const sidebar = document.getElementById('sidebar');
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });

  // Modal de créditos
  const modal = document.getElementById('modal-creditos');
  document.getElementById('btnCreditos').addEventListener('click', () => { modal.hidden = false; });
  modal.querySelector('.modal-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.hidden = true; });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      if (!modal.hidden) modal.hidden = true;
      else if (!panel.hidden) { hidePanel(); onClear(); }
    }
  });

  return { showPanel, hidePanel, setActive, updateLive };
}
