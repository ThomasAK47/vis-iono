# Visualizador de Interferência Ionosférica no GNSS

Visualizador 3D interativo sobre índices de clima espacial, cintilação ionosférica e seus efeitos na propagação do sinal GNSS.

**Demo:** https://thomasak47.github.io/vis-iono/

## O que ele mostra

Cena 3D (Three.js) com Sol, Terra, camada ionosférica, **campo magnético terrestre** (dipolo que comprime no lado diurno e forma cauda durante tempestades), constelação GNSS e os caminhos de sinal até uma estação terrestre. Os caminhos são retos em condições calmas e ficam **curvados** (atraso/refração por TEC), **ondulados** (cintilação de fase), **piscando** (cintilação de amplitude) ou **caem** (perda de lock) conforme o índice ou fenômeno selecionado.

O visual do Sol e das partículas segue imagens reais: granulação e regiões ativas do **SDO/AIA 304 Å**, streamers coronais e frente de CME do coronógrafo **SOHO/LASCO C2**, fótons como estrias em feixe, prótons SEP com gyração helicoidal e vento solar com curvatura de espiral de Parker.

### Dados em tempo real (NOAA SWPC)

Os cards de Kp, Dst, F10.7, flare (raios-X GOES), SEP (prótons ≥10 MeV) e vento solar (velocidade + Bz) mostram o **valor atual** consultado diretamente nos JSONs públicos do NOAA SWPC (atualização a cada 5 min, com fallback silencioso). Os índices do EMBRACE/INPE não têm feed JSON público e permanecem educacionais.

### Evento histórico — Tempestade Gannon (maio/2024)

Card especial que reproduz em sequência o flare X5.8 (chegada em 8 min) e o trem de CMEs (~37 h) da maior tempestade geomagnética em 21 anos (G5, Kp 9, Dst −412 nT), com os efeitos documentados no GNSS.

### Fenômenos solares (animação Sol → Terra)

| Fenômeno | Trânsito | Efeito principal no GNSS |
|---|---|---|
| Flare solar | ≈ 8,3 min | Salto de TEC no lado diurno (atraso de grupo, avanço de fase) |
| SEP (prótons) | ≈ 20 min – horas | Cintilação em altas latitudes, PCA |
| CME | ≈ 15 h – 3 dias | Tempestade ionosférica completa: gradientes de TEC, S4↑, σφ↑, perda de lock |
| Vento solar rápido (HSS) | ≈ 2 – 4 dias | Degradação moderada e recorrente (~27 dias) |

### Índices

Kp · Dst · Ksa (EMBRACE/INPE) · F10.7 · foF2 · VTEC · ROTI · S4 · σφ (Phi60)

### Escala temporal

O trânsito Sol–Terra varia de 8 minutos (luz) a 4 dias (plasma) — um fator de ~500×. A timeline é **segmentada por categoria física** (Luz | Partículas | Plasma) e a duração das animações é **log-comprimida**, com um relógio simulado que mostra o tempo real acelerado durante o trânsito.

## Rodando localmente

O projeto é 100% estático (ES Modules + Three.js via CDN). Basta servir a pasta:

```bash
npx http-server -p 8123
# ou
python -m http.server 8123
```

e abrir `http://localhost:8123`.

## Fontes de dados e referências

- [NOAA SWPC](https://www.swpc.noaa.gov/) — raios-X GOES, prótons, vento solar, F10.7
- [GFZ Potsdam](https://www.gfz-potsdam.de/en/kp-index/) — índice Kp
- [EMBRACE / INPE](http://www2.inpe.br/climaespacial/portal/) — Ksa, TEC, cintilação, ionossondas
- [WDC Kyoto](https://wdc.kugi.kyoto-u.ac.jp/dstdir/) — índice Dst

Nesta primeira versão os valores e faixas são estáticos (educacionais); os endpoints acima permitem plugar dados reais numa versão futura, como no projeto [Clima Solar](https://thomasak47.github.io/clima-solar/).

## Créditos

Desenvolvido por **Thomas Augusto Klotz** — Geoprocessamento, UFSM. Uso acadêmico e educacional.
