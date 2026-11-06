// Exportación a Excel (SheetJS) e imagen PNG (html2canvas).
import { groupName, groupCount, standings, matchResult, sideLabel, podium, MODES, isAA, placeholder } from './logic.js';
import { esc, fmtTime, fmtDate, phaseLabel, scoreText, scheduleRows } from './render.js';

const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
const fileBase = T => `PickleFreak_${slug(T.name)}_${T.date}`;
const label = (L, m, s) => m[s] ? sideLabel(L, m[s]) : placeholder(L, m, s);

export function exportExcel(T) {
  if (!window.XLSX) throw new Error('La librería de Excel aún no carga. Intenta de nuevo.');
  const X = window.XLSX, wb = X.utils.book_new();
  const used = new Set();
  const add = (name, rows, widths) => {
    let n = name.replace(/[\\/?*[\]:]/g, '').slice(0, 31), i = 2;
    while (used.has(n)) n = `${name.slice(0, 28)} ${i++}`;
    used.add(n);
    const ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map(w => ({ wch: w }));
    X.utils.book_append_sheet(wb, ws, n);
  };

  const resumen = [['Torneo', T.name], ['Fecha', fmtDate(T.date)], ['Estado', T.status === 'finished' ? 'Finalizado' : 'En curso'], [],
    ['Nivel', 'Modalidad', 'Lugar', 'Jugador / Pareja']];
  T.levels.forEach(L => (podium(L) || []).forEach(p => resumen.push([L.name, MODES[L.mode], `${p.place}°`, sideLabel(L, p.side)])));
  add('Resumen', resumen, [22, 14, 8, 40]);

  const prog = [['Hora', 'Cancha', 'Nivel', 'Fase', 'Lado A', 'Lado B', 'Resultado', 'Ganador']];
  scheduleRows(T).forEach(({ L, m }) => {
    const r = matchResult(L, m);
    prog.push([fmtTime(m.time), m.court || '', L.name, phaseLabel(m), label(L, m, 'a'), label(L, m, 'b'), scoreText(m), r.winner ? label(L, m, r.winner) : '']);
  });
  add('Programación', prog, [8, 12, 18, 20, 32, 32, 18, 32]);

  T.levels.forEach(L => {
    const rows = [['Grupo', 'Pos', isAA(L) ? 'Jugador' : 'Jugador / Pareja', 'PJ', 'PG', 'PP', 'PF', 'PC', 'Dif']];
    for (let g = 0; g < groupCount(L); g++) {
      standings(L, g).forEach(r => rows.push([groupName(g), r.pos, r.name, r.pj, r.pg, r.pp, r.pf, r.pc, r.dif]));
    }
    add(`Pos ${L.name}`, rows, [10, 5, 34, 5, 5, 5, 6, 6, 6]);
  });
  X.writeFile(wb, `${fileBase(T)}.xlsx`);
}

export async function exportImage(T) {
  if (!window.html2canvas) throw new Error('La librería de imagen aún no carga. Intenta de nuevo.');
  const root = document.getElementById('export-root');
  root.innerHTML = `<div class="xcard" id="xcard">
    <div class="xhead"><img src="assets/logo.png" alt=""><div><h1>${esc(T.name)}</h1>
      <div style="color:#9b9b96;font-size:20px">${fmtDate(T.date)} · Resultados oficiales</div></div></div>
    ${T.levels.filter(L => L.generated).map(L => {
      const p = podium(L) || [];
      const tables = Array.from({ length: groupCount(L) }, (_, g) => `<div><h3>${groupName(g)}</h3><table>
        <thead><tr><th>#</th><th>${isAA(L) ? 'Jugador' : 'Nombre'}</th><th>PJ</th><th>PG</th><th>Dif</th></tr></thead>
        <tbody>${standings(L, g).map(r => `<tr><td>${r.pos}</td><td>${esc(r.name)}</td><td>${r.pj}</td><td>${r.pg}</td><td>${r.dif > 0 ? '+' : ''}${r.dif}</td></tr>`).join('')}</tbody></table></div>`).join('');
      const results = L.matches.filter(m => matchResult(L, m).done).map(m =>
        `<div><span>${esc(phaseLabel(m).replace(/ · /, ' '))}: ${esc(label(L, m, 'a'))} vs ${esc(label(L, m, 'b'))}</span><b>${esc(scoreText(m))}</b></div>`).join('');
      return `<div class="xlevel"><h2>${esc(L.name)} <span style="color:#9b9b96;font-size:18px;font-weight:500">${MODES[L.mode]}</span></h2>
        ${p.length ? `<div class="podium" style="margin-bottom:18px">${p.map(x => `<div class="place p${x.place}"><div class="n">${x.place}°</div><div class="who">${esc(sideLabel(L, x.side))}</div></div>`).join('')}</div>` : ''}
        <div class="xcols" style="margin-bottom:16px">${tables}</div>
        ${results ? `<h3>Resultados</h3><div class="xres">${results}</div>` : ''}</div>`;
    }).join('')}
    <div class="xfoot">PickleFreak · Generado el ${new Date().toLocaleString('es-CL')}</div></div>`;
  const img = root.querySelector('img');
  if (!img.complete) await new Promise(r => { img.onload = img.onerror = r; });
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = await window.html2canvas(root.firstElementChild, { backgroundColor: '#0b0b0b', scale: 2, useCORS: true });
  root.innerHTML = '';
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `${fileBase(T)}.png`;
  a.click();
}
