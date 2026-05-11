// app.js — controlador principal, routing, render
import * as S from './stats.js';
import * as C from './charts.js';

// ===== Config =====
const BIN_ID = '6967f7f643b1c97be930db4c';
const API_KEY = '$2a$10$74hqjPp./ngq4cI2bwPP3ODkpMQ/fup2Zf1YOKeOz6E/am1OGCVQ.';
const BASE = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const CACHE_KEY = 'tranca-cache-v2';

// ===== State =====
let data = { schemaVersion: 2, jogadores: [], partidas: [], edicoes: [] };
let escopo = 'temporada'; // 'temporada' | 'lifetime'
let temporadaAtiva = new Date().getFullYear();
let abaAtual = 'placar';

// seleção em "registrar"
let regVencedores = [];
let regPerdedores = [];
let regData = S.toISO(new Date());

// edição em "jogadores"
let editandoJogador = null;

// filtros em "histórico"
let filtroHist = { jogador: null, tipo: 'todos' };

// ===== Helpers =====
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue; // pula null/undefined/false: não cria atributos
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
};

const avatar = (nome, size = 'sm') => {
  const cls = size === 'lg' ? 'avatar lg' : size === 'xl' ? 'avatar xl' : size === 'mini' ? 'avatar mini-avatar' : 'avatar';
  return el('div', {
    class: cls,
    style: { background: S.corDoNome(nome) },
  }, S.iniciais(nome));
};

const escapeHTML = (str) =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmtPontos = (n) => `${n > 0 ? '+' : ''}${n}`;
const classePontos = (n) => n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero';

const toast = (msg, ms = 1800) => {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
};

const modal = (texto, onConfirm, opts = {}) => {
  $('modal-texto').textContent = texto;
  $('modal').classList.remove('hidden');
  const confirmBtn = $('modal-confirmar');
  confirmBtn.className = `btn-modal-confirm${opts.gold ? ' gold' : ''}`;
  confirmBtn.textContent = opts.confirmLabel || 'Confirmar';
  $('modal').dataset.callback = '1';
  $('modal')._cb = onConfirm;
};

// ===== Persistência =====
const loadCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
};
const saveCache = () => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
};

async function carregarDados() {
  const cached = loadCache();
  if (cached?.schemaVersion === 2) {
    data = cached;
    render();
  }
  try {
    const res = await fetch(`${BASE}/latest`, { headers: { 'X-Access-Key': API_KEY } });
    const j = await res.json();
    const rec = j.record || {};
    // Detecta schema antigo e migra
    if (rec.schemaVersion === 2 && Array.isArray(rec.partidas)) {
      data = { schemaVersion: 2, jogadores: rec.jogadores || [], partidas: rec.partidas || [], edicoes: rec.edicoes || [] };
    } else {
      // schema legado (jogadores com pontos + historico misto)
      data = S.migrar(rec.jogadores, rec.historico);
      // salva back migrado
      await salvarDados({ silent: true });
    }
    saveCache();
    render();
  } catch (e) {
    console.error('Erro carregando JSONBin:', e);
    if (!cached) toast('Sem conexão. Sem dados locais.');
  }
}

async function salvarDados({ silent } = {}) {
  saveCache();
  try {
    await fetch(BASE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Access-Key': API_KEY },
      body: JSON.stringify(data),
    });
    if (!silent) toast('Salvo ✓');
  } catch (e) {
    console.error('Erro salvando:', e);
    if (!silent) toast('Erro ao salvar. Tente de novo.');
  }
}

// ===== Filtros de escopo =====
const escopoAtual = () => escopo === 'temporada' ? temporadaAtiva : null;
const partidasDoEscopo = () => S.filtrarPorTemporada(data.partidas, escopoAtual());
const edicoesDoEscopo = () => S.filtrarPorTemporada(data.edicoes, escopoAtual());

// ===== Routing =====
const parseRoute = () => {
  const h = location.hash.replace(/^#\/?/, '') || 'placar';
  const [aba, ...rest] = h.split('/');
  return { aba, param: rest.join('/') };
};

const navigate = (path) => { location.hash = `/${path}`; };

window.addEventListener('hashchange', () => {
  const { aba } = parseRoute();
  abaAtual = aba;
  render();
  window.scrollTo({ top: 0 });
});

// ===== Render principal =====
function render() {
  const { aba, param } = parseRoute();
  abaAtual = aba;

  // Atualiza nav-bar
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.aba === aba || (aba === 'jogador' && b.dataset.aba === 'placar'));
  });

  // Subtitle
  const totalPartidas = data.partidas.length;
  const totalEsteAno = data.partidas.filter(p => S.parseISO(p.data)?.getFullYear() === temporadaAtiva).length;
  $('subtitle').textContent = `${data.jogadores.length} jogadores • ${totalEsteAno} partidas em ${temporadaAtiva} • ${totalPartidas} total`;

  // Toggle temporada/lifetime
  document.querySelectorAll('#seg-escopo button').forEach(b => {
    b.classList.toggle('active', b.dataset.escopo === escopo);
  });

  // Renderiza view
  const main = $('main-content');
  main.classList.remove('fade-in');
  void main.offsetWidth; // reflow para reanimar
  main.classList.add('fade-in');

  switch (aba) {
    case 'placar': renderPlacar(main); break;
    case 'jogador': renderJogador(main, decodeURIComponent(param || '')); break;
    case 'registrar': renderRegistrar(main); break;
    case 'jogadores': renderJogadores(main); break;
    case 'historico': renderHistorico(main); break;
    case 'insights': renderInsights(main); break;
    case 'hall': renderHallFama(main); break;
    default: navigate('placar');
  }
}

// ===== View: Placar =====
function renderPlacar(main) {
  const partidas = partidasDoEscopo();
  const edicoes = edicoesDoEscopo();
  const rank = S.ranking(data.jogadores, partidas, edicoes);
  const titulo = escopo === 'temporada' ? `Temporada ${temporadaAtiva}` : 'Lifetime';

  main.innerHTML = '';

  if (!rank.length) {
    main.append(card(titulo, [el('p', { class: 'empty' }, 'Cadastre jogadores e registre partidas para ver o ranking.')]));
    return;
  }

  // Pódio
  const topo = rank.slice(0, 3);
  const podio = el('div', { class: 'card' });
  podio.append(el('div', { class: 'card-title' }, titulo, el('small', {}, `${partidas.length} partida(s)`)));
  const podioGrid = el('div', { class: 'podio' });

  // ordem visual: 2º, 1º, 3º
  const ordemVisual = [topo[1], topo[0], topo[2]].filter(Boolean);
  for (const j of ordemVisual) {
    const i = rank.indexOf(j);
    const evo = S.evolucao(j.nome, partidas, edicoes).slice(-8).map(e => e.saldo);
    const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    const spot = el('div', {
      class: `podio-spot${i === 0 ? ' first' : ''}`,
      onclick: () => navigate(`jogador/${encodeURIComponent(j.nome)}`),
    },
      el('div', { class: 'podio-medal' }, medalha),
      avatar(j.nome, 'lg'),
      el('div', { class: 'podio-nome' }, j.nome),
      el('div', { class: `podio-pontos ${classePontos(j.pontos)}` }, fmtPontos(j.pontos)),
      evo.length >= 2 ? el('div', { html: C.sparkline(evo, { width: 70, height: 18 }) }) : null,
    );
    podioGrid.append(spot);
  }
  podio.append(podioGrid);
  main.append(podio);

  // Lista do 4º em diante
  if (rank.length > 3) {
    const lista = el('div', { class: 'card' });
    lista.append(el('div', { class: 'card-title' }, 'Demais colocações'));
    const ul = el('div', { class: 'ranking-list' });
    for (let i = 3; i < rank.length; i++) {
      const j = rank[i];
      const evo = S.evolucao(j.nome, partidas, edicoes).slice(-8).map(e => e.saldo);
      const tendencia = evo.length >= 2 ? (evo[evo.length - 1] - evo[0]) : 0;
      const trendTxt = j.partidas === 0
        ? 'sem partidas'
        : (tendencia > 0 ? `▲ ${tendencia}` : tendencia < 0 ? `▼ ${Math.abs(tendencia)}` : '— estável');
      ul.append(el('div', {
        class: 'rank-row',
        onclick: () => navigate(`jogador/${encodeURIComponent(j.nome)}`),
      },
        el('div', { class: 'pos' }, `${i + 1}º`),
        avatar(j.nome),
        el('div', {},
          el('div', { class: 'nome' }, j.nome),
          el('div', { class: 'trend' }, `${j.partidas} jogo(s) • ${trendTxt}`),
        ),
        evo.length >= 2 ? el('div', { html: C.sparkline(evo, { width: 50, height: 18 }) }) : el('div'),
        el('div', { class: `pontos ${classePontos(j.pontos)}` }, fmtPontos(j.pontos)),
      ));
    }
    lista.append(ul);
    main.append(lista);
  }

  // Hall da Fama link
  const anos = [...new Set(data.partidas.map(p => S.parseISO(p.data)?.getFullYear()).filter(Boolean))].sort();
  if (anos.length >= 1 && escopo === 'temporada') {
    const link = el('div', { class: 'card', style: { cursor: 'pointer' }, onclick: () => navigate('hall') },
      el('div', { class: 'row-between' },
        el('div', {}, el('strong', {}, '🏛️ Hall da Fama'), el('div', { class: 'muted', style: { fontSize: '0.8125rem', marginTop: '2px' } }, 'Campeões de temporadas passadas')),
        el('div', { class: 'muted' }, '›'),
      ),
    );
    main.append(link);
  }
}

// ===== View: Jogador =====
function renderJogador(main, nome) {
  const jogador = data.jogadores.find(j => j.nome === nome);
  if (!jogador) {
    main.innerHTML = '';
    main.append(card('Jogador não encontrado', [
      el('p', { class: 'empty' }, `Não achei "${escapeHTML(nome)}".`),
      el('button', { class: 'btn-secondary', onclick: () => navigate('placar') }, 'Voltar ao placar'),
    ]));
    return;
  }

  const partidas = partidasDoEscopo();
  const edicoes = edicoesDoEscopo();
  const rank = S.ranking(data.jogadores, partidas, edicoes);
  const pos = rank.findIndex(r => r.nome === nome) + 1;
  const stats = S.statsJogador(nome, partidas, edicoes);
  const st = S.streak(nome, partidas);
  const f = S.forma(nome, partidas, 10);
  const evo = S.evolucao(nome, partidas, edicoes);
  const sinMap = [...S.sinergia(nome, partidas).values()];
  const dueMap = [...S.duelo(nome, partidas).values()];
  const insights = S.insightsJogador(nome, partidas, data.jogadores);
  const tabela = S.tabelaJogador(nome, partidas, data.jogadores.filter(j => j.ativo !== false));

  main.innerHTML = '';

  // Back button
  main.append(el('button', { class: 'back-btn', onclick: () => history.back() }, '‹ voltar'));

  // Hero
  const hero = el('div', { class: 'player-hero' },
    avatar(nome, 'xl'),
    el('h2', {}, nome),
    el('div', { class: 'player-hero-pos' }, pos > 0 ? `${pos}º no ${escopo === 'temporada' ? `${temporadaAtiva}` : 'lifetime'}` : 'sem ranking nesse escopo'),
    el('div', { class: `player-hero-pontos ${classePontos(stats.pontos)}` }, fmtPontos(stats.pontos)),
  );

  const badges = el('div', { class: 'player-badges' });
  if (pos === 1) badges.append(el('span', { class: 'badge gold' }, '👑 Líder'));
  if (st.atual >= 3 && st.tipo === 'V') badges.append(el('span', { class: 'badge hot' }, `🔥 ${st.atual} vitórias`));
  if (st.atual >= 3 && st.tipo === 'D') badges.append(el('span', { class: 'badge cold' }, `🧊 ${st.atual} derrotas`));
  if (stats.total === 0) badges.append(el('span', { class: 'badge' }, 'Ainda não jogou'));
  if (badges.children.length) hero.append(badges);
  main.append(hero);

  // Stats grid
  const statsCard = el('div', { class: 'card' });
  statsCard.append(el('div', { class: 'card-title' }, 'Números'));
  const grid = el('div', { class: 'stats-grid' });
  grid.append(
    statCell('Partidas', stats.total),
    statCell('Vitórias / Derrotas', `${stats.vitorias} / ${stats.derrotas}`),
    statCell('% Vitória', stats.total ? `${Math.round(stats.pctVitoria * 100)}%` : '—'),
    statCell('Pontos/Partida', stats.total ? stats.pontosPorPartida.toFixed(2) : '—'),
    statCell('Streak atual', st.atual ? `${st.atual}${st.tipo}` : '—'),
    statCell('Maior streak', st.maior ? `${st.maior}${st.maiorTipo}` : '—'),
  );
  statsCard.append(grid);
  main.append(statsCard);

  // Forma recente
  if (f.length) {
    const formaCard = el('div', { class: 'card' });
    formaCard.append(el('div', { class: 'card-title' }, 'Forma recente', el('small', {}, `últimas ${f.length}`)));
    const row = el('div', { class: 'forma-row' });
    for (const item of f) {
      row.append(el('div', {
        class: `forma-dot ${item.resultado}`,
        title: `${S.formatBR(item.data)} • c/ ${item.parceiro} vs ${item.adversarios.join(' & ')}`,
      }, item.resultado));
    }
    formaCard.append(row);
    main.append(formaCard);
  }

  // Evolução de pontos
  if (evo.length >= 2) {
    const cardEvo = el('div', { class: 'card' });
    cardEvo.append(el('div', { class: 'card-title' }, 'Evolução de pontos'));
    const wrap = el('div', { class: 'chart-box' });
    const canvas = el('canvas');
    wrap.append(canvas);
    cardEvo.append(wrap);
    main.append(cardEvo);
    requestAnimationFrame(() => C.renderLinhaEvolucao(canvas, evo));
  }

  // Radar de sinergia
  if (sinMap.length) {
    const cardSin = el('div', { class: 'card' });
    cardSin.append(el('div', { class: 'card-title' }, 'Sinergia (como dupla)', el('small', {}, '% vitória por parceiro')));
    const wrap = el('div', { class: 'chart-box tall' });
    const canvas = el('canvas');
    wrap.append(canvas);
    cardSin.append(wrap);
    main.append(cardSin);
    requestAnimationFrame(() => C.renderRadarSinergia(canvas, sinMap));
  }

  // Radar de duelo
  if (dueMap.length) {
    const cardDue = el('div', { class: 'card' });
    cardDue.append(el('div', { class: 'card-title' }, 'Duelo direto', el('small', {}, 'saldo de pontos vs adversários')));
    const wrap = el('div', { class: 'chart-box tall' });
    const canvas = el('canvas');
    wrap.append(canvas);
    cardDue.append(wrap);
    main.append(cardDue);
    requestAnimationFrame(() => C.renderRadarDuelo(canvas, dueMap));
  }

  // Insights
  const cardIns = el('div', { class: 'card' });
  cardIns.append(el('div', { class: 'card-title' }, 'Análise'));
  const ins = el('div', { class: 'insights-list' });
  const addIns = (label, m, render) => {
    if (m) ins.append(el('div', { class: 'insight-item' }, el('span', { class: 'label-tag' }, label), render(m)));
  };
  addIns('Melhor parceiro', insights.melhorParceiro, m =>
    el('span', {}, el('strong', {}, m.parceiro), ` ${m.v}V–${m.d}D (${Math.round(m.pctWin * 100)}%)`));
  addIns('Pior parceiro', insights.piorParceiro, m =>
    el('span', {}, el('strong', {}, m.parceiro), ` ${m.v}V–${m.d}D (${Math.round(m.pctWin * 100)}%)`));
  addIns('Némesis', insights.nemesis, m =>
    el('span', {}, el('strong', {}, m.adversario), ` saldo ${fmtPontos(m.saldoPontos)} pts (${m.v}V–${m.d}D)`));
  addIns('Freguês', insights.fregues, m =>
    el('span', {}, el('strong', {}, m.adversario), ` saldo ${fmtPontos(m.saldoPontos)} pts (${m.v}V–${m.d}D)`));
  addIns('Mais jogou com', insights.maisJogou, m =>
    el('span', {}, el('strong', {}, m.parceiro), ` ${m.total} partida(s) juntos`));
  if (!ins.children.length) ins.append(el('div', { class: 'insight-empty' }, 'Sem dados suficientes pra gerar análise.'));
  cardIns.append(ins);
  main.append(cardIns);

  // Tabela head-to-head
  if (tabela.length) {
    const cardH2H = el('div', { class: 'card' });
    cardH2H.append(el('div', { class: 'card-title' }, 'Head-to-head'));
    const table = el('table', { class: 'h2h-table' });
    table.innerHTML = `
      <thead><tr>
        <th>Jogador</th>
        <th class="num">Junto</th>
        <th class="num">Contra</th>
        <th class="num">Saldo</th>
      </tr></thead>`;
    const tbody = el('tbody');
    for (const r of tabela) {
      if (r.partidasTotais === 0) continue;
      const tr = el('tr');
      tr.append(
        el('td', {},
          el('span', { class: 'h2h-nome', onclick: () => navigate(`jogador/${encodeURIComponent(r.nome)}`) },
            avatar(r.nome, 'mini'),
            r.nome,
          ),
        ),
        el('td', { class: 'num' }, r.comoParceiro.total ? `${r.comoParceiro.v}-${r.comoParceiro.d}` : '—'),
        el('td', { class: 'num' }, r.comoAdversario.total ? `${r.comoAdversario.v}-${r.comoAdversario.d}` : '—'),
        el('td', { class: `num ${classePontos(r.saldoDireto)}` }, r.comoAdversario.total ? fmtPontos(r.saldoDireto) : '—'),
      );
      tbody.append(tr);
    }
    table.append(tbody);
    cardH2H.append(table);
    main.append(cardH2H);
  }
}

function statCell(label, value) {
  return el('div', { class: 'stat-cell' },
    el('div', { class: 'label' }, label),
    el('div', { class: `value${String(value).length > 5 ? ' small' : ''}` }, value),
  );
}

// ===== View: Registrar =====
function renderRegistrar(main) {
  main.innerHTML = '';

  if (data.jogadores.filter(j => j.ativo !== false).length < 4) {
    main.append(card('Registrar Partida', [
      el('p', { class: 'empty' }, 'Adicione pelo menos 4 jogadores ativos pra registrar.'),
      el('button', { class: 'btn-secondary', onclick: () => navigate('jogadores') }, 'Ir para Jogadores'),
    ]));
    return;
  }

  const ativos = data.jogadores.filter(j => j.ativo !== false);

  const c = el('div', { class: 'card' });
  c.append(el('div', { class: 'card-title' }, 'Registrar partida'));

  // Data
  const dataRow = el('div', { class: 'input-row' });
  dataRow.append(
    el('label', { class: 'muted', style: { alignSelf: 'center', fontSize: '0.875rem' } }, 'Data:'),
    el('input', { type: 'date', class: 'input', value: regData, onchange: (e) => { regData = e.target.value; } }),
  );
  c.append(dataRow);

  // Vencedores
  c.append(el('div', { class: 'section-label vencedor' },
    el('span', {}, '🏆 Dupla vencedora'),
    el('span', { class: 'section-count' }, `${regVencedores.length}/2`),
  ));
  const vRow = el('div', { class: 'chips-row' });
  for (const j of ativos) {
    const sel = regVencedores.includes(j.nome);
    const blockedByD = regPerdedores.includes(j.nome);
    vRow.append(el('button', {
      class: `chip${sel ? ' selected-v' : ''}`,
      disabled: blockedByD ? '' : null,
      onclick: () => toggleSelecao(j.nome, 'v'),
    },
      el('span', { class: 'avatar mini-avatar', style: { background: S.corDoNome(j.nome) } }, S.iniciais(j.nome)),
      j.nome,
    ));
  }
  c.append(vRow);

  // Perdedores
  c.append(el('div', { class: 'section-label perdedor' },
    el('span', {}, '❌ Dupla perdedora'),
    el('span', { class: 'section-count' }, `${regPerdedores.length}/2`),
  ));
  const dRow = el('div', { class: 'chips-row' });
  for (const j of ativos) {
    const sel = regPerdedores.includes(j.nome);
    const blockedByV = regVencedores.includes(j.nome);
    dRow.append(el('button', {
      class: `chip${sel ? ' selected-d' : ''}`,
      disabled: blockedByV ? '' : null,
      onclick: () => toggleSelecao(j.nome, 'd'),
    },
      el('span', { class: 'avatar mini-avatar', style: { background: S.corDoNome(j.nome) } }, S.iniciais(j.nome)),
      j.nome,
    ));
  }
  c.append(dRow);

  // Botão registrar
  const podeRegistrar = regVencedores.length === 2 && regPerdedores.length === 2;
  const btn = el('button', {
    class: 'btn-primary',
    disabled: podeRegistrar ? null : '',
    onclick: () => registrarPartida(),
  }, 'Registrar Partida');
  c.append(btn);

  // Revanche button (se vier de uma partida recente)
  const ultima = data.partidas[data.partidas.length - 1];
  if (ultima && regVencedores.length === 0 && regPerdedores.length === 0) {
    c.append(el('div', { class: 'btn-row' },
      el('button', {
        class: 'btn-secondary', style: { flex: 1 },
        onclick: () => {
          regVencedores = [...ultima.perdedores]; // lados invertidos
          regPerdedores = [...ultima.vencedores];
          render();
        },
      }, `↻ Revanche da última (${ultima.vencedores.join(' & ')} vs ${ultima.perdedores.join(' & ')})`),
    ));
  }

  main.append(c);
}

function toggleSelecao(nome, tipo) {
  if (tipo === 'v') {
    if (regVencedores.includes(nome)) regVencedores = regVencedores.filter(n => n !== nome);
    else if (regVencedores.length < 2) regVencedores.push(nome);
  } else {
    if (regPerdedores.includes(nome)) regPerdedores = regPerdedores.filter(n => n !== nome);
    else if (regPerdedores.length < 2) regPerdedores.push(nome);
  }
  render();
}

async function registrarPartida() {
  const partida = {
    id: Date.now(),
    data: regData,
    vencedores: [...regVencedores],
    perdedores: [...regPerdedores],
  };
  const erro = S.validarPartida(partida);
  if (erro) { toast(erro); return; }

  data.partidas.push(partida);
  regVencedores = []; regPerdedores = []; regData = S.toISO(new Date());
  await salvarDados();
  toast('Partida registrada ✓');
  navigate('placar');
}

// ===== View: Jogadores =====
function renderJogadores(main) {
  main.innerHTML = '';
  const c = el('div', { class: 'card' });
  c.append(el('div', { class: 'card-title' }, 'Gerenciar jogadores'));

  // Adicionar
  const inputRow = el('div', { class: 'input-row' });
  const input = el('input', { type: 'text', class: 'input', placeholder: 'Nome do jogador', id: 'input-novo-jogador' });
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') adicionarJogador(input); });
  inputRow.append(input, el('button', { class: 'btn-add', onclick: () => adicionarJogador(input) }, '+'));
  c.append(inputRow);

  if (!data.jogadores.length) {
    c.append(el('div', { class: 'empty' }, 'Nenhum jogador. Adicione o primeiro acima.'));
  } else {
    for (const j of data.jogadores) {
      const pts = S.calcPontos(j.nome, data.partidas, data.edicoes); // sempre lifetime aqui
      const item = el('div', { class: `jogador-item${j.ativo === false ? ' inativo' : ''}` });
      const left = el('div', { class: 'jogador-item-left' },
        avatar(j.nome),
        el('div', {},
          el('div', { class: 'jogador-item-nome' }, j.nome),
          el('div', { class: 'muted', style: { fontSize: '0.6875rem' } }, j.ativo === false ? 'inativo' : 'ativo'),
        ),
      );
      const right = el('div', { class: 'jogador-item-right' });

      if (editandoJogador === j.nome) {
        const inp = el('input', { type: 'number', class: 'input-pontos', value: pts });
        inp.addEventListener('blur', () => salvarPontos(j.nome, inp.value, pts));
        inp.addEventListener('keypress', (e) => { if (e.key === 'Enter') salvarPontos(j.nome, inp.value, pts); });
        right.append(inp);
        setTimeout(() => inp.focus(), 0);
      } else {
        right.append(el('button', {
          class: `btn-icon btn-pontos ${classePontos(pts)}`,
          onclick: () => { editandoJogador = j.nome; render(); },
        }, `${fmtPontos(pts)} pts`));
      }

      right.append(el('button', {
        class: 'btn-icon',
        onclick: () => toggleAtivo(j.nome),
        title: j.ativo === false ? 'Reativar' : 'Marcar inativo',
      }, j.ativo === false ? '↺' : '⊘'));

      right.append(el('button', {
        class: 'btn-icon danger',
        onclick: () => removerJogador(j.nome),
        title: 'Remover',
      }, '🗑'));

      item.append(left, right);
      c.append(item);
    }
  }

  main.append(c);
}

async function adicionarJogador(input) {
  const nome = input.value.trim();
  if (!nome) return;
  if (data.jogadores.find(j => j.nome.toLowerCase() === nome.toLowerCase())) {
    toast('Já existe um jogador com esse nome.');
    return;
  }
  data.jogadores.push({ nome, ativo: true, criadoEm: S.toISO(new Date()) });
  input.value = '';
  await salvarDados();
  render();
}

async function salvarPontos(nome, novoStr, pontosAtuais) {
  const novo = parseInt(novoStr, 10);
  if (isNaN(novo) || novo === pontosAtuais) {
    editandoJogador = null;
    render();
    return;
  }
  data.edicoes.push({
    id: Date.now(),
    data: S.toISO(new Date()),
    jogador: nome,
    de: pontosAtuais,
    para: novo,
    motivo: 'ajuste manual',
  });
  editandoJogador = null;
  await salvarDados();
  toast('Pontos ajustados.');
  render();
}

function toggleAtivo(nome) {
  const j = data.jogadores.find(x => x.nome === nome);
  if (!j) return;
  j.ativo = !(j.ativo !== false);
  salvarDados();
  render();
}

function removerJogador(nome) {
  const temHistorico = data.partidas.some(p => p.vencedores.includes(nome) || p.perdedores.includes(nome));
  if (temHistorico) {
    modal(`${nome} tem partidas no histórico.\nMarcar como inativo preserva os dados.`, () => {
      const j = data.jogadores.find(x => x.nome === nome);
      if (j) j.ativo = false;
      salvarDados();
      render();
    }, { confirmLabel: 'Marcar inativo', gold: true });
  } else {
    modal(`Remover ${nome}?`, () => {
      data.jogadores = data.jogadores.filter(j => j.nome !== nome);
      salvarDados();
      render();
    });
  }
}

// ===== View: Histórico =====
function renderHistorico(main) {
  main.innerHTML = '';
  const c = el('div', { class: 'card' });
  c.append(el('div', { class: 'card-title' }, 'Histórico', el('small', {}, `escopo: ${escopo === 'temporada' ? temporadaAtiva : 'lifetime'}`)));

  // Filtros
  const filtros = el('div', { class: 'filters' });
  const tipos = [['todos', 'Todos'], ['partida', 'Partidas'], ['edicao', 'Edições']];
  for (const [v, label] of tipos) {
    filtros.append(el('button', {
      class: `filter-chip${filtroHist.tipo === v ? ' active' : ''}`,
      onclick: () => { filtroHist.tipo = v; render(); },
    }, label));
  }
  c.append(filtros);

  // Filtro por jogador
  const jogadorRow = el('div', { class: 'input-row' });
  const sel = el('select', { class: 'input', onchange: (e) => { filtroHist.jogador = e.target.value || null; render(); } });
  sel.append(el('option', { value: '' }, 'Todos os jogadores'));
  for (const j of data.jogadores) {
    const opt = el('option', { value: j.nome }, j.nome);
    if (filtroHist.jogador === j.nome) opt.selected = true;
    sel.append(opt);
  }
  jogadorRow.append(sel);
  c.append(jogadorRow);

  // Lista
  const partidas = partidasDoEscopo();
  const edicoes = edicoesDoEscopo();

  let items = [];
  if (filtroHist.tipo !== 'edicao') {
    items = items.concat(partidas.map(p => ({ ...p, _tipo: 'partida' })));
  }
  if (filtroHist.tipo !== 'partida') {
    items = items.concat(edicoes.map(e => ({ ...e, _tipo: 'edicao' })));
  }
  if (filtroHist.jogador) {
    items = items.filter(it => {
      if (it._tipo === 'partida') return it.vencedores.includes(filtroHist.jogador) || it.perdedores.includes(filtroHist.jogador);
      return it.jogador === filtroHist.jogador;
    });
  }
  items.sort((a, b) => S.parseISO(b.data) - S.parseISO(a.data) || b.id - a.id);

  if (!items.length) {
    c.append(el('div', { class: 'empty' }, 'Sem registros pra esse filtro.'));
  } else {
    for (const it of items) {
      const item = el('div', { class: 'historico-item' });
      const header = el('div', { class: 'historico-header' },
        el('div', { class: 'historico-data' }, S.formatBRLong(it.data)),
        el('button', { class: 'btn-icon danger', onclick: () => removerRegistro(it) }, '🗑'),
      );
      item.append(header);

      if (it._tipo === 'partida') {
        const dv = it.vencedores.includes(filtroHist.jogador) ? '+2' : it.perdedores.includes(filtroHist.jogador) ? '-1' : '';
        item.append(el('div', { class: 'historico-line vencedor' },
          '🏆', it.vencedores.join(' & '),
          el('span', { class: 'delta' }, '+2 cada'),
        ));
        item.append(el('div', { class: 'historico-line perdedor' },
          '❌', it.perdedores.join(' & '),
          el('span', { class: 'delta' }, '-1 cada'),
        ));
      } else {
        const delta = it.para - it.de;
        item.append(el('div', { class: 'historico-line' },
          '✏️',
          el('span', {}, el('strong', {}, it.jogador), ` ${it.de} → ${it.para} (${fmtPontos(delta)})`),
        ));
        if (it.motivo) item.append(el('div', { class: 'muted', style: { fontSize: '0.75rem', marginTop: '4px' } }, it.motivo));
      }

      c.append(item);
    }
  }

  main.append(c);
}

function removerRegistro(it) {
  const msg = it._tipo === 'partida'
    ? `Deletar partida?\n${it.vencedores.join(' & ')} vs ${it.perdedores.join(' & ')}\n${S.formatBR(it.data)}`
    : `Deletar edição de ${it.jogador}?\n${it.de} → ${it.para}`;
  modal(msg, async () => {
    if (it._tipo === 'partida') data.partidas = data.partidas.filter(p => p.id !== it.id);
    else data.edicoes = data.edicoes.filter(e => e.id !== it.id);
    await salvarDados();
    toast('Removido ✓');
    render();
  });
}

// ===== View: Insights =====
function renderInsights(main) {
  main.innerHTML = '';
  const partidas = partidasDoEscopo();
  const edicoes = edicoesDoEscopo();

  if (!partidas.length) {
    main.append(card('Insights', [el('p', { class: 'empty' }, 'Sem partidas no escopo atual.')]));
    return;
  }

  // MVP do mês atual
  const hoje = new Date();
  const mvp = S.mvpDoMes(hoje.getFullYear(), hoje.getMonth() + 1, partidas, edicoes, data.jogadores);

  // KVs
  const c1 = el('div', { class: 'card' });
  c1.append(el('div', { class: 'card-title' }, 'Destaques'));
  const kv = el('div', { class: 'kv-list' });

  if (mvp) {
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    kv.append(kvRow(`MVP de ${meses[hoje.getMonth()]}/${hoje.getFullYear()}`, mvp.nome, mvp.pontos, mvp.partidas));
  }

  // Jogador mais frequente
  const freq = data.jogadores.map(j => ({
    nome: j.nome,
    total: partidas.filter(p => S.participou(p, j.nome)).length,
  })).sort((a, b) => b.total - a.total);
  if (freq[0]?.total > 0) kv.append(kvRow('Mais presente', freq[0].nome, null, freq[0].total));

  // Dupla mais vitoriosa
  const duplas = S.duplasRanking(partidas, 2);
  if (duplas[0]) kv.append(kvDupla('Dupla mais vitoriosa', duplas[0]));
  if (duplas.length > 1) {
    const pior = duplas[duplas.length - 1];
    if (pior.pctWin <= 0.4) kv.append(kvDupla('Dupla mais derrotada', pior));
  }

  c1.append(kv);
  main.append(c1);

  // Curiosidades
  const facts = S.curiosidades(data.jogadores, partidas);
  if (facts.length) {
    const c2 = el('div', { class: 'card' });
    c2.append(el('div', { class: 'card-title' }, 'Sabia que…'));
    const list = el('div', { class: 'curiosidades' });
    for (const f of facts) {
      list.append(el('div', { class: 'curiosidade', html: f.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }));
    }
    c2.append(list);
    main.append(c2);
  }

  // Dia da semana
  const dist = S.distribuicaoDiaSemana(partidas);
  if (dist.some(n => n > 0)) {
    const c3 = el('div', { class: 'card' });
    c3.append(el('div', { class: 'card-title' }, 'Quando vocês jogam'));
    const wrap = el('div', { class: 'chart-box small' });
    const canvas = el('canvas');
    wrap.append(canvas);
    c3.append(wrap);
    main.append(c3);
    requestAnimationFrame(() => C.renderDistDiaSemana(canvas, dist));
  }

  // Heatmap sinergia
  const ativos = data.jogadores.filter(j => j.ativo !== false);
  if (ativos.length >= 2 && partidas.length >= 3) {
    const c4 = el('div', { class: 'card' });
    c4.append(el('div', { class: 'card-title' }, 'Heatmap de sinergia', el('small', {}, '% vitória entre parceiros')));
    const wrap = el('div');
    c4.append(wrap);
    main.append(c4);
    requestAnimationFrame(() => {
      const m = S.matrizSinergia(ativos, partidas);
      C.renderHeatmap(wrap, m.nomes, m.matrix);
    });
  }
}

function kvRow(label, nome, pontos, total) {
  return el('div', { class: 'kv-row' },
    el('span', { class: 'kv-label' }, label),
    el('span', { class: 'kv-value' },
      avatar(nome, 'mini'),
      el('span', {}, nome),
      pontos != null ? el('span', { class: `text-${pontos >= 0 ? 'pos' : 'neg'}` }, `${fmtPontos(pontos)} pts`) : null,
      total != null ? el('span', { class: 'muted', style: { fontSize: '0.75rem' } }, `(${total} jogo${total !== 1 ? 's' : ''})`) : null,
    ),
  );
}

function kvDupla(label, dupla) {
  return el('div', { class: 'kv-row' },
    el('span', { class: 'kv-label' }, label),
    el('span', { class: 'kv-value' },
      avatar(dupla.dupla[0], 'mini'),
      avatar(dupla.dupla[1], 'mini'),
      el('span', {}, dupla.dupla.join(' & ')),
      el('span', { class: 'muted', style: { fontSize: '0.75rem' } }, `${dupla.v}V-${dupla.d}D • ${Math.round(dupla.pctWin * 100)}%`),
    ),
  );
}

// ===== View: Hall da Fama =====
function renderHallFama(main) {
  main.innerHTML = '';
  main.append(el('button', { class: 'back-btn', onclick: () => history.back() }, '‹ voltar'));

  const anos = [...new Set(data.partidas.map(p => S.parseISO(p.data)?.getFullYear()).filter(Boolean))].sort((a, b) => b - a);
  const c = el('div', { class: 'card' });
  c.append(el('div', { class: 'card-title' }, '🏛️ Hall da Fama'));

  if (!anos.length) {
    c.append(el('div', { class: 'empty' }, 'Ainda sem temporadas registradas.'));
  } else {
    for (const ano of anos) {
      const ps = S.filtrarPorTemporada(data.partidas, ano);
      const es = S.filtrarPorTemporada(data.edicoes, ano);
      const rank = S.ranking(data.jogadores, ps, es);
      if (!rank.length) continue;
      const isAtual = ano === temporadaAtiva;
      c.append(el('div', { style: { marginBottom: '14px' } },
        el('div', { class: 'row-between', style: { marginBottom: '6px' } },
          el('strong', { class: 'text-gold' }, `Temporada ${ano}${isAtual ? ' (em curso)' : ''}`),
          el('span', { class: 'muted', style: { fontSize: '0.75rem' } }, `${ps.length} partida(s)`),
        ),
        ...rank.slice(0, 3).map((r, i) => el('div', {
          class: 'rank-row',
          onclick: () => navigate(`jogador/${encodeURIComponent(r.nome)}`),
        },
          el('div', { class: 'pos' }, ['🥇', '🥈', '🥉'][i] || `${i + 1}º`),
          avatar(r.nome),
          el('div', { class: 'nome' }, r.nome),
          el('div'),
          el('div', { class: `pontos ${classePontos(r.pontos)}` }, fmtPontos(r.pontos)),
        )),
      ));
    }
  }
  main.append(c);
}

// ===== Utilitário card simples =====
function card(titulo, children) {
  const c = el('div', { class: 'card' });
  c.append(el('div', { class: 'card-title' }, titulo));
  for (const ch of children) c.append(ch);
  return c;
}

// ===== Eventos globais =====
document.addEventListener('DOMContentLoaded', () => {
  // Nav
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.addEventListener('click', () => navigate(b.dataset.aba));
  });

  // Toggle escopo
  document.querySelectorAll('#seg-escopo button').forEach(b => {
    b.addEventListener('click', () => {
      escopo = b.dataset.escopo;
      render();
    });
  });

  // Modal
  $('modal-cancelar').addEventListener('click', () => {
    $('modal').classList.add('hidden');
    $('modal')._cb = null;
  });
  $('modal-confirmar').addEventListener('click', () => {
    const cb = $('modal')._cb;
    $('modal').classList.add('hidden');
    $('modal')._cb = null;
    if (cb) cb();
  });

  // Rota inicial
  abaAtual = parseRoute().aba;

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  carregarDados();
});
