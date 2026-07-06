# Visualizador de Interferência Ionosférica no GNSS

Visualizador 3D interativo sobre índices de clima espacial, cintilação ionosférica e seus efeitos na propagação do sinal GNSS.

**Demo:** https://thomasak47.github.io/vis-iono/

## O que ele mostra

Cena 3D (Three.js) com Sol, Terra, camada ionosférica, constelação GNSS e os caminhos de sinal até uma estação terrestre. Os caminhos são retos em condições calmas e ficam **curvados** (atraso/refração por TEC), **ondulados** (cintilação de fase), **piscando** (cintilação de amplitude) ou **caem** (perda de lock) conforme o índice ou fenômeno selecionado.

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
