// Cards clicáveis, painel lateral de detalhes e modal de créditos.

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

  function makeCard(item, sub) {
    const btn = el(`
      <button type="button" class="card-item" style="--card-color:${item.cor}">
        <span class="card-ic">${item.icone}</span>
        <span class="card-txt">
          <span class="card-nome">${esc(item.nome)}</span>
          <span class="card-sub">${esc(sub)}</span>
        </span>
      </button>
    `);
    btn.addEventListener('click', () => onSelect(item.id));
    cardEls[item.id] = btn;
    return btn;
  }

  const fenContainer = document.getElementById('cardsFenomenos');
  for (const f of data.fenomenos) fenContainer.appendChild(makeCard(f, f.transitoLabel));
  const indContainer = document.getElementById('cardsIndices');
  for (const i of data.indices) indContainer.appendChild(makeCard(i, i.categoria));

  function nivelDot(nivel) {
    const known = ['calmo', 'moderado', 'alto', 'severo'];
    return known.includes(nivel) ? nivel : 'moderado';
  }

  function showPanel(item) {
    const isFen = item.tipo === 'fenomeno';
    let html = `
      <span class="panel-tag" style="--card-color:${item.cor}">${isFen ? 'Fenômeno solar' : 'Índice'}</span>
      <h2 class="panel-title">${item.icone} ${esc(item.nome)}</h2>
      <p class="panel-cat">${esc(isFen ? item.medida : item.categoria + ' · ' + item.unidade)}</p>
    `;

    if (isFen) {
      html += `<div class="transit-chip">🕑 Chega à Terra em ${esc(item.transitoLabel)}</div>`;
    }

    html += `
      <div class="panel-block">
        <span class="panel-label">O que é</span>
        <p class="panel-text">${esc(item.definicao)}</p>
      </div>
    `;

    if (isFen) {
      html += `
        <div class="panel-block">
          <span class="panel-label">Acoplamento com a ionosfera</span>
          <p class="panel-text">${esc(item.mecanismo)}</p>
        </div>
        <div class="panel-block">
          <span class="panel-label">Faixa típica</span>
          <p class="panel-text">${esc(item.faixaTipica)}</p>
        </div>
      `;
    } else {
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

    if (isFen) {
      html += `<button type="button" class="btn-replay" style="--card-color:${item.cor}" id="btnReplay">▶ Repetir animação</button>`;
    }

    panelContent.innerHTML = html;
    panel.hidden = false;
    panel.scrollTop = 0;
    document.getElementById('btnReplay')?.addEventListener('click', () => onReplay(item.id));
  }

  function setActive(id) {
    for (const [cid, elBtn] of Object.entries(cardEls)) {
      elBtn.classList.toggle('active', cid === id);
    }
  }

  function hidePanel() {
    panel.hidden = true;
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

  return { showPanel, hidePanel, setActive };
}
