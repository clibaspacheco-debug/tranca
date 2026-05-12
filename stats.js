// stats.js — funções puras de cálculo. Sem dependência de DOM/rede.
// Schema esperado:
//   partida = { id, data: "YYYY-MM-DD", vencedores: [nome, nome], perdedores: [nome, nome] }
//   edicao  = { id, data: "YYYY-MM-DD", jogador: nome, de: int, para: int, motivo?: string }

export const parseISO = (s) => {
  // aceita "YYYY-MM-DD" e o legado "DD/MM/YYYY"
  if (!s) return null;
  if (s.includes('/')) {
    const [d, m, y] = s.split('/');
    return new Date(+y, +m - 1, +d);
  }
  const [y, m, d] = s.split('-');
  return new Date(+y, +m - 1, +d);
};

export const toISO = (d) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

export const formatBR = (iso) => {
  const d = parseISO(iso);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export const formatBRLong = (iso) => {
  const d = parseISO(iso);
  if (!d) return '';
  const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${dias[d.getDay()]}, ${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
};

// Delta de pontos numa partida para um jogador
export const deltaPartida = (p, nome) => {
  if (p.vencedores?.includes(nome)) return 2;
  if (p.perdedores?.includes(nome)) return -1;
  return 0;
};

// Filtra por temporada (ano) ou retorna tudo se ano == null
export const filtrarPorTemporada = (items, ano) => {
  if (ano == null) return items;
  return items.filter(it => {
    const d = parseISO(it.data);
    return d && d.getFullYear() === ano;
  });
};

// Filtra items cuja `data` está nos últimos N dias (a partir de hoje, inclusivo)
export const filtrarPorJanela = (items, dias, hoje = new Date()) => {
  const cutoff = new Date(hoje);
  cutoff.setDate(cutoff.getDate() - dias);
  cutoff.setHours(0, 0, 0, 0);
  return items.filter(it => {
    const d = parseISO(it.data);
    return d && d >= cutoff;
  });
};

// Total de pontos do jogador, derivado de partidas + edições
export const calcPontos = (nome, partidas, edicoes) => {
  let pts = 0;
  for (const p of partidas) pts += deltaPartida(p, nome);
  for (const e of edicoes) if (e.jogador === nome) pts += (e.para - e.de);
  return pts;
};

// Ranking ordenado de todos os jogadores ativos
export const ranking = (jogadores, partidas, edicoes) => {
  return jogadores
    .filter(j => j.ativo !== false)
    .map(j => ({
      ...j,
      pontos: calcPontos(j.nome, partidas, edicoes),
      partidas: partidas.filter(p => participou(p, j.nome)).length,
    }))
    .sort((a, b) => b.pontos - a.pontos || b.partidas - a.partidas || a.nome.localeCompare(b.nome));
};

export const participou = (p, nome) => p.vencedores?.includes(nome) || p.perdedores?.includes(nome);

export const venceu = (p, nome) => !!p.vencedores?.includes(nome);

export const parceiroNa = (p, nome) => {
  if (p.vencedores?.includes(nome)) return p.vencedores.find(n => n !== nome);
  if (p.perdedores?.includes(nome)) return p.perdedores.find(n => n !== nome);
  return null;
};

export const adversariosNa = (p, nome) => {
  if (p.vencedores?.includes(nome)) return [...(p.perdedores || [])];
  if (p.perdedores?.includes(nome)) return [...(p.vencedores || [])];
  return [];
};

// Estatísticas individuais
export const statsJogador = (nome, partidas, edicoes) => {
  const minhas = partidas.filter(p => participou(p, nome));
  const v = minhas.filter(p => venceu(p, nome)).length;
  const d = minhas.length - v;
  const pontos = calcPontos(nome, partidas, edicoes);
  const ppp = minhas.length ? pontos / minhas.length : 0;
  return {
    total: minhas.length,
    vitorias: v,
    derrotas: d,
    pctVitoria: minhas.length ? v / minhas.length : 0,
    pontos,
    pontosPorPartida: ppp,
  };
};

// Streak atual e maior
export const streak = (nome, partidas) => {
  const ord = [...partidas].filter(p => participou(p, nome))
    .sort((a, b) => parseISO(b.data) - parseISO(a.data) || b.id - a.id);
  if (!ord.length) return { atual: 0, tipo: null, maior: 0, maiorTipo: null };

  // streak atual = primeira sequência (a partir da última partida)
  const ultimoTipo = venceu(ord[0], nome) ? 'V' : 'D';
  let atual = 0;
  for (const p of ord) {
    const t = venceu(p, nome) ? 'V' : 'D';
    if (t === ultimoTipo) atual++;
    else break;
  }

  // maior streak histórica (cronológica)
  const cron = [...ord].reverse();
  let maior = 0, maiorTipo = null, cur = 0, curTipo = null;
  for (const p of cron) {
    const t = venceu(p, nome) ? 'V' : 'D';
    if (t === curTipo) cur++;
    else { curTipo = t; cur = 1; }
    if (cur > maior) { maior = cur; maiorTipo = curTipo; }
  }

  return { atual, tipo: ultimoTipo, maior, maiorTipo };
};

// Forma recente (últimas N partidas, ordem cronológica)
export const forma = (nome, partidas, n = 10) => {
  const ord = [...partidas].filter(p => participou(p, nome))
    .sort((a, b) => parseISO(a.data) - parseISO(b.data) || a.id - b.id);
  return ord.slice(-n).map(p => ({
    resultado: venceu(p, nome) ? 'V' : 'D',
    data: p.data,
    parceiro: parceiroNa(p, nome),
    adversarios: adversariosNa(p, nome),
    id: p.id,
  }));
};

// Sinergia: para cada parceiro com quem o jogador já jogou em DUPLA, V/D/total/pctWin
export const sinergia = (nome, partidas) => {
  const map = new Map();
  for (const p of partidas) {
    if (!participou(p, nome)) continue;
    const parc = parceiroNa(p, nome);
    if (!parc) continue;
    if (!map.has(parc)) map.set(parc, { parceiro: parc, v: 0, d: 0, total: 0 });
    const m = map.get(parc);
    m.total++;
    if (venceu(p, nome)) m.v++; else m.d++;
  }
  for (const m of map.values()) m.pctWin = m.total ? m.v / m.total : 0;
  return map;
};

// Duelo: confrontos contra cada outro jogador (como adversário direto)
// saldoPontos = (vitórias contra * 2) - (derrotas contra * 1) — pontos ganhos no confronto direto
export const duelo = (nome, partidas) => {
  const map = new Map();
  for (const p of partidas) {
    if (!participou(p, nome)) continue;
    const advs = adversariosNa(p, nome);
    const win = venceu(p, nome);
    for (const adv of advs) {
      if (!map.has(adv)) map.set(adv, { adversario: adv, v: 0, d: 0, total: 0, saldoPontos: 0 });
      const m = map.get(adv);
      m.total++;
      if (win) { m.v++; m.saldoPontos += 2; }
      else { m.d++; m.saldoPontos -= 1; }
    }
  }
  for (const m of map.values()) m.pctWin = m.total ? m.v / m.total : 0;
  return map;
};

// Evolução cronológica: array {data, saldo} acumulando partidas + edicoes do jogador
export const evolucao = (nome, partidas, edicoes) => {
  const eventos = [
    ...partidas.filter(p => participou(p, nome)).map(p => ({
      data: p.data, delta: deltaPartida(p, nome), tipo: 'partida', id: p.id,
    })),
    ...edicoes.filter(e => e.jogador === nome).map(e => ({
      data: e.data, delta: (e.para - e.de), tipo: 'edicao', id: e.id,
    })),
  ].sort((a, b) => parseISO(a.data) - parseISO(b.data) || a.id - b.id);

  let acc = 0;
  return eventos.map(ev => {
    acc += ev.delta;
    return { data: ev.data, saldo: acc, delta: ev.delta, tipo: ev.tipo };
  });
};

// Head-to-head completo entre dois jogadores
export const headToHead = (a, b, partidas) => {
  const result = {
    juntos: { v: 0, d: 0, total: 0 },
    contra: { v: 0, d: 0, total: 0, saldoPontos: 0 }, // do ponto de vista de A
  };
  for (const p of partidas) {
    if (!participou(p, a) || !participou(p, b)) continue;
    const mesmoLado = (p.vencedores?.includes(a) && p.vencedores?.includes(b)) ||
                       (p.perdedores?.includes(a) && p.perdedores?.includes(b));
    if (mesmoLado) {
      result.juntos.total++;
      if (venceu(p, a)) result.juntos.v++; else result.juntos.d++;
    } else {
      result.contra.total++;
      if (venceu(p, a)) { result.contra.v++; result.contra.saldoPontos += 2; }
      else { result.contra.d++; result.contra.saldoPontos -= 1; }
    }
  }
  return result;
};

// Tabela completa por outro jogador (combina sinergia + duelo)
export const tabelaJogador = (nome, partidas, jogadores) => {
  const sin = sinergia(nome, partidas);
  const due = duelo(nome, partidas);
  return jogadores
    .filter(j => j.nome !== nome)
    .map(j => {
      const s = sin.get(j.nome) || { v: 0, d: 0, total: 0 };
      const a = due.get(j.nome) || { v: 0, d: 0, total: 0, saldoPontos: 0 };
      return {
        nome: j.nome,
        comoParceiro: { v: s.v, d: s.d, total: s.total },
        comoAdversario: { v: a.v, d: a.d, total: a.total },
        saldoDireto: a.saldoPontos,
        partidasTotais: s.total + a.total,
      };
    })
    .sort((x, y) => y.partidasTotais - x.partidasTotais);
};

// Insights individuais
export const insightsJogador = (nome, partidas, jogadores) => {
  const sin = [...sinergia(nome, partidas).values()].filter(m => m.total >= 2);
  const due = [...duelo(nome, partidas).values()].filter(m => m.total >= 2);

  const melhorParceiro = sin.length
    ? sin.reduce((best, m) => (m.pctWin > best.pctWin || (m.pctWin === best.pctWin && m.v > best.v)) ? m : best)
    : null;
  const piorParceiro = sin.length
    ? sin.reduce((worst, m) => (m.pctWin < worst.pctWin || (m.pctWin === worst.pctWin && m.d > worst.d)) ? m : worst)
    : null;
  const nemesis = due.length
    ? due.reduce((worst, m) => (m.saldoPontos < worst.saldoPontos) ? m : worst)
    : null;
  const fregues = due.length
    ? due.reduce((best, m) => (m.saldoPontos > best.saldoPontos) ? m : best)
    : null;

  const allSin = [...sinergia(nome, partidas).values()];
  const maisJogou = allSin.length
    ? allSin.reduce((m, c) => c.total > m.total ? c : m)
    : null;

  return { melhorParceiro, piorParceiro, nemesis, fregues, maisJogou };
};

// MVP do mês: maior delta de pontos no mês dado
export const mvpDoMes = (ano, mes, partidas, edicoes, jogadores) => {
  const noMes = (item) => {
    const d = parseISO(item.data);
    return d && d.getFullYear() === ano && d.getMonth() + 1 === mes;
  };
  const ps = partidas.filter(noMes);
  const es = edicoes.filter(noMes);
  const placar = jogadores.map(j => ({
    nome: j.nome,
    pontos: calcPontos(j.nome, ps, es),
    partidas: ps.filter(p => participou(p, j.nome)).length,
  })).filter(x => x.partidas > 0).sort((a, b) => b.pontos - a.pontos);
  return placar[0] || null;
};

// Dupla mais vitoriosa (mínimo de partidas pra contar)
export const duplasRanking = (partidas, minPartidas = 2) => {
  const map = new Map();
  for (const p of partidas) {
    const dupV = [p.vencedores?.[0], p.vencedores?.[1]].filter(Boolean).sort();
    const dupD = [p.perdedores?.[0], p.perdedores?.[1]].filter(Boolean).sort();
    for (const [dupla, win] of [[dupV, true], [dupD, false]]) {
      if (dupla.length !== 2) continue;
      const key = dupla.join('|');
      if (!map.has(key)) map.set(key, { dupla, v: 0, d: 0, total: 0 });
      const m = map.get(key);
      m.total++;
      if (win) m.v++; else m.d++;
    }
  }
  return [...map.values()]
    .filter(m => m.total >= minPartidas)
    .map(m => ({ ...m, pctWin: m.v / m.total }))
    .sort((a, b) => b.pctWin - a.pctWin || b.v - a.v);
};

// Matriz de heatmap de sinergia (NxN): % vitória quando dois jogadores foram parceiros
export const matrizSinergia = (jogadores, partidas) => {
  const nomes = jogadores.map(j => j.nome);
  const n = nomes.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(null));
  for (let i = 0; i < n; i++) {
    const sin = sinergia(nomes[i], partidas);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const m = sin.get(nomes[j]);
      matrix[i][j] = m ? { v: m.v, d: m.d, total: m.total, pctWin: m.pctWin } : null;
    }
  }
  return { nomes, matrix };
};

// Distribuição de partidas por dia da semana
export const distribuicaoDiaSemana = (partidas) => {
  const dist = [0, 0, 0, 0, 0, 0, 0]; // dom..sáb
  for (const p of partidas) {
    const d = parseISO(p.data);
    if (d) dist[d.getDay()]++;
  }
  return dist;
};

// === Destaques de curto prazo (placar V2.1) ===

// MVP da janela: jogador que somou mais pontos no período. null se ninguém jogou.
export const mvpDaJanela = (jogadores, partidas, edicoes, dias) => {
  const ps = filtrarPorJanela(partidas, dias);
  const es = filtrarPorJanela(edicoes, dias);
  const placar = jogadores
    .filter(j => j.ativo !== false)
    .map(j => ({
      nome: j.nome,
      pontos: calcPontos(j.nome, ps, es),
      partidas: ps.filter(p => participou(p, j.nome)).length,
    }))
    .filter(x => x.partidas > 0)
    .sort((a, b) => b.pontos - a.pontos || b.partidas - a.partidas);
  return placar[0] || null;
};

// Mais ativo da janela: jogador com mais partidas no período. null se ninguém.
export const maisAtivoDaJanela = (jogadores, partidas, dias) => {
  const ps = filtrarPorJanela(partidas, dias);
  const ranking = jogadores
    .filter(j => j.ativo !== false)
    .map(j => ({ nome: j.nome, total: ps.filter(p => participou(p, j.nome)).length }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total);
  return ranking[0] || null;
};

// Maior streak ativo (V ou D) entre todos os jogadores. Mínimo 2 pra contar.
// Retorna { nome, valor, tipo } ou null.
export const streakMaiorAtivo = (jogadores, partidas, min = 2) => {
  let melhor = null;
  for (const j of jogadores.filter(j => j.ativo !== false)) {
    const s = streak(j.nome, partidas);
    if (s.atual >= min) {
      // Prioriza vitórias se empate; usa ordem alfabética como desempate final
      const score = s.atual + (s.tipo === 'V' ? 0.5 : 0);
      const score0 = melhor ? melhor.atual + (melhor.tipo === 'V' ? 0.5 : 0) : -1;
      if (score > score0 || (score === score0 && j.nome.localeCompare(melhor.nome) < 0)) {
        melhor = { nome: j.nome, atual: s.atual, tipo: s.tipo };
      }
    }
  }
  return melhor;
};

// Última partida registrada (a mais recente por data + id).
export const ultimaPartida = (partidas) => {
  if (!partidas.length) return null;
  return [...partidas].sort((a, b) =>
    (parseISO(b.data) - parseISO(a.data)) || (b.id - a.id)
  )[0];
};

// Curiosidades "sabia que..."
export const curiosidades = (jogadores, partidas) => {
  const facts = [];
  const nomes = jogadores.filter(j => j.ativo !== false).map(j => j.nome);

  // Pares que nunca jogaram juntos
  const paresPossiveis = [];
  for (let i = 0; i < nomes.length; i++)
    for (let j = i + 1; j < nomes.length; j++)
      paresPossiveis.push([nomes[i], nomes[j]]);

  const paresJogados = new Set();
  for (const p of partidas) {
    if (p.vencedores?.length === 2) paresJogados.add([...p.vencedores].sort().join('|'));
    if (p.perdedores?.length === 2) paresJogados.add([...p.perdedores].sort().join('|'));
  }
  const naoJogaram = paresPossiveis.filter(([a, b]) => !paresJogados.has([a, b].sort().join('|')));
  if (naoJogaram.length && naoJogaram.length <= 5) {
    naoJogaram.slice(0, 3).forEach(([a, b]) =>
      facts.push(`**${a}** e **${b}** nunca jogaram juntos como dupla.`)
    );
  } else if (naoJogaram.length) {
    facts.push(`Existem ${naoJogaram.length} pares que ainda não jogaram juntos.`);
  }

  // Maior streak histórico
  let topStreak = { nome: null, valor: 0, tipo: null };
  for (const n of nomes) {
    const s = streak(n, partidas);
    if (s.maior > topStreak.valor) topStreak = { nome: n, valor: s.maior, tipo: s.maiorTipo };
  }
  if (topStreak.valor >= 3) {
    const txt = topStreak.tipo === 'V' ? 'vitórias seguidas' : 'derrotas seguidas';
    facts.push(`Maior sequência registrada: **${topStreak.nome}** com **${topStreak.valor} ${txt}**.`);
  }

  // Jogador mais frequente
  const freq = nomes.map(n => ({ nome: n, total: partidas.filter(p => participou(p, n)).length }))
    .sort((a, b) => b.total - a.total);
  if (freq[0]?.total > 0) {
    facts.push(`Jogador mais presente: **${freq[0].nome}** com **${freq[0].total} partidas**.`);
  }

  // Dia da semana mais comum
  const dist = distribuicaoDiaSemana(partidas);
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const diaTop = dist.indexOf(Math.max(...dist));
  if (dist[diaTop] > 0) {
    facts.push(`Vocês jogam mais na **${dias[diaTop]}** (${dist[diaTop]} partidas).`);
  }

  return facts;
};

// Cor consistente por nome (HSL determinístico)
export const corDoNome = (nome) => {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 55%, 55%)`;
};

export const iniciais = (nome) => {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
};

// Migração: limpa partidas vazias, converte datas pra ISO, separa edições, adiciona schemaVersion
export const migrar = (rawJogadores, rawHistorico) => {
  const partidas = [];
  const edicoes = [];

  for (const h of (rawHistorico || [])) {
    const dataISO = h.data?.includes('/')
      ? (() => { const [d, m, y] = h.data.split('/'); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; })()
      : h.data;

    if (h.tipo === 'edicao') {
      edicoes.push({
        id: h.id,
        data: dataISO,
        jogador: h.jogador,
        de: h.pontosAntigos ?? 0,
        para: h.pontosNovos ?? 0,
        motivo: h.motivo || '',
      });
    } else {
      // partida
      if (!h.vencedores?.length || !h.perdedores?.length) continue; // descarta vazias
      if (h.vencedores.length !== 2 || h.perdedores.length !== 2) continue;
      partidas.push({
        id: h.id,
        data: dataISO,
        vencedores: [...h.vencedores],
        perdedores: [...h.perdedores],
      });
    }
  }

  const jogadores = (rawJogadores || []).map(j => ({
    nome: j.nome,
    ativo: j.ativo !== false,
    criadoEm: j.criadoEm || null,
  }));

  return { schemaVersion: 2, jogadores, partidas, edicoes };
};

// Validações para registrar nova partida
export const validarPartida = (p) => {
  if (!p.vencedores || p.vencedores.length !== 2) return 'Selecione exatamente 2 vencedores.';
  if (!p.perdedores || p.perdedores.length !== 2) return 'Selecione exatamente 2 perdedores.';
  const todos = [...p.vencedores, ...p.perdedores];
  if (new Set(todos).size !== 4) return 'Jogadores duplicados entre as duplas.';
  if (!p.data) return 'Data obrigatória.';
  return null;
};
