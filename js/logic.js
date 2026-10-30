// Lógica de torneo: fixture, posiciones, fases finales, podio y programación.

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const MODES = { singles: 'Singles', doubles: 'Dobles', allaround: 'All Around' };
export const groupName = i => 'Grupo ' + String.fromCharCode(65 + i);
export const isAA = L => L.mode === 'allaround';
export const entryNoun = (L, plural) => L.mode === 'doubles' ? (plural ? 'parejas' : 'pareja') : (plural ? 'jugadores' : 'jugador');

let PLAYERS = new Map();
export function bindPlayers(list) { PLAYERS = new Map(list.map(p => [p.id, p])); }
export const playerName = id => PLAYERS.get(id)?.name || '¿?';

export function newLevel() {
  return {
    id: uid(), name: '', mode: 'doubles', numEntries: 8, numGroups: 2,
    formats: { group: { bestOf: 1, points: 11 }, semi: { bestOf: 1, points: 15 }, final: { bestOf: 3, points: 11 } },
    entries: [], matches: [], generated: false,
  };
}

export function newTournament(name, date) {
  return {
    id: uid(), name, date, status: 'active', createdAt: new Date().toISOString(), finishedAt: null,
    levels: [],
    schedule: { courts: ['Cancha 1', 'Cancha 2'], start: '09:00', hours: 8, minutes: { group: 20, semi: 30, final: 35 } },
  };
}

/* ---------- Partidos y resultados ---------- */

export const fmtKey = m => m.phase === 'group' ? 'group' : m.phase === 'semi' ? 'semi' : 'final';
export const fmtFor = (L, m) => L.formats[fmtKey(m)];

export function gameScores(m) {
  return (m.games || []).filter(g => g && g.a !== '' && g.b !== '' && g.a != null && g.b != null).map(g => [+g.a, +g.b]);
}

export function matchResult(L, m) {
  const need = +fmtFor(L, m).bestOf === 3 ? 2 : 1;
  let wa = 0, wb = 0, pa = 0, pb = 0;
  for (const [a, b] of gameScores(m)) {
    pa += a; pb += b;
    if (a > b) wa++; else if (b > a) wb++;
  }
  const winner = m.a && m.b ? (wa >= need ? 'a' : wb >= need ? 'b' : null) : null;
  return { wa, wb, pa, pb, winner, done: !!winner };
}

export const entryById = (L, id) => L.entries.find(e => e.id === id);
export function entryName(L, e) {
  if (!e) return '¿?';
  return e.name?.trim() || e.players.map(playerName).join(' / ') || 'Sin nombre';
}

export function sidePlayers(L, side) {
  if (!side) return [];
  if (side.players) return side.players;
  return entryById(L, side.entryId)?.players || [];
}
export function sideLabel(L, side, placeholder = 'Por definir') {
  if (!side) return placeholder;
  if (side.players) return side.players.map(playerName).join(' / ');
  return entryName(L, entryById(L, side.entryId));
}

const mkMatch = (phase, a, b, extra = {}) => ({ id: uid(), phase, a, b, games: [], court: null, time: null, ...extra });

/* ---------- Generación de fixture ---------- */

export function roundRobin(ids) {
  const arr = [...ids];
  if (arr.length % 2) arr.push(null);
  const n = arr.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a != null && b != null) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop());
  }
  return rounds;
}

// All Around: cada jugador hace pareja con todos los demás una vez.
// Se arman fechas completas (máximo de partidos simultáneos) con búsqueda aleatoria con reinicios.
export function allAroundRounds(pids) {
  const n = pids.length;
  if (n < 4) return [];
  const key = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  const totalPairs = n * (n - 1) / 2, perRound = Math.floor(n / 4);
  const target = Math.floor(totalPairs / 2);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let best = null;
  const t0 = Date.now();
  for (let attempt = 0; attempt < 400 && Date.now() - t0 < 1500; attempt++) {
    const used = new Set(), played = new Map(pids.map(p => [p, 0])), rounds = [];
    let count = 0;
    while (true) {
      // jugadores que menos han jugado primero (descansos parejos)
      const order = shuffle([...pids]).sort((a, b) => played.get(a) - played.get(b));
      let bestRound = [], steps = 0;
      const round = [], busy = new Set();
      const dfs = () => {
        if (round.length > bestRound.length) bestRound = [...round];
        if (bestRound.length === perRound || ++steps > 4000) return;
        const free = order.filter(p => !busy.has(p));
        if (free.length < 4) return;
        const p = free[0];
        for (const q of free.slice(1)) {
          if (used.has(key(p, q))) continue;
          const rest = free.filter(x => x !== p && x !== q);
          for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
            const r = rest[i], s = rest[j];
            if (used.has(key(r, s))) continue;
            round.push([[p, q], [r, s]]); [p, q, r, s].forEach(x => busy.add(x)); used.add(key(p, q)); used.add(key(r, s));
            dfs();
            round.pop(); [p, q, r, s].forEach(x => busy.delete(x)); used.delete(key(p, q)); used.delete(key(r, s));
            if (bestRound.length === perRound || steps > 4000) return;
          }
        }
        // probar dejando descansar a p
        busy.add(p); dfs(); busy.delete(p);
      };
      dfs();
      if (!bestRound.length) break;
      bestRound.forEach(([a, b]) => { used.add(key(...a)); used.add(key(...b)); [...a, ...b].forEach(x => played.set(x, played.get(x) + 1)); });
      rounds.push(bestRound); count += bestRound.length;
      if (count >= target) break;
    }
    if (!best || count > best.count || (count === best.count && rounds.length < best.rounds.length)) best = { count, rounds };
    if (count >= target && rounds.length === Math.ceil(target / perRound)) break;
  }
  return best.rounds;
}

export function assignRandomGroups(L) {
  const G = Math.max(1, +L.numGroups || 1);
  const shuffled = [...L.entries].sort(() => Math.random() - 0.5);
  shuffled.forEach((e, i) => { e.group = i % G; });
}

export function generateLevel(L) {
  const G = Math.max(1, +L.numGroups || 1);
  const valid = L.entries.filter(e => e.players.length);
  if (valid.length < 2) throw new Error('Se necesitan al menos 2 inscritos con jugadores.');
  if (L.mode === 'doubles' && valid.some(e => e.players.length < 2)) throw new Error('Hay parejas incompletas (faltan jugadores).');
  if (valid.length !== L.entries.length) throw new Error('Hay inscritos sin jugador asignado.');
  if (G === 1) L.entries.forEach(e => { e.group = 0; });
  if (L.entries.some(e => e.group == null || e.group >= G)) throw new Error('Hay inscritos sin grupo. Asígnalos o usa "Repartir grupos al azar".');
  const ids = L.entries.flatMap(e => e.players);
  if (new Set(ids).size !== ids.length) throw new Error('Un mismo jugador aparece más de una vez en este nivel.');

  const matches = [];
  for (let g = 0; g < G; g++) {
    const es = L.entries.filter(e => e.group === g);
    if (isAA(L)) {
      if (es.length && es.length < 4) throw new Error(`${groupName(g)} necesita al menos 4 jugadores para All Around.`);
      allAroundRounds(es.map(e => e.players[0])).forEach((round, r) =>
        round.forEach(([p, q]) => matches.push(mkMatch('group', { players: p }, { players: q }, { group: g, round: r + 1 }))));
    } else {
      roundRobin(es.map(e => e.id)).forEach((round, r) =>
        round.forEach(([a, b]) => matches.push(mkMatch('group', { entryId: a }, { entryId: b }, { group: g, round: r + 1 }))));
    }
  }
  const n = L.entries.length;
  const withSemis = isAA(L) ? n >= 8 : n >= 4;
  if (withSemis) {
    const [p1, p4, p2, p3] = isAA(L)
      ? ['Pareja 1° + 8°', 'Pareja 4° + 5°', 'Pareja 2° + 7°', 'Pareja 3° + 6°']
      : ['Clasificado 1', 'Clasificado 4', 'Clasificado 2', 'Clasificado 3'];
    matches.push(mkMatch('semi', null, null, { slot: 'SF1', phA: p1, phB: p4 }));
    matches.push(mkMatch('semi', null, null, { slot: 'SF2', phA: p2, phB: p3 }));
    matches.push(mkMatch('third', null, null, { phA: 'Perdedor SF1', phB: 'Perdedor SF2' }));
    matches.push(mkMatch('final', null, null, { phA: 'Ganador SF1', phB: 'Ganador SF2' }));
  } else if (!isAA(L) && n >= 3) {
    matches.push(mkMatch('final', null, null, { phA: 'Clasificado 1', phB: 'Clasificado 2' }));
  }
  L.matches = matches;
  L.generated = true;
}

/* ---------- Posiciones ---------- */

const rowKeyName = (L, key) => isAA(L) ? playerName(key) : entryName(L, entryById(L, key));
export const groupCount = L => Math.max(1, +L.numGroups || 1);

function cmpRows(x, y) {
  const px = x.pj ? x.pg / x.pj : 0, py = y.pj ? y.pg / y.pj : 0;
  return (y.pg - x.pg) || (py - px) || (y.dif - x.dif) || (y.pf - x.pf) || x.name.localeCompare(y.name);
}

export function standings(L, g) {
  const rows = new Map();
  for (const e of L.entries.filter(e => e.group === g)) {
    const key = isAA(L) ? e.players[0] : e.id;
    if (key) rows.set(key, { key, name: rowKeyName(L, key), pj: 0, pg: 0, pp: 0, gf: 0, gc: 0, pf: 0, pc: 0, dif: 0 });
  }
  for (const m of L.matches) {
    if (m.phase !== 'group' || m.group !== g) continue;
    const r = matchResult(L, m);
    if (!r.done) continue;
    const keys = s => isAA(L) ? s.players : [s.entryId];
    const apply = (ks, win, gf, gc, pf, pc) => ks.forEach(k => {
      const row = rows.get(k); if (!row) return;
      row.pj++; win ? row.pg++ : row.pp++; row.gf += gf; row.gc += gc; row.pf += pf; row.pc += pc; row.dif = row.pf - row.pc;
    });
    apply(keys(m.a), r.winner === 'a', r.wa, r.wb, r.pa, r.pb);
    apply(keys(m.b), r.winner === 'b', r.wb, r.wa, r.pb, r.pa);
  }
  return [...rows.values()].sort(cmpRows).map((r, i) => ({ ...r, pos: i + 1 }));
}

export function qualifiers(L, K) {
  const G = groupCount(L), per = Math.floor(K / G);
  const picked = [], rest = [];
  for (let g = 0; g < G; g++) standings(L, g).forEach((row, i) => (i < per ? picked : rest).push({ ...row, rank: i, group: g }));
  const cmp = (x, y) => (x.rank - y.rank) || cmpRows(x, y);
  rest.sort(cmp);
  picked.push(...rest.slice(0, Math.max(0, K - picked.length)));
  return picked.sort(cmp).slice(0, K);
}

const groupStageDone = L => {
  const gm = L.matches.filter(m => m.phase === 'group');
  return gm.length > 0 && gm.every(m => matchResult(L, m).done);
};
const untouched = m => !gameScores(m).length;
const clone = s => s && JSON.parse(JSON.stringify(s));

// Arma las fases siguientes cuando la anterior está completa.
export function advance(L) {
  if (!L.generated) return;
  const sf = L.matches.filter(m => m.phase === 'semi');
  const fin = L.matches.find(m => m.phase === 'final');
  const th = L.matches.find(m => m.phase === 'third');
  const gDone = groupStageDone(L);
  if (sf.length) {
    if (sf.every(untouched)) {
      if (gDone) fillSemis(L, sf); else sf.forEach(m => { m.a = m.b = null; });
    }
    const sfDone = sf.every(m => matchResult(L, m).done);
    const res = sf.map(m => matchResult(L, m));
    if (fin && untouched(fin)) {
      if (sfDone) { fin.a = clone(sf[0][res[0].winner]); fin.b = clone(sf[1][res[1].winner]); } else fin.a = fin.b = null;
    }
    if (th && untouched(th)) {
      const lose = r => r.winner === 'a' ? 'b' : 'a';
      if (sfDone) { th.a = clone(sf[0][lose(res[0])]); th.b = clone(sf[1][lose(res[1])]); } else th.a = th.b = null;
    }
  } else if (fin && untouched(fin)) {
    if (gDone) { const q = qualifiers(L, 2); fin.a = { entryId: q[0].key }; fin.b = { entryId: q[1].key }; } else fin.a = fin.b = null;
  }
}

function fillSemis(L, sf) {
  if (isAA(L)) {
    const q = qualifiers(L, 8).map(r => r.key);
    if (q.length < 8) return;
    const P = [[q[0], q[7]], [q[1], q[6]], [q[2], q[5]], [q[3], q[4]]];
    sf[0].a = { players: P[0] }; sf[0].b = { players: P[3] };
    sf[1].a = { players: P[1] }; sf[1].b = { players: P[2] };
  } else {
    const s = qualifiers(L, 4);
    if (s.length < 4) return;
    let pairs = [[s[0], s[3]], [s[1], s[2]]];
    if (groupCount(L) > 1 && s[0].group === s[3].group && s[0].group !== s[2].group) pairs = [[s[0], s[2]], [s[1], s[3]]];
    sf[0].a = { entryId: pairs[0][0].key }; sf[0].b = { entryId: pairs[0][1].key };
    sf[1].a = { entryId: pairs[1][0].key }; sf[1].b = { entryId: pairs[1][1].key };
  }
}

// Podio: lista de { place, side } o null si aún no está definido.
export function podium(L) {
  if (!L.generated) return null;
  const fin = L.matches.find(m => m.phase === 'final');
  const th = L.matches.find(m => m.phase === 'third');
  const other = w => w === 'a' ? 'b' : 'a';
  const asSide = r => isAA(L) ? { players: [r.key] } : { entryId: r.key };
  if (fin) {
    const r = matchResult(L, fin);
    if (!r.done) return null;
    const out = [{ place: 1, side: fin[r.winner] }, { place: 2, side: fin[other(r.winner)] }];
    if (th) {
      const t = matchResult(L, th);
      if (!t.done) return null;
      out.push({ place: 3, side: th[t.winner] }, { place: 4, side: th[other(t.winner)] });
    } else {
      const q = qualifiers(L, 3);
      if (q[2]) out.push({ place: 3, side: asSide(q[2]) });
    }
    return out;
  }
  if (!groupStageDone(L)) return null;
  return qualifiers(L, Math.min(4, L.entries.length)).map((r, i) => ({ place: i + 1, side: asSide(r) }));
}

export const levelComplete = L => L.generated && L.matches.every(m => matchResult(L, m).done) && !!podium(L);
export const tournamentComplete = T => T.levels.length > 0 && T.levels.every(levelComplete);

/* ---------- Programación ---------- */

export const toMin = hhmm => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const PHASE_ORDER = { group: 0, semi: 1, third: 2, final: 3 };

export function buildSchedule(T) {
  const cfg = T.schedule;
  const courts = cfg.courts.filter(Boolean);
  if (!courts.length) throw new Error('Ingresa al menos una cancha.');
  const start = toMin(cfg.start), end = start + (+cfg.hours || 0) * 60;
  const dur = { group: +cfg.minutes.group || 20, semi: +cfg.minutes.semi || 30, third: +cfg.minutes.final || 30, final: +cfg.minutes.final || 30 };

  const items = [];
  T.levels.forEach((L, li) => L.matches.forEach((m, mi) => items.push({ L, m, li, mi })));
  items.sort((x, y) => (PHASE_ORDER[x.m.phase] - PHASE_ORDER[y.m.phase]) || ((x.m.round || 0) - (y.m.round || 0)) || (x.li - y.li) || ((x.m.group || 0) - (y.m.group || 0)) || (x.mi - y.mi));

  const courtFree = courts.map(() => start);
  const playerFree = new Map();
  const pending = new Map(T.levels.map(L => [L.id, { group: 0, semi: 0, gEnd: start, sEnd: start }]));
  items.forEach(it => { const p = pending.get(it.L.id); if (it.m.phase === 'group') p.group++; if (it.m.phase === 'semi') p.semi++; });

  const remaining = new Set(items);
  let overflow = 0;
  while (remaining.size) {
    let best = null;
    const minCourt = Math.min(...courtFree);
    for (const it of items) {
      if (!remaining.has(it)) continue;
      const p = pending.get(it.L.id);
      let dep = start;
      if (it.m.phase === 'semi') { if (p.group) continue; dep = p.gEnd; }
      if (it.m.phase === 'final' || it.m.phase === 'third') { if (p.group || p.semi) continue; dep = Math.max(p.gEnd, p.sEnd); }
      const ps = [...sidePlayers(it.L, it.m.a), ...sidePlayers(it.L, it.m.b)];
      const est = Math.max(dep, minCourt, ...ps.map(x => playerFree.get(x) ?? start));
      if (!best || est < best.t) best = { it, t: est };
      if (best.t === minCourt) break;
    }
    const { it, t } = best;
    // la cancha libre más tarde que aún permite empezar a la hora t
    let ci = -1;
    courtFree.forEach((f, i) => { if (f <= t && (ci < 0 || f > courtFree[ci])) ci = i; });
    const d = dur[it.m.phase];
    it.m.time = t; it.m.court = courts[ci];
    courtFree[ci] = t + d;
    [...sidePlayers(it.L, it.m.a), ...sidePlayers(it.L, it.m.b)].forEach(x => playerFree.set(x, t + d));
    const p = pending.get(it.L.id);
    if (it.m.phase === 'group') { p.group--; p.gEnd = Math.max(p.gEnd, t + d); }
    if (it.m.phase === 'semi') { p.semi--; p.sEnd = Math.max(p.sEnd, t + d); }
    if (t + d > end) overflow++;
    remaining.delete(it);
  }
  const last = Math.max(start, ...courtFree);
  cfg.generatedAt = new Date().toISOString();
  return { matches: items.length, endTime: last, overflow, limit: end };
}

export const durationOf = (T, m) => +(m.phase === 'group' ? T.schedule.minutes.group : m.phase === 'semi' ? T.schedule.minutes.semi : T.schedule.minutes.final) || 0;
