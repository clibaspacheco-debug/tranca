// charts.js — wrappers de Chart.js (CDN, global `Chart`).
// Cada render destrói o chart anterior (via dataset no canvas) pra evitar leak.

const PALETTE = {
  gold: '#facc15',
  green: '#22c55e',
  greenSoft: 'rgba(74,222,128,0.4)',
  red: '#f87171',
  redSoft: 'rgba(248,113,113,0.4)',
  blue: '#60a5fa',
  blueSoft: 'rgba(96,165,250,0.4)',
  text: '#ecfdf5',
  grid: 'rgba(167,243,208,0.28)',
  axis: 'rgba(187,247,208,0.75)',
};

const destroyChart = (canvas) => {
  const existing = Chart.getChart?.(canvas);
  if (existing) existing.destroy();
};

const baseFont = { family: 'Inter, system-ui, sans-serif', size: 11 };

// === Radar de Sinergia (parceiros) ===
// dados = [{ parceiro, total, v, d, pctWin }]
export const renderRadarSinergia = (canvas, dados) => {
  destroyChart(canvas);
  const filtrados = dados.filter(d => d.total > 0);
  if (!filtrados.length) {
    renderEmpty(canvas, 'Sem partidas suficientes pra calcular sinergia.');
    return;
  }
  const labels = filtrados.map(d => d.parceiro);
  const values = filtrados.map(d => Math.round(d.pctWin * 100));
  const counts = filtrados.map(d => d.total);

  new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: '% Vitória como dupla',
        data: values,
        backgroundColor: PALETTE.greenSoft,
        borderColor: PALETTE.green,
        borderWidth: 2,
        pointBackgroundColor: PALETTE.green,
        pointBorderColor: '#022c22',
        pointRadius: 4,
        pointHoverRadius: 6,
      }],
    },
    options: chartBase({
      scales: radarScale(0, 100, '%'),
      plugins: {
        legend: { display: false },
        tooltip: tooltipConfig((ctx) => {
          const i = ctx.dataIndex;
          const d = filtrados[i];
          return [`${labels[i]}`, `${d.v}V – ${d.d}D em ${counts[i]} partida(s)`, `${values[i]}% vitória`];
        }),
      },
    }),
  });
};

// === Radar de Duelo (adversários) — saldo de pontos ===
// dados = [{ adversario, total, v, d, saldoPontos }]
export const renderRadarDuelo = (canvas, dados) => {
  destroyChart(canvas);
  const filtrados = dados.filter(d => d.total > 0);
  if (!filtrados.length) {
    renderEmpty(canvas, 'Sem confrontos diretos pra calcular.');
    return;
  }
  const labels = filtrados.map(d => d.adversario);
  // normaliza pra escala 0..100 (centro = 50 = empate em pontos)
  const max = Math.max(10, ...filtrados.map(d => Math.abs(d.saldoPontos)));
  const values = filtrados.map(d => 50 + (d.saldoPontos / max) * 50);
  const saldos = filtrados.map(d => d.saldoPontos);

  new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Saldo direto',
        data: values,
        backgroundColor: PALETTE.blueSoft,
        borderColor: PALETTE.blue,
        borderWidth: 2,
        pointBackgroundColor: (ctx) => saldos[ctx.dataIndex] >= 0 ? PALETTE.green : PALETTE.red,
        pointBorderColor: '#022c22',
        pointRadius: 4,
        pointHoverRadius: 6,
      }],
    },
    options: chartBase({
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: PALETTE.grid },
          angleLines: { color: PALETTE.grid },
          pointLabels: { color: PALETTE.text, font: baseFont },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: tooltipConfig((ctx) => {
          const i = ctx.dataIndex;
          const d = filtrados[i];
          const sinal = d.saldoPontos > 0 ? '+' : '';
          return [`vs ${labels[i]}`, `${d.v}V – ${d.d}D em ${d.total} confronto(s)`, `Saldo: ${sinal}${d.saldoPontos} pts`];
        }),
      },
    }),
  });
};

// === Linha de evolução ===
// dados = [{ data: "YYYY-MM-DD", saldo: int }]
export const renderLinhaEvolucao = (canvas, dados) => {
  destroyChart(canvas);
  if (!dados.length) {
    renderEmpty(canvas, 'Sem evolução pra mostrar.');
    return;
  }
  const labels = dados.map(d => formatLabel(d.data));
  const values = dados.map(d => d.saldo);
  const last = values[values.length - 1];
  const cor = last >= 0 ? PALETTE.green : PALETTE.red;
  const corSoft = last >= 0 ? PALETTE.greenSoft : PALETTE.redSoft;

  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Saldo acumulado',
        data: values,
        borderColor: cor,
        backgroundColor: corSoft,
        borderWidth: 2,
        tension: 0.25,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: cor,
        pointBorderColor: '#022c22',
      }],
    },
    options: chartBase({
      scales: {
        x: {
          grid: { color: PALETTE.grid, drawTicks: false },
          ticks: { color: PALETTE.axis, font: baseFont, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
        },
        y: {
          grid: { color: PALETTE.grid },
          ticks: { color: PALETTE.axis, font: baseFont },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: tooltipConfig((ctx) => [`${labels[ctx.dataIndex]}`, `Saldo: ${values[ctx.dataIndex]}`]),
      },
    }),
  });
};

// === Barras: distribuição por dia da semana ===
export const renderDistDiaSemana = (canvas, distribuicao) => {
  destroyChart(canvas);
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: dias,
      datasets: [{
        data: distribuicao,
        backgroundColor: dias.map((_, i) =>
          distribuicao[i] === Math.max(...distribuicao) ? PALETTE.gold : PALETTE.greenSoft
        ),
        borderColor: PALETTE.green,
        borderWidth: 1,
        borderRadius: 6,
      }],
    },
    options: chartBase({
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: PALETTE.text, font: baseFont },
        },
        y: {
          beginAtZero: true,
          grid: { color: PALETTE.grid },
          ticks: { color: PALETTE.axis, font: baseFont, stepSize: 1, precision: 0 },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: tooltipConfig((ctx) => [`${dias[ctx.dataIndex]}`, `${distribuicao[ctx.dataIndex]} partida(s)`]),
      },
    }),
  });
};

// === Heatmap (DOM-based, sem Chart.js) ===
// matriz = NxN com { v, d, total, pctWin } ou null. nomes = array N.
export const renderHeatmap = (container, nomes, matriz) => {
  container.innerHTML = '';
  const n = nomes.length;

  const wrapper = document.createElement('div');
  wrapper.className = 'heatmap-wrap';

  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';
  grid.style.gridTemplateColumns = `auto repeat(${n}, 1fr)`;

  // header row (colunas)
  grid.appendChild(spacer());
  for (const nome of nomes) {
    const h = document.createElement('div');
    h.className = 'heatmap-label heatmap-label-col';
    h.textContent = abrev(nome);
    h.title = nome;
    grid.appendChild(h);
  }

  for (let i = 0; i < n; i++) {
    const lbl = document.createElement('div');
    lbl.className = 'heatmap-label heatmap-label-row';
    lbl.textContent = abrev(nomes[i]);
    lbl.title = nomes[i];
    grid.appendChild(lbl);

    for (let j = 0; j < n; j++) {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      if (i === j) {
        cell.classList.add('diag');
      } else {
        const data = matriz[i][j];
        if (!data || data.total === 0) {
          cell.classList.add('empty');
          cell.title = `${nomes[i]} & ${nomes[j]}: nunca jogaram juntos`;
        } else {
          const pct = Math.round(data.pctWin * 100);
          const intensity = Math.min(1, data.total / 6);
          cell.style.background = data.pctWin >= 0.5
            ? `rgba(16,185,129,${0.25 + intensity * 0.55})`
            : `rgba(248,113,113,${0.25 + intensity * 0.55})`;
          cell.innerHTML = `<span class="heatmap-pct">${pct}%</span><span class="heatmap-n">${data.total}</span>`;
          cell.title = `${nomes[i]} & ${nomes[j]}: ${data.v}V-${data.d}D (${pct}% vitória)`;
        }
      }
      grid.appendChild(cell);
    }
  }

  wrapper.appendChild(grid);
  container.appendChild(wrapper);
};

// === Sparkline mini (SVG, sem Chart.js — leve pra placar) ===
export const sparkline = (valores, opts = {}) => {
  if (!valores.length) return '';
  const w = opts.width || 80;
  const h = opts.height || 24;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const range = max - min || 1;
  const dx = w / (valores.length - 1 || 1);
  const points = valores.map((v, i) => {
    const x = i * dx;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const trend = valores[valores.length - 1] - valores[0];
  const cor = trend >= 0 ? '#4ade80' : '#f87171';
  return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline fill="none" stroke="${cor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="${points}"/>
  </svg>`;
};

// --- helpers internos ---

function chartBase(extra) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400, easing: 'easeOutCubic' },
    resizeDelay: 0,
    ...extra,
  };
}

function radarScale(min, max, suffix = '') {
  return {
    r: {
      min, max,
      ticks: {
        color: PALETTE.axis,
        backdropColor: 'transparent',
        font: baseFont,
        stepSize: (max - min) / 4,
        callback: (v) => `${v}${suffix}`,
      },
      grid: { color: PALETTE.grid },
      angleLines: { color: PALETTE.grid },
      pointLabels: { color: PALETTE.text, font: baseFont },
    },
  };
}

function tooltipConfig(labelFn) {
  return {
    backgroundColor: '#022c22',
    titleColor: PALETTE.gold,
    bodyColor: PALETTE.text,
    borderColor: PALETTE.green,
    borderWidth: 1,
    padding: 10,
    displayColors: false,
    callbacks: {
      title: () => '',
      label: labelFn,
    },
  };
}

function renderEmpty(canvas, msg) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#6ee7b7';
  ctx.font = '13px Inter, system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
}

function formatLabel(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function abrev(nome) {
  return nome.length <= 4 ? nome : nome.slice(0, 3);
}

function spacer() {
  const s = document.createElement('div');
  s.className = 'heatmap-spacer';
  return s;
}
