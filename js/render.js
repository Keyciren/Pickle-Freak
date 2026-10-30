// Componentes de solo lectura compartidos por las vistas de admin, jugador e histórico.
import {
  MODES, groupName, groupCount, standings, matchResult, sideLabel, sidePlayers, podium, fmtFor,
  isAA, gameScores, durationOf, entryNoun,
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
  if (m.phase === 'final') return 'Final';
  return '3er y 4to lugar';
}
export const formatText = f => `${+f.bestOf === 3 ? 'Mejor de 3' : '1 juego'} a ${f.points} pts`;
export const scoreText = m => gameScores(m).map(([a, b]) => `${a}-${b}`).join(', ');

export const matchHas = (L, m, pids) => !!pids?.size && [...sidePlayers(L, m.a), ...sidePlayers(L, m.b)].some(p => pids.has(p));

export function levelSummary(L) {
  return `${MODES[L.mode]} · ${L.entries.length}/${L.numEntries} ${entryNoun(L, true)} · ${groupCount(L)} ${groupCount(L) > 1 ? 'grupos' : 'grupo'}`;
}

export function standingsTable(L, g, pids) {
  const rows = standings(L, g);
  const hasFinals = L.matches.some(m => m.phase !== 'group');
  const qualCount = hasFinals ? Math.ceil((isAA(L) ? 8 : L.matches.some(m => m.phase === 'semi') ? 4 : 2) / groupCount(L)) : 0;
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
    const ms = L.matches.filter(m => m.phase === 'group' && m.group === g);
    const rounds = [...new Set(ms.map(m => m.round))].sort((a, b) => a - b);
    out.push(`<div class="card"><div class="row"><h3>${groupName(g)}</h3><span class="spacer"></span>
      <span class="badge">${formatText(L.formats.group)}</span></div>
      ${standingsTable(L, g, pids)}
      ${rounds.map(rd => `<div class="round-title">Fecha ${rd}</div><div class="matches">
        ${ms.filter(m => m.round === rd).map(m => matchCard(L, m, { editable, pids })).join('')}</div>`).join('')}
    </div>`);
  }
  return out.join('');
}

export function finalsBlock(L, { editable = false, pids = null } = {}) {
  const sf = L.matches.filter(m => m.phase === 'semi');
  const fin = L.matches.filter(m => m.phase === 'third' || m.phase === 'final');
  if (!sf.length && !fin.length) return '';
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

export function scheduleTable(T, pids = null) {
  const rows = scheduleRows(T);
  if (!rows.length) return `<div class="empty">Aún no hay partidos generados.</div>`;
  const limit = (parseInt(T.schedule.start) * 60 + (+T.schedule.start.split(':')[1] || 0)) + (+T.schedule.hours || 0) * 60;
  return `<div class="table-wrap"><table>
    <thead><tr><th>Hora</th><th>Cancha</th><th>Nivel</th><th>Fase</th><th>Lado A</th><th>Lado B</th><th>Resultado</th></tr></thead>
    <tbody>${rows.map(({ L, m }) => {
      const r = matchResult(L, m);
      const over = m.time != null && m.time + durationOf(T, m) > limit;
      const a = m.a ? sideLabel(L, m.a) : m.phA || 'Por definir', b = m.b ? sideLabel(L, m.b) : m.phB || 'Por definir';
      return `<tr class="${matchHas(L, m, pids) ? 'hl' : ''} ${over ? 'over' : ''}">
        <td><b>${fmtTime(m.time)}</b></td><td>${esc(m.court || '—')}</td><td>${esc(L.name)}</td><td>${esc(phaseLabel(m))}</td>
        <td class="name" style="${r.winner === 'a' ? 'color:var(--accent)' : ''}">${esc(a)}</td>
        <td class="name" style="${r.winner === 'b' ? 'color:var(--accent)' : ''}">${esc(b)}</td>
        <td>${esc(scoreText(m)) || '<span class="muted">—</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

// Vista completa de un torneo (jugador e histórico)
export function tournamentDetail(T, { pids = null, levelId = null, tab = 'pos' } = {}) {
  const levels = levelId ? T.levels.filter(L => L.id === levelId) : T.levels;
  if (tab === 'prog') return `<div class="card">${scheduleTable(T, pids)}</div>`;
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
