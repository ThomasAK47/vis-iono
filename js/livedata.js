// Dados em tempo (quase) real do NOAA SWPC. Todos os endpoints servem JSON
// com CORS liberado. Falhas são silenciosas: o card simplesmente fica sem o
// valor ao vivo. Índices do EMBRACE/INPE (Ksa, S4, σφ, VTEC, ROTI, foF2) não
// têm feed JSON público — permanecem educacionais/estáticos.
const SWPC = 'https://services.swpc.noaa.gov';

const REFRESH_MS = 5 * 60 * 1000;

async function getJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${url}: ${resp.status}`);
  return resp.json();
}

function xrayClass(flux) {
  if (flux >= 1e-4) return `X${(flux / 1e-4).toFixed(1)}`;
  if (flux >= 1e-5) return `M${(flux / 1e-5).toFixed(1)}`;
  if (flux >= 1e-6) return `C${(flux / 1e-6).toFixed(1)}`;
  if (flux >= 1e-7) return `B${(flux / 1e-7).toFixed(1)}`;
  return `A${(flux / 1e-8).toFixed(1)}`;
}

// nivel: calmo | moderado | alto | severo (cores do CSS)
const FETCHERS = {
  async kp() {
    const rows = await getJson(`${SWPC}/products/noaa-planetary-k-index.json`);
    const last = rows[rows.length - 1];
    const kp = Number(last.Kp ?? last[1]);
    return {
      valor: `Kp ${kp.toFixed(1)}`,
      nivel: kp >= 8 ? 'severo' : kp >= 5 ? 'alto' : kp >= 4 ? 'moderado' : 'calmo'
    };
  },
  async dst() {
    const rows = await getJson(`${SWPC}/products/kyoto-dst.json`);
    const last = rows[rows.length - 1];
    const dst = Number(last.dst ?? last[1]);
    return {
      valor: `${dst} nT`,
      nivel: dst <= -250 ? 'severo' : dst <= -100 ? 'alto' : dst <= -30 ? 'moderado' : 'calmo'
    };
  },
  async f107() {
    const rows = await getJson(`${SWPC}/products/summary/10cm-flux.json`);
    const flux = Number(rows[0]?.flux ?? rows.Flux);
    return {
      valor: `${flux} sfu`,
      nivel: flux > 150 ? 'alto' : flux >= 100 ? 'moderado' : 'calmo'
    };
  },
  async flare() {
    const rows = await getJson(`${SWPC}/json/goes/primary/xrays-6-hour.json`);
    const long = rows.filter((r) => r.energy === '0.1-0.8nm');
    const flux = Number(long[long.length - 1]?.flux);
    if (!isFinite(flux)) throw new Error('sem fluxo');
    const cls = xrayClass(flux);
    return {
      valor: `raio-X ${cls}`,
      nivel: cls[0] === 'X' ? 'severo' : cls[0] === 'M' ? 'alto' : cls[0] === 'C' ? 'moderado' : 'calmo'
    };
  },
  async sep() {
    const rows = await getJson(`${SWPC}/json/goes/primary/integral-protons-1-day.json`);
    const p10 = rows.filter((r) => r.energy === '>=10 MeV');
    const flux = Number(p10[p10.length - 1]?.flux);
    if (!isFinite(flux)) throw new Error('sem fluxo');
    const label = flux >= 1 ? flux.toFixed(0) : flux.toFixed(2);
    return {
      valor: `${label} pfu`,
      nivel: flux >= 1000 ? 'severo' : flux >= 100 ? 'alto' : flux >= 10 ? 'moderado' : 'calmo'
    };
  },
  async wind() {
    const [spd, mag] = await Promise.all([
      getJson(`${SWPC}/products/summary/solar-wind-speed.json`),
      getJson(`${SWPC}/products/summary/solar-wind-mag-field.json`)
    ]);
    const v = Number(spd[0]?.proton_speed ?? spd.WindSpeed);
    const bz = Number(mag[0]?.bz_gsm ?? mag.Bz);
    let nivel = v > 600 ? 'alto' : v > 450 ? 'moderado' : 'calmo';
    if (bz <= -10 && nivel !== 'severo') nivel = 'alto';
    return { valor: `${Math.round(v)} km/s · Bz ${bz > 0 ? '+' : ''}${bz.toFixed(0)}`, nivel };
  }
};

// Quais cards recebem qual medida ao vivo
const CARD_SOURCES = {
  kp: 'kp',
  dst: 'dst',
  f107: 'f107',
  flare: 'flare',
  sep: 'sep',
  cme: 'wind',
  hss: 'wind'
};

export function startLiveData(onUpdate) {
  async function refresh() {
    const results = {};
    const entries = Object.entries(FETCHERS);
    const settled = await Promise.allSettled(entries.map(([, fn]) => fn()));
    settled.forEach((res, i) => {
      if (res.status === 'fulfilled') results[entries[i][0]] = res.value;
    });

    const byCard = {};
    for (const [cardId, src] of Object.entries(CARD_SOURCES)) {
      if (results[src]) byCard[cardId] = results[src];
    }
    onUpdate(byCard);
  }

  refresh();
  const timer = setInterval(refresh, REFRESH_MS);
  return () => clearInterval(timer);
}
