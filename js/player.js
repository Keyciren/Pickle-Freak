// Perfil jugador: torneos, posiciones, programación y resultados con búsqueda.
import { reloadRemote } from './store.js';
import { bindPlayers, sidePlayers, MODES } from './logic.js';
import { esc, fmtDate, tournamentDetail, matchCard } from './render.js';
import { $, db, on, toast, norm, pref } from './ui.js';
import { exportScheduleImage } from './export.js';

const TABS = [['pos', 'Posiciones'], ['prog', 'Programación'], ['res', 'Puntajes']];

const tournamentPlayers = T => {
  const ids = new Set(T.levels.flatMap(L => L.entries.flatMap(e => e.players)));
  return db().players.filter(p => ids.has(p.id));
};

// Visor de un torneo (se usa también en el histórico del admin).
export function viewer(el, T, st) {
  const players = tournamentPlayers(T);
  el.innerHTML = `
    <div class="card tight"><div class="row">
      <input id="vq" list="vq-dl" placeholder="🔍 Buscar jugador…" value="${esc(st.q)}" style="flex:1;min-width:200px" autocomplete="off">
      <datalist id="vq-dl">${players.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
    </div></div>
    <div class="chips">${TABS.map(([k, t]) => `<button class="chip ${st.tab === k ? 'active' : ''}" data-tab="${k}">${t}</button>`).join('')}
      ${T.levels.length > 1 && st.tab !== 'prog' ? `<span style="width:1px;background:var(--border);margin:0 4px"></span>
        <button class="chip ${!st.level ? 'active' : ''}" data-vlvl="">Todos los niveles</button>
        ${T.levels.map(L => `<button class="chip ${st.level === L.id ? 'active' : ''}" data-vlvl="${L.id}">${esc(L.name)}</button>`).join('')}` : ''}
      ${st.tab === 'prog' ? '<span class="spacer"></span><button class="btn sm" data-act="simg">Descargar imagen</button>' : ''}
    </div>
    <div id="vbody"></div>`;
  const body = $('#vbody', el);
  const draw = () => {
    const q = norm(st.q);
    const pids = q ? new Set(players.filter(p => norm(p.name).includes(q)).map(p => p.id)) : null;
    let mine = '';
    if (pids) {
      const ms = [];
      T.levels.forEach(L => L.matches.forEach(m => {
        if ([...sidePlayers(L, m.a), ...sidePlayers(L, m.b)].some(p => pids.has(p))) ms.push({ L, m });
      }));
      ms.sort((x, y) => (x.m.time ?? 1e9) - (y.m.time ?? 1e9));
      const names = players.filter(p => pids.has(p.id)).map(p => p.name);
      mine = `<div class="card"><h3>Partidos de ${esc(names.slice(0, 3).join(', '))}${names.length > 3 ? '…' : ''}</h3>
        ${ms.length ? `<div class="matches">${ms.map(({ L, m }) => matchCard(L, m, { pids, showLevel: L.name })).join('')}</div>`
          : `<p class="muted" style="margin:0">${names.length ? 'Sin partidos asignados todavía.' : 'No se encontró ningún jugador con ese nombre.'}</p>`}</div>`;
    }
    body.innerHTML = mine + (T.levels.length ? tournamentDetail(T, { pids, levelId: st.level, tab: st.tab }) : '<div class="empty">Este torneo aún no tiene niveles.</div>');
  };
  draw();
  return {
    async click(e) {
      if (e.target.closest('[data-act=simg]')) {
        try { toast('Generando imagen…'); await exportScheduleImage(T); } catch (err) { toast(err.message, true); }
        return;
      }
      const t = e.target.closest('[data-tab],[data-vlvl]');
      if (!t) return;
      if (t.dataset.tab) st.tab = t.dataset.tab;
      if (t.dataset.vlvl !== undefined) st.level = t.dataset.vlvl || null;
      viewer(el, T, st);
    },
    input(e) { if (e.target.id === 'vq') { st.q = e.target.value; draw(); } },
  };
}

const st = { tab: 'pos', level: null, q: '' };

// Mientras se mira la vista jugador, se buscan datos nuevos cada 2 minutos.
let poll = null;
function startPolling(app) {
  clearInterval(poll);
  poll = setInterval(async () => {
    if (!location.hash.startsWith('#/jugador')) { clearInterval(poll); return; }
    if (document.activeElement?.id === 'vq') return;
    const before = db().updatedAt;
    await reloadRemote();
    if (db().updatedAt !== before) { bindPlayers(db().players); playerView(app); }
  }, 120000);
}

export function playerView(app) {
  startPolling(app);
  const list = [...db().tournaments].sort((a, b) => (a.status === 'finished') - (b.status === 'finished') || b.date.localeCompare(a.date));
  const T = list.find(t => t.id === pref.get('pf_ptour')) || list[0];
  app.innerHTML = `<div class="page-head"><div><h1>Torneos</h1><p>Posiciones, programación y puntajes. Busca tu nombre para destacar tus partidos.</p></div>
      <div style="text-align:right"><button class="btn" data-act="refresh">↻ Actualizar</button>
      ${db().updatedAt ? `<div class="small muted" style="margin-top:6px">Datos al ${new Date(db().updatedAt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>` : ''}</div></div>
    ${list.length ? `<div class="card tight"><label class="f">Torneo<select id="ptour">${list.map(t => `<option value="${t.id}" ${t.id === T.id ? 'selected' : ''}>
        ${esc(fmtDate(t.date))} · ${esc(t.name)} ${t.status === 'finished' ? '(finalizado)' : '(en curso)'}</option>`).join('')}</select></label>
      ${T.levels.length ? `<p class="small muted" style="margin:10px 0 0">${T.levels.map(L => `${esc(L.name)} · ${MODES[L.mode]}`).join(' &nbsp;|&nbsp; ')}</p>` : ''}</div>
      <div id="pview"></div>` : '<div class="empty">Aún no hay torneos publicados.</div>'}`;
  const v = T ? viewer($('#pview'), T, st) : null;
  on(app, {
    async click(e) {
      if (e.target.closest('[data-act=refresh]')) {
        await reloadRemote(); bindPlayers(db().players); playerView(app); toast('Datos actualizados');
        return;
      }
      v?.click(e);
    },
    change(e) { if (e.target.id === 'ptour') { pref.set('pf_ptour', e.target.value); st.level = null; playerView(app); } },
    input: e => v?.input(e),
  });
}
