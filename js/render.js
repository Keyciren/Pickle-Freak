// Componentes de solo lectura compartidos por las vistas de admin, jugador e histórico.
import {
  MODES, groupName, groupCount, standings, matchResult, sideLabel, sidePlayers, podium, fmtFor,
  isAA, gameScores, durationOf, entryNoun, aaPlacement, toMin,
} from './logic.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtTime = min => min == null ? '—' : `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
}

export function phaseLabel(m) {
  if (m.phase === 'group') return `${groupName(m.group)} · Fecha ${m.round}`;
  if (m.phase === 'semi') return m.slot === 'SF2' ? 'Semifinal 2' : 'Semifinal 1';
  if (m.phase === 'place') return `${m.place}° y ${m.place + 1}° lugar`;
  if (m.phase === 'final') return aaPlacement_(m) ? '1° y 2° lugar' : 'Final';
  return m.place != null ? '3° y 4° lugar' : '3er y 4to lugar';
}
const aaPlacement_ = m => m.place != null;
export const formatText = f => `${+f.bestOf === 3 ? 'Mejor de 3' : '1 juego'} a ${f.points} pts`;
export const scoreText = m => gameScores(m).map(([a, b]) => `${a}-${b}`).join(', ');

export const matchHas = (L, m, pids) => !!pids?.size && [...sidePlayers(L, m.a), ...sidePlayers(L, m.b)].some(p => pids.has(p));

export function levelSummary(L) {
  return `${MODES[L.mode]} · ${L.entries.length}/${L.numEntries} ${entryNoun(L, true)} · ${groupCount(L)} ${groupCount(L) > 1 ? 'grupos' : 'grupo'}`;
}

export function standingsTable(L, g, pids) {
  const rows = standings(L, g);
  const hasFinals = L.matches.some(m => m.phase !== 'group');
  const qualCount = aaPlacement(L) ? 0 : hasFinals ? Math.ceil((isAA(L) ? 8 : L.matches.some(m => m.phase === 'semi') ? 4 : 2) / groupCount(L)) : 0;
  return `<div class="table-wrap"><table>
    <thead><tr><th class="num">#</th><th>${isAA(L) ? 'Jugador' : L.mode === 'doubles' ? 'Pareja' : 'Jugador'}</th>
      <th class="num">PJ</th><th class="num">PG</th><th class="num">PP</th><th class="num">PF</th><th class="num">PC</th><th class="num">Dif</th></tr></thead>
    <tbody>${rows.map(r => {
      const hl = pids?.size && (isAA(L) ? pids.has(r.key) : (L.entries.find(e => e.id === r.key)?.players || []).some(p => pids.has(p)));
      return `<tr class="${r.pos <= qualCount ? 'q' : ''} ${hl ? 'hl' : ''}">
        <td class="num">${r.pos}</td><td class="name">${esc(r.name)}</td>
        <td class="num">${r.pj}</td><td class="num">${r.pg}</td><td class="num">${r.pp}</td>
        <td class="num">${r.pf}</td><td class="num">${r.pc}</td><td class="num">${r.dif > 0 ? '+' : ''}${r.dif}</td></tr>`;
    }).join('') || `<tr><td colspan="8" class="muted">Sin inscritos</td></tr>`}</tbody></table></div>`;
}

// Tarjeta de partido. editable=true muestra inputs de puntaje.
export function matchCard(L, m, { editable = false, pids = null, showLevel = null } = {}) {
  const f = fmtFor(L, m);
  const nGames = +f.bestOf === 3 ? 3 : 1;
  const r = matchResult(L, m);
  const ready = m.a && m.b;
  const side = s => {
    const sd = m[s];
    const games = [];
    for (let i = 0; i < nGames; i++) {
      const v = m.games?.[i]?.[s] ?? '';
      const o = m.games?.[i]?.[s === 'a' ? 'b' : 'a'] ?? '';
      if (editable) {
        games.push(`<input class="sc" type="number" inputmode="numeric" min="0" max="99" id="g-${m.id}-${i}-${s}"
          data-mid="${m.id}" data-g="${i}" data-s="${s}" value="${esc(v)}" ${ready ? '' : 'disabled'} aria-label="Juego ${i + 1}">`);
      } else {
        const win = v !== '' && o !== '' && +v > +o;
        games.push(`<span class="scv ${win ? 'w' : ''}">${v === '' ? (i === 0 ? '–' : '') : esc(v)}</span>`);
      }
    }
    const label = sd ? sideLabel(L, sd) : (s === 'a' ? m.phA : m.phB) || 'Por definir';
    return `<div class="side ${r.winner === s ? 'win' : ''} ${sd ? '' : 'tbd'}"><span class="nm" title="${esc(label)}">${esc(label)}</span>${games.join('')}</div>`;
  };
  const where = m.time != null ? `${fmtTime(m.time)} · ${esc(m.court || '')}` : '';
  return `<div class="match ${matchHas(L, m, pids) ? 'hl' : ''}">
    <div class="meta"><span>${showLevel ? esc(showLevel) + ' · ' : ''}${esc(phaseLabel(m))}</span><span>${where}</span></div>
    ${side('a')}${side('b')}</div>`;
}

export function groupBlocks(L, { editable = false, pids = null } = {}) {
  const out = [];
  for (let g = 0; g < groupCount(L); g++) {
    const ms = L.matches.filter(m => m.phase === 'group' && m.group === g).sort((a, b) => a.round - b.round);
    out.push(`<div class="card"><div class="row"><h3>${groupName(g)}</h3><span class="spacer"></span>
      <span class="badge">${formatText(L.formats.group)}</span></div>
      ${standingsTable(L, g, pids)}
      <div class="round-title">Partidos</div>
      <div class="matches">${ms.map(m => matchCard(L, m, { editable, pids })).join('')}</div>
    </div>`);
  }
  return out.join('');
}

export function finalsBlock(L, { editable = false, pids = null } = {}) {
  const sf = L.matches.filter(m => m.phase === 'semi');
  const fin = L.matches.filter(m => m.phase === 'third' || m.phase === 'final' || m.phase === 'place')
    .sort((a, b) => (a.place ?? (a.phase === 'final' ? 1 : 3)) - (b.place ?? (b.phase === 'final' ? 1 : 3)));
  if (!sf.length && !fin.length) return '';
  if (aaPlacement(L)) return `<div class="card"><h3>Fase final · partidos por puesto</h3>
    <p class="small muted" style="margin:0 0 4px">Dobles armados por posición: 1°A+2°A vs 1°B+2°B por el 1° y 2° lugar, 3°A+4°A vs 3°B+4°B por el 3° y 4°, y así sucesivamente.</p>
    <div class="round-title">${formatText(L.formats.final)}</div>
    <div class="matches">${fin.map(m => matchCard(L, m, { editable, pids })).join('')}</div></div>`;
  return `<div class="card"><h3>Fase final</h3>
    ${sf.length ? `<div class="round-title">Semifinales · ${formatText(L.formats.semi)}</div>
      <div class="matches">${sf.map(m => matchCard(L, m, { editable, pids })).join('')}</div>` : ''}
    ${fin.length ? `<div class="round-title">Finales · ${formatText(L.formats.final)}</div>
      <div class="matches">${fin.map(m => matchCard(L, m, { editable, pids })).join('')}</div>` : ''}
  </div>`;
}

const MEDAL = ['1°', '2°', '3°', '4°'];
export function podiumHTML(L) {
  const p = podium(L);
  if (!p) return '';
  return `<div class="card"><h3>Podio · ${esc(L.name)}</h3><div class="podium">
    ${p.map(x => `<div class="place p${x.place}"><div class="n">${MEDAL[x.place - 1]}</div><div class="who">${esc(sideLabel(L, x.side))}</div></div>`).join('')}
  </div></div>`;
}

export function scheduleRows(T) {
  const rows = [];
  T.levels.forEach(L => L.matches.forEach(m => rows.push({ L, m })));
  return rows.sort((x, y) => ((x.m.time ?? 1e9) - (y.m.time ?? 1e9)) || String(x.m.court).localeCompare(String(y.m.court), 'es', { numeric: true }));
}

// Programa por cancha: filas = turnos, columnas = canchas.
export function scheduleGrid(T, pids = null) {
  const rows = scheduleRows(T).filter(r => r.m.time != null);
  if (!rows.length) return `<div class="empty">Aún no hay programación generada.</div>`;
  const courts = [...new Set([...(T.schedule.courts || []), ...rows.map(r => r.m.court)])].filter(c => rows.some(r => r.m.court === c));
  const times = [...new Set(rows.map(r => r.m.time))].sort((a, b) => a - b);
  const limit = toMin(T.schedule.start) + (+T.schedule.hours || 0) * 60;
  const cell = r => {
    if (!r) return '<td></td>';
    const { L, m } = r, res = matchResult(L, m), sc = gameScores(m).map(([a, b]) => `${a}–${b}`).join(', ');
    const name = s => esc(m[s] ? sideLabel(L, m[s]) : (s === 'a' ? m.phA : m.phB) || 'Por definir');
    const nm = s => `<span class="${res.winner === s ? 'w' : ''} ${m[s] ? '' : 'tbd'}">${name(s)}</span>`;
    return `<td><div class="slot ${matchHas(L, m, pids) ? 'hl' : ''} ${res.done ? 'done' : ''}">
      <div class="slot-meta"><b>${esc(L.name)}</b> · ${esc(phaseLabel(m))}</div>
      <div class="slot-vs">${nm('a')} <i>vs</i> ${nm('b')}</div>
      ${sc ? `<div class="slot-res">Resultado ${esc(sc)}</div>` : ''}</div></td>`;
  };
  return `<div class="table-wrap sched-wrap"><table class="sched">
    <thead><tr><th>Hora</th>${courts.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${times.map((t, i) => {
      const at = rows.filter(r => r.m.time === t);
      const over = at.some(r => t + durationOf(T, r.m) > limit);
      return `<tr class="${over ? 'over' : ''}"><td class="sched-time"><b>${fmtTime(t)}</b><span>Turno ${i + 1}</span></td>
        ${courts.map(c => cell(at.find(r => r.m.court === c))).join('')}</tr>`;
    }).join('')}</tbody></table></div>`;
}

// Vista completa de un torneo (jugador e histórico)
export function tournamentDetail(T, { pids = null, levelId = null, tab = 'pos' } = {}) {
  const levels = levelId ? T.levels.filter(L => L.id === levelId) : T.levels;
  if (tab === 'prog') return `<div class="card"><div class="row" style="margin-bottom:14px"><h3 class="eyebrow" style="margin:0">Programa por cancha</h3><span class="spacer"></span><span class="small muted">${scheduleRows(T).filter(r => r.m.time != null).length} partidos</span></div>${scheduleGrid(T, pids)}</div>`;
  return levels.map(L => {
    if (!L.generated) return `<div class="card"><h2>${esc(L.name)}</h2><p class="muted">El fixture de este nivel aún no está generado.</p></div>`;
    const head = `<div class="page-head" style="margin:26px 0 12px"><div><h2>${esc(L.name)}</h2><p>${esc(levelSummary(L))}</p></div></div>`;
    if (tab === 'pos') {
      return head + podiumHTML(L) + Array.from({ length: groupCount(L) }, (_, g) =>
        `<div class="card"><h3>${groupName(g)}</h3>${standingsTable(L, g, pids)}</div>`).join('');
    }
    return head + podiumHTML(L) + groupBlocks(L, { pids }) + finalsBlock(L, { pids });
  }).join('');
}
