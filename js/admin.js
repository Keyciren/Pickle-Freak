// Vistas del perfil administrador.
import { store, getToken, setToken, sync, sha256, replaceDB } from './store.js';
import {
  uid, MODES, newLevel, newTournament, groupName, groupCount, entryNoun, generateLevel, assignRandomGroups,
  advance, buildSchedule, scheduleCfg, scheduleSummary, levelComplete, tournamentComplete, matchResult, podium, isAA,
} from './logic.js';
import { esc, fmtTime, fmtDate, formatText, levelSummary, groupBlocks, finalsBlock, podiumHTML, scheduleGrid } from './render.js';
import { $, $$, db, on, toast, commit, pref, findOrCreatePlayer, activeTournaments, currentTournament, setCurrentTournament, keepFocus, norm } from './ui.js';
import { exportExcel, exportImage } from './export.js';
import { viewer } from './player.js';

export const ADMIN_NAV = [
  ['jugadores', 'Jugadores'], ['niveles', 'Niveles'], ['inscritos', 'Parejas / Jugadores'],
  ['grupos', 'Grupos'], ['programacion', 'Programación'], ['historico', 'Histórico'], ['ajustes', 'Ajustes'],
];

const head = (title, sub, extra = '') => `<div class="page-head"><div><h1>${title}</h1><p>${sub}</p></div>${extra}</div>`;

/* ---------- Barra de torneo ---------- */

let showNewT = false;
function tournamentBar() {
  const list = activeTournaments(), T = currentTournament();
  const form = `<form id="tform" class="fields" style="margin-top:14px">
      <label class="f">Nombre del torneo<input name="name" required placeholder="Ej: Torneo de Primavera" value="${showNewT === 'edit' ? esc(T?.name) : ''}"></label>
      <label class="f">Fecha<input name="date" type="date" required value="${showNewT === 'edit' ? esc(T?.date) : new Date().toISOString().slice(0, 10)}"></label>
      <div class="row" style="align-self:end"><button class="btn primary">${showNewT === 'edit' ? 'Guardar' : 'Crear torneo'}</button>
      <button type="button" class="btn ghost" data-act="t-cancel">Cancelar</button></div></form>`;
  return `<div class="card tight"><div class="row">
    <strong style="font-family:Outfit">Torneo</strong>
    ${list.length ? `<select id="tsel" style="max-width:340px">${list.map(t => `<option value="${t.id}" ${t.id === T?.id ? 'selected' : ''}>${esc(fmtDate(t.date))} · ${esc(t.name)}</option>`).join('')}</select>`
      : '<span class="muted">No hay torneos en curso</span>'}
    <span class="spacer"></span>
    ${T ? '<button class="btn sm" data-act="t-edit">Editar</button><button class="btn sm danger" data-act="t-del">Eliminar</button>' : ''}
    <button class="btn sm primary" data-act="t-new">+ Nuevo torneo</button></div>
    ${showNewT ? form : ''}</div>`;
}

function tournamentBarHandlers(rerender) {
  return {
    click(e) {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 't-new') { showNewT = true; rerender(); }
      if (a === 't-edit') { showNewT = 'edit'; rerender(); }
      if (a === 't-cancel') { showNewT = false; rerender(); }
      if (a === 't-del') {
        const T = currentTournament();
        if (confirm(`¿Eliminar el torneo "${T.name}" y todos sus datos?`)) {
          db().tournaments = db().tournaments.filter(t => t.id !== T.id); commit(); rerender(); toast('Torneo eliminado');
        }
      }
      return !!a?.startsWith('t-');
    },
    change(e) { if (e.target.id === 'tsel') { setCurrentTournament(e.target.value); rerender(); return true; } },
    submit(e) {
      if (e.target.id !== 'tform') return false;
      e.preventDefault();
      const f = new FormData(e.target);
      if (showNewT === 'edit') { const T = currentTournament(); T.name = f.get('name').trim(); T.date = f.get('date'); }
      else { const T = newTournament(f.get('name').trim(), f.get('date')); db().tournaments.push(T); setCurrentTournament(T.id); }
      showNewT = false; commit(); rerender(); toast('Torneo guardado');
      return true;
    },
  };
}

// Envuelve una vista que requiere torneo activo.
function withTournament(title, sub, body) {
  return function view(app) {
    const rerender = () => view(app);
    const T = currentTournament();
    const bar = tournamentBarHandlers(rerender);
    const inner = T ? body(T, rerender) : { html: `<div class="empty">Crea un torneo para comenzar.</div>` };
    app.innerHTML = head(title, sub) + tournamentBar() + inner.html;
    on(app, {
      click: e => bar.click(e) || inner.click?.(e),
      change: e => bar.change(e) || inner.change?.(e),
      submit: e => bar.submit(e) || inner.submit?.(e),
      input: e => inner.input?.(e),
    });
    inner.after?.();
  };
}

function levelChips(T, key = 'pf_lvl') {
  if (!T.levels.length) return { L: null, html: '' };
  const L = T.levels.find(l => l.id === pref.get(key)) || T.levels[0];
  return { L, html: `<div class="chips">${T.levels.map(l => `<button class="chip ${l.id === L.id ? 'active' : ''}" data-lvl="${l.id}">${esc(l.name)}</button>`).join('')}</div>` };
}
const pickLevel = (e, rerender) => { const b = e.target.closest('[data-lvl]'); if (b) { pref.set('pf_lvl', b.dataset.lvl); rerender(); return true; } };

/* ---------- 1. Jugadores ---------- */

let editPlayer = null, playerQuery = '';
function jugadores(app) {
  const rerender = () => jugadores(app);
  const P = editPlayer ? db().players.find(p => p.id === editPlayer) : null;
  const list = db().players.filter(p => !playerQuery || norm(p.name + ' ' + p.email + ' ' + p.rut).includes(norm(playerQuery)))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  app.innerHTML = head('Jugadores', 'Registro de jugadores. Solo el nombre es obligatorio.') + `
    <div class="card"><h3>${P ? 'Editar jugador' : 'Crear jugador'}</h3>
      <form id="pform" class="fields">
        <label class="f">Nombre *<input name="name" required value="${esc(P?.name)}" placeholder="Nombre y apellido"></label>
        <label class="f">Correo<input name="email" type="email" value="${esc(P?.email)}" placeholder="opcional"></label>
        <label class="f">RUT<input name="rut" value="${esc(P?.rut)}" placeholder="12.345.678-9"></label>
        <div class="row" style="align-self:end"><button class="btn primary">${P ? 'Guardar cambios' : 'Agregar jugador'}</button>
        ${P ? '<button type="button" class="btn ghost" data-act="cancel">Cancelar</button>' : ''}</div>
      </form></div>
    <div class="card"><div class="row" style="margin-bottom:14px"><h3 style="margin:0">Registrados <span class="badge">${db().players.length}</span></h3>
      <span class="spacer"></span><input id="pq" placeholder="Buscar…" value="${esc(playerQuery)}" style="max-width:260px"></div>
      ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>RUT</th><th></th></tr></thead><tbody>
        ${list.map(p => `<tr><td class="name">${esc(p.name)}</td><td>${esc(p.email) || '<span class="muted">—</span>'}</td><td>${esc(p.rut) || '<span class="muted">—</span>'}</td>
          <td style="text-align:right"><button class="btn sm" data-edit="${p.id}">Editar</button> <button class="icon-btn" data-del="${p.id}" title="Eliminar">✕</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No hay jugadores registrados.</div>'}</div>`;
  on(app, {
    submit(e) {
      e.preventDefault();
      const f = new FormData(e.target), name = f.get('name').trim().replace(/\s+/g, ' ');
      const dup = db().players.find(p => norm(p.name) === norm(name) && p.id !== editPlayer);
      if (dup) return toast('Ya existe un jugador con ese nombre', true);
      const data = { name, email: f.get('email').trim(), rut: f.get('rut').trim() };
      if (P) Object.assign(P, data); else db().players.push({ id: uid(), ...data });
      editPlayer = null; commit(); rerender(); toast('Jugador guardado');
      $('#pform input[name=name]')?.focus();
    },
    click(e) {
      const t = e.target;
      if (t.dataset.edit) { editPlayer = t.dataset.edit; rerender(); }
      if (t.dataset.act === 'cancel') { editPlayer = null; rerender(); }
      if (t.dataset.del) {
        const id = t.dataset.del;
        const used = db().tournaments.some(T => T.levels.some(L => L.entries.some(en => en.players.includes(id))));
        if (used) return toast('No se puede eliminar: participa en un torneo', true);
        db().players = db().players.filter(p => p.id !== id); commit(); rerender();
      }
    },
    input(e) { if (e.target.id === 'pq') { playerQuery = e.target.value; keepFocus(rerender); } },
  });
}

/* ---------- 2. Niveles ---------- */

const POINTS = [11, 15, 21];
function formatFields(key, label, f) {
  const other = !POINTS.includes(+f.points);
  return `<fieldset><legend>${label}</legend><div class="fields">
    <label class="f">Partido<select name="${key}_bo"><option value="1" ${+f.bestOf === 1 ? 'selected' : ''}>1 juego</option><option value="3" ${+f.bestOf === 3 ? 'selected' : ''}>Mejor de 3</option></select></label>
    <label class="f">Puntaje<select name="${key}_pts" data-pts="${key}">${POINTS.map(p => `<option ${+f.points === p ? 'selected' : ''}>${p}</option>`).join('')}<option value="otro" ${other ? 'selected' : ''}>Otro</option></select></label>
    <label class="f ${other ? '' : 'hidden'}" id="${key}_custom_wrap">Otro puntaje<input name="${key}_custom" type="number" min="1" value="${other ? f.points : ''}"></label>
  </div></fieldset>`;
}

let editLevel = null;
const niveles = withTournament('Niveles', 'Configura cada nivel o categoría del torneo.', (T, rerender) => {
  const L = (editLevel && T.levels.find(l => l.id === editLevel)) || null;
  const v = L || newLevel();
  const html = `<div class="card"><h3>${L ? `Editar nivel: ${esc(L.name)}` : 'Crear nivel'}</h3>
    <form id="lform">
      <div class="fields">
        <label class="f">Nombre del nivel *<input name="name" required value="${esc(v.name)}" placeholder="Ej: Intermedio, 3.0, Damas"></label>
        <label class="f">Modalidad<select name="mode">${Object.entries(MODES).map(([k, t]) => `<option value="${k}" ${v.mode === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="f"><span id="ne-label">Cantidad de ${v.mode === 'doubles' ? 'parejas' : 'jugadores'}</span><input name="numEntries" type="number" min="2" max="64" value="${v.numEntries}"></label>
        <label class="f">Cantidad de grupos<select name="numGroups">${[1, 2, 3, 4].map(n => `<option ${+v.numGroups === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <p class="small muted" id="mode-hint" style="margin:10px 0 16px">${modeHint(v.mode)}</p>
      <div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
        ${formatFields('group', 'Fase de grupos', v.formats.group)}
        ${formatFields('semi', 'Semifinales', v.formats.semi)}
        ${formatFields('final', 'Final y 3er lugar', v.formats.final)}
      </div>
      <div class="row" style="margin-top:16px"><button class="btn primary">${L ? 'Guardar cambios' : 'Crear nivel'}</button>
        ${L ? '<button type="button" class="btn ghost" data-act="cancel">Cancelar</button>' : ''}</div>
    </form></div>
    <div class="card"><h3>Niveles del torneo</h3>
      ${T.levels.length ? `<div class="table-wrap"><table><thead><tr><th>Nivel</th><th>Detalle</th><th>Grupos</th><th>Semis</th><th>Final</th><th>Estado</th><th></th></tr></thead><tbody>
      ${T.levels.map(l => `<tr><td class="name">${esc(l.name)}</td><td>${esc(levelSummary(l))}</td>
        <td>${formatText(l.formats.group)}</td><td>${formatText(l.formats.semi)}</td><td>${formatText(l.formats.final)}</td>
        <td>${levelComplete(l) ? '<span class="badge g">Finalizado</span>' : l.generated ? '<span class="badge y">En juego</span>' : '<span class="badge">Inscripción</span>'}</td>
        <td style="text-align:right"><button class="btn sm" data-goins="${l.id}">${l.mode === 'doubles' ? 'Parejas' : 'Jugadores'}</button>
          <button class="btn sm" data-edit="${l.id}">Editar</button> <button class="icon-btn" data-del="${l.id}" title="Eliminar">✕</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Aún no hay niveles. Crea el primero arriba.</div>'}</div>`;
  return {
    html,
    change(e) {
      const t = e.target;
      if (t.dataset.pts) $(`#${t.dataset.pts}_custom_wrap`).classList.toggle('hidden', t.value !== 'otro');
      if (t.name === 'mode') {
        $('#ne-label').textContent = `Cantidad de ${t.value === 'doubles' ? 'parejas' : 'jugadores'}`;
        $('#mode-hint').textContent = modeHint(t.value);
      }
    },
    click(e) {
      const t = e.target;
      if (t.dataset.edit) { editLevel = t.dataset.edit; rerender(); window.scrollTo(0, 0); }
      if (t.dataset.act === 'cancel') { editLevel = null; rerender(); }
      if (t.dataset.goins) { pref.set('pf_lvl', t.dataset.goins); location.hash = '#/admin/inscritos'; }
      if (t.dataset.del) {
        const l = T.levels.find(x => x.id === t.dataset.del);
        if (confirm(`¿Eliminar el nivel "${l.name}" con sus inscritos y resultados?`)) { T.levels = T.levels.filter(x => x !== l); commit(); rerender(); }
      }
    },
    submit(e) {
      e.preventDefault();
      const f = new FormData(e.target);
      const fmt = k => ({ bestOf: +f.get(`${k}_bo`), points: f.get(`${k}_pts`) === 'otro' ? (+f.get(`${k}_custom`) || 11) : +f.get(`${k}_pts`) });
      const data = {
        name: f.get('name').trim(), mode: f.get('mode'), numEntries: Math.max(2, +f.get('numEntries') || 2), numGroups: +f.get('numGroups'),
        formats: { group: fmt('group'), semi: fmt('semi'), final: fmt('final') },
      };
      if (L) {
        const structural = L.generated && (L.mode !== data.mode || +L.numGroups !== data.numGroups);
        if (structural && !confirm('Cambiar la modalidad o cantidad de grupos borrará el fixture y los resultados de este nivel. ¿Continuar?')) return;
        if (L.mode !== data.mode && ((L.mode === 'doubles') !== (data.mode === 'doubles'))) L.entries.forEach(en => { en.players = en.players.slice(0, data.mode === 'doubles' ? 2 : 1); });
        if (structural) { L.matches = []; L.generated = false; }
        if (+L.numGroups !== data.numGroups) L.entries.forEach(en => { if (en.group >= data.numGroups) en.group = null; });
        Object.assign(L, data);
        advance(L);
      } else {
        const nl = Object.assign(newLevel(), data);
        T.levels.push(nl);
        pref.set('pf_lvl', nl.id);
      }
      editLevel = null; commit(); rerender(); toast('Nivel guardado');
    },
  };
});

function modeHint(mode) {
  return {
    singles: 'Singles: cada jugador juega contra todos los de su grupo. Con 4 o más jugadores se juegan semifinales, final y 3er lugar.',
    doubles: 'Dobles: cada pareja juega contra todas las de su grupo. Con 4 o más parejas se juegan semifinales, final y 3er lugar.',
    allaround: 'All Around: los jugadores rotan de pareja y juegan todos con todos (cada jugador hace pareja con cada compañero del grupo). Ranking individual. Con 2 grupos, la fase final se juega en dobles por puesto: 1°A+2°A vs 1°B+2°B (1° y 2° lugar), 3°A+4°A vs 3°B+4°B (3° y 4°), y así (formato de \"Final\"; no hay semifinales). Con 1 grupo y 8 o más jugadores: parejas 1°+8°, 2°+7°… a semifinales. Mínimo 4 jugadores por grupo.',
  }[mode];
}

/* ---------- 3. Parejas / Jugadores ---------- */

const inscritos = withTournament('Parejas / Jugadores', 'Inscribe a los participantes de cada nivel y asigna su grupo.', (T, rerender) => {
  const { L, html: chips } = levelChips(T);
  if (!L) return { html: '<div class="empty">Primero crea un nivel en la sección <a href="#/admin/niveles">Niveles</a>.</div>' };
  const dbl = L.mode === 'doubles', G = groupCount(L);
  const noun = entryNoun(L), nouns = entryNoun(L, true);
  const playerInput = (en, i) => `<input list="players-dl" id="pi-${en.id}-${i}" data-entry="${en.id}" data-pi="${i}" value="${esc(en.players[i] ? db().players.find(p => p.id === en.players[i])?.name : '')}" placeholder="Nombre del jugador">`;
  const counts = Array.from({ length: G }, (_, g) => L.entries.filter(en => en.group === g).length);
  const html = chips + `
    ${L.generated ? `<div class="notice">El fixture de este nivel ya está generado. Si cambias los inscritos o grupos, debes <b>regenerar el fixture</b> (se borran los resultados).</div>` : ''}
    <div class="card"><div class="row" style="margin-bottom:14px">
      <h3 style="margin:0">${dbl ? 'Parejas' : 'Jugadores'} <span class="badge ${L.entries.length === +L.numEntries ? 'g' : ''}">${L.entries.length} / ${L.numEntries}</span></h3>
      <span class="badge">${MODES[L.mode]}</span><span class="spacer"></span>
      ${G > 1 ? counts.map((c, g) => `<span class="badge">${groupName(g)}: ${c}</span>`).join(' ') : ''}</div>
      ${L.mode === 'allaround' ? '<p class="small muted">All Around: inscribe jugadores individuales; el sistema arma las parejas rotativas para que todos jueguen con todos.</p>' : ''}
      <datalist id="players-dl">${db().players.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
      ${L.entries.length ? `<div class="table-wrap"><table><thead><tr><th class="num">#</th>
        ${dbl ? '<th>Jugador 1</th><th>Jugador 2</th><th>Nombre pareja (opcional)</th>' : '<th>Jugador</th>'}
        ${G > 1 ? '<th>Grupo</th>' : ''}<th></th></tr></thead><tbody>
        ${L.entries.map((en, i) => `<tr><td class="num">${i + 1}</td>
          <td>${playerInput(en, 0)}</td>${dbl ? `<td>${playerInput(en, 1)}</td><td><input id="pn-${en.id}" data-pname="${en.id}" value="${esc(en.name)}" placeholder="Ej: Los Picantes"></td>` : ''}
          ${G > 1 ? `<td><select data-grp="${en.id}" style="min-width:120px"><option value="">Sin grupo</option>${Array.from({ length: G }, (_, g) => `<option value="${g}" ${en.group === g ? 'selected' : ''}>${groupName(g)}</option>`).join('')}</select></td>` : ''}
          <td><button class="icon-btn" data-delentry="${en.id}" title="Quitar">✕</button></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty">Aún no hay ${nouns} inscritos.</div>`}
      <div class="row" style="margin-top:16px">
        <button class="btn" data-act="add">+ Agregar ${noun}</button>
        ${L.entries.length < +L.numEntries ? `<button class="btn ghost" data-act="fill">Completar ${L.numEntries} filas</button>` : ''}
        ${G > 1 ? '<button class="btn" data-act="random">🎲 Repartir grupos al azar</button>' : ''}
        <span class="spacer"></span>
        <button class="btn primary" data-act="gen">${L.generated ? 'Regenerar fixture' : 'Generar fixture'}</button>
      </div></div>`;
  const addEntry = () => L.entries.push({ id: uid(), name: '', players: [], group: G === 1 ? 0 : null });
  return {
    html,
    click(e) {
      if (pickLevel(e, rerender)) return;
      const t = e.target, act = t.closest('[data-act]')?.dataset.act;
      if (act === 'add') { addEntry(); commit(); rerender(); $$(`input[data-entry]`).at(dbl ? -2 : -1)?.focus(); }
      if (act === 'fill') { while (L.entries.length < +L.numEntries) addEntry(); commit(); rerender(); }
      if (act === 'random') {
        if (L.generated && !confirm('Esto requiere regenerar el fixture y borra los resultados. ¿Continuar?')) return;
        assignRandomGroups(L); if (L.generated) { L.generated = false; L.matches = []; }
        commit(); rerender(); toast('Grupos repartidos al azar');
      }
      if (act === 'gen') {
        if (L.generated && !confirm('Regenerar el fixture borrará todos los resultados de este nivel. ¿Continuar?')) return;
        const prev = JSON.stringify(L.entries);
        L.entries = L.entries.filter(en => en.players.length || en.name);
        try {
          generateLevel(L); commit(); toast('Fixture generado'); location.hash = '#/admin/grupos';
        } catch (err) { L.entries = JSON.parse(prev); rerender(); toast(err.message, true); }
      }
      if (t.dataset.delentry) {
        L.entries = L.entries.filter(en => en.id !== t.dataset.delentry);
        if (L.generated) { L.generated = false; L.matches = []; toast('Se quitó el fixture: vuelve a generarlo'); }
        commit(); rerender();
      }
    },
    change(e) {
      const t = e.target;
      const en = L.entries.find(x => x.id === (t.dataset.entry || t.dataset.grp || t.dataset.pname));
      if (!en) return;
      if (t.dataset.entry) {
        const id = findOrCreatePlayer(t.value);
        const i = +t.dataset.pi, players = [...en.players];
        if (id && T.levels.some(l => l === L && l.entries.some(o => o !== en && o.players.includes(id)))) {
          toast('Ese jugador ya está inscrito en este nivel', true); t.value = ''; return;
        }
        players[i] = id;
        en.players = players.filter(Boolean);
        if (L.generated) { L.generated = false; L.matches = []; toast('Cambió un inscrito: vuelve a generar el fixture'); }
      }
      if (t.dataset.grp) { en.group = t.value === '' ? null : +t.value; if (L.generated) { L.generated = false; L.matches = []; toast('Cambió un grupo: vuelve a generar el fixture'); } }
      if (t.dataset.pname) en.name = t.value.trim();
      commit();
      keepFocus(rerender);
    },
  };
});

/* ---------- 4. Grupos ---------- */

const grupos = withTournament('Grupos', 'Tabla de posiciones, fechas y resultados. Las fases siguientes se arman solas al completar los puntajes.', (T, rerender) => {
  const { L, html: chips } = levelChips(T);
  if (!L) return { html: '<div class="empty">Primero crea un nivel en <a href="#/admin/niveles">Niveles</a>.</div>' };
  if (!L.generated) return { html: chips + `<div class="empty">El fixture de <b>${esc(L.name)}</b> aún no está generado.<br><br><a class="btn primary" href="#/admin/inscritos">Ir a inscritos</a></div>`, click: e => pickLevel(e, rerender) };
  const played = L.matches.filter(m => matchResult(L, m).done).length;
  const html = chips + `<div class="card tight"><div class="row stats">
      <div class="stat"><b>${played}/${L.matches.length}</b><span>Partidos jugados</span></div>
      <div class="stat"><b>${MODES[L.mode]}</b><span>Modalidad</span></div>
      <div class="stat"><b>${groupCount(L)}</b><span>${groupCount(L) > 1 ? 'Grupos' : 'Grupo'}</span></div>
      <span class="spacer"></span><span class="small muted">Ingresa el puntaje de cada juego. Ej: 11 y 7.</span></div></div>
    ${podiumHTML(L)}${groupBlocks(L, { editable: true })}${finalsBlock(L, { editable: true })}`;
  return {
    html,
    click: e => pickLevel(e, rerender),
    change(e) {
      const t = e.target;
      if (!t.dataset.mid) return;
      const m = L.matches.find(x => x.id === t.dataset.mid);
      const g = +t.dataset.g;
      m.games ||= [];
      m.games[g] = { ...(m.games[g] || { a: '', b: '' }), [t.dataset.s]: t.value === '' ? '' : Math.max(0, +t.value) };
      const before = JSON.stringify(L.matches.filter(x => x.phase !== 'group').map(x => [x.a, x.b]));
      advance(L);
      commit();
      if (JSON.stringify(L.matches.filter(x => x.phase !== 'group').map(x => [x.a, x.b])) !== before) toast('Fase siguiente actualizada');
      if (levelComplete(L)) toast(`¡${L.name} finalizado! Revisa el podio.`);
      keepFocus(rerender);
    },
  };
});

/* ---------- 5. Programación ---------- */

const programacion = withTournament('Programación', 'Canchas, horarios y programa por cancha.', (T, rerender) => {
  const s = scheduleCfg(T);
  const sum = scheduleSummary(T);
  const scheduled = sum.scheduled > 0;
  const notGen = T.levels.filter(L => !L.generated);
  const complete = tournamentComplete(T);
  const fits = sum.endTime != null && sum.endTime <= sum.limit;
  const diff = sum.endTime != null ? Math.abs(sum.limit - sum.endTime) : 0;
  const tiles = [[sum.group, 'Fase de grupos'], [sum.semi, 'Semifinales'], [sum.third, 'Por el 3er lugar'], [sum.final, 'Finales']]
    .concat(sum.place ? [[sum.place, 'Otros puestos']] : [])
    .concat([[sum.turns || '—', 'Turnos'], [s.courts.length, 'Canchas']]);
  const html = `
  ${scheduled ? `<div class="banner ${fits ? 'ok' : 'bad'}"><div class="big">${fmtTime(sum.endTime)}</div><div>
      <b>Termina a las ${fmtTime(sum.endTime)}: ${fits ? 'cabe en el horario.' : 'no cabe en el horario.'}</b>
      <div>${fits ? `Te sobran ${diff} minutos antes de las ${fmtTime(sum.limit)}.` : `Se pasa ${diff} minutos de las ${fmtTime(sum.limit)}. Agrega canchas, horas o reduce los minutos por partido.`}</div>
      ${sum.scheduled < sum.total ? `<div class="small">Hay ${sum.total - sum.scheduled} partido(s) sin programar: vuelve a generar la programación.</div>` : ''}</div></div>` : ''}
  <div class="tiles">${tiles.map(([n, t]) => `<div class="tile"><b>${n}</b><span>${t}</span></div>`).join('')}</div>
  <div class="card"><h3 class="eyebrow">Horario y canchas</h3>
    <form id="sform">
      <div class="fields" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <label class="f">Canchas<input name="courts" type="number" min="1" max="30" value="${s.courts.length}"></label>
        <label class="f">Hora de inicio<input name="start" type="time" value="${esc(s.start)}"></label>
        <label class="f">Horas disponibles<input name="hours" type="number" min="0.5" step="0.5" value="${s.hours}"></label>
        <label class="f">Minutos por partido<input name="mm" type="number" min="1" value="${s.minutes.match}"></label>
        <label class="f">Descanso entre partidos<input name="rest" type="number" min="0" value="${s.rest}"></label>
        <label class="f">Minutos por final<input name="mf" type="number" min="1" value="${s.minutes.final}"></label>
      </div>
      <p class="small muted" style="max-width:640px">Cada turno dura ${s.minutes.match} minutos de juego más ${s.rest} de descanso (los turnos con finales o partidos por puesto duran ${s.minutes.final}).
        Los partidos de un grupo respetan el orden de las fechas, y las semifinales parten cuando ese nivel termina sus grupos.</p>
      <div class="row"><button class="btn primary">Generar programación</button></div>
    </form>
    ${notGen.length ? `<div class="notice" style="margin:16px 0 0">Niveles sin fixture (no se programan): ${notGen.map(l => esc(l.name)).join(', ')}.</div>` : ''}
  </div>
  <div class="card"><div class="row" style="margin-bottom:14px"><h3 class="eyebrow" style="margin:0">Programa por cancha</h3><span class="spacer"></span>
    <span class="small muted">${sum.total} partidos</span>
    <button class="btn sm" data-act="xls">Exportar Excel</button><button class="btn sm" data-act="img">Generar imagen</button></div>
    ${scheduled ? scheduleGrid(T) : '<div class="empty">Configura y presiona "Generar programación".</div>'}</div>
  <div class="card"><h3 class="eyebrow">Cierre del torneo</h3>
    <div class="table-wrap" style="margin-bottom:16px"><table><thead><tr><th>Nivel</th><th>Partidos</th><th>Estado</th></tr></thead><tbody>
    ${T.levels.map(L => `<tr><td class="name">${esc(L.name)}</td><td>${L.matches.filter(m => matchResult(L, m).done).length}/${L.matches.length}</td>
      <td>${levelComplete(L) ? '<span class="badge g">Podio definido</span>' : L.generated ? '<span class="badge y">En juego</span>' : '<span class="badge">Sin fixture</span>'}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Sin niveles</td></tr>'}
    </tbody></table></div>
    ${T.levels.map(podiumHTML).join('')}
    <div class="row"><button class="btn primary" data-act="finish" ${complete ? '' : 'disabled'}>Guardar en historial</button>
      <button class="btn" data-act="xls">Exportar Excel</button><button class="btn" data-act="img">Generar imagen de resultados</button>
      ${complete ? '' : '<span class="small muted">Se habilita cuando todos los niveles tienen su podio (1°, 2°, 3° y 4°).</span>'}</div>
  </div>`;
  return {
    html,
    submit(e) {
      e.preventDefault();
      const f = new FormData(e.target);
      Object.assign(s, {
        numCourts: Math.max(1, +f.get('courts') || 1),
        start: f.get('start') || '09:00', hours: +f.get('hours') || 1, rest: Math.max(0, +f.get('rest') || 0),
        minutes: { match: +f.get('mm') || 15, final: +f.get('mf') || 20 },
      });
      try {
        const r = buildSchedule(T);
        commit(); rerender();
        toast(r.fits ? `Programación generada: ${r.turns} turnos` : 'Programación generada, pero no cabe en el horario', !r.fits);
      } catch (err) { toast(err.message, true); }
    },
    async click(e) {
      const act = e.target.closest('[data-act]')?.dataset.act;
      try {
        if (act === 'xls') exportExcel(T);
        if (act === 'img') { toast('Generando imagen…'); await exportImage(T); }
      } catch (err) { toast(err.message, true); }
      if (act === 'finish' && confirm(`¿Guardar "${T.name}" en el historial? El torneo quedará como finalizado.`)) {
        T.status = 'finished'; T.finishedAt = new Date().toISOString();
        commit(); pref.set('pf_hist', T.id); toast('Torneo guardado en el historial');
        location.hash = '#/admin/historico';
      }
    },
  };
});

/* ---------- 6. Histórico ---------- */

const histState = { tab: 'pos', level: null, q: '' };
function historico(app) {
  const rerender = () => historico(app);
  const done = db().tournaments.filter(t => t.status === 'finished').sort((a, b) => b.date.localeCompare(a.date));
  const dates = [...new Set(done.map(t => t.date))];
  let T = done.find(t => t.id === pref.get('pf_hist')) || done[0];
  const date = T?.date;
  const sameDate = done.filter(t => t.date === date);
  app.innerHTML = head('Histórico de torneos', 'Selecciona la fecha y el torneo para ver su detalle.') + (done.length ? `
    <div class="card tight"><div class="row">
      <label class="f" style="flex:1;min-width:160px">Fecha<select id="hdate">${dates.map(d => `<option value="${d}" ${d === date ? 'selected' : ''}>${fmtDate(d)}</option>`).join('')}</select></label>
      <label class="f" style="flex:2;min-width:200px">Torneo<select id="htour">${sameDate.map(t => `<option value="${t.id}" ${t.id === T.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <div class="row" style="align-self:end"><button class="btn sm" data-act="xls">Excel</button><button class="btn sm" data-act="img">Imagen</button>
      <button class="btn sm ghost" data-act="reopen">Reabrir</button></div></div></div>
    <div id="hview"></div>` : '<div class="empty">Aún no hay torneos guardados en el historial.<br>Se guardan desde <a href="#/admin/programacion">Programación</a> al finalizar.</div>');
  if (!T) return on(app, {});
  const v = viewer($('#hview'), T, histState);
  on(app, {
    change(e) {
      if (e.target.id === 'hdate') { pref.set('pf_hist', done.find(t => t.date === e.target.value).id); histState.level = null; rerender(); }
      else if (e.target.id === 'htour') { pref.set('pf_hist', e.target.value); histState.level = null; rerender(); }
    },
    async click(e) {
      const act = e.target.closest('[data-act]')?.dataset.act;
      try {
        if (act === 'xls') exportExcel(T);
        if (act === 'img') { toast('Generando imagen…'); await exportImage(T); }
      } catch (err) { toast(err.message, true); }
      if (act === 'reopen' && confirm('¿Reabrir este torneo para editarlo? Volverá a la lista de torneos en curso.')) {
        T.status = 'active'; setCurrentTournament(T.id); commit(); location.hash = '#/admin/grupos';
      }
      v.click(e);
    },
    input: e => v.input(e),
  });
}

/* ---------- Ajustes ---------- */

function ajustes(app) {
  const rerender = () => ajustes(app);
  const tok = getToken();
  app.innerHTML = head('Ajustes', 'Contraseña, sincronización con GitHub y respaldos.') + `
    <div class="grid-2">
      <div class="card"><h3>Cambiar contraseña de administrador</h3>
        <form id="pwform" style="display:flex;flex-direction:column;gap:12px">
          <label class="f">Contraseña actual<input type="password" name="cur" required autocomplete="current-password"></label>
          <label class="f">Nueva contraseña<input type="password" name="n1" required minlength="6" autocomplete="new-password"></label>
          <label class="f">Repetir nueva contraseña<input type="password" name="n2" required minlength="6" autocomplete="new-password"></label>
          <button class="btn primary">Actualizar contraseña</button></form></div>
      <div class="card"><h3>Base de datos en GitHub</h3>
        <p class="small muted">Los datos se guardan en <code>data/db.json</code> del repositorio, así los jugadores ven los resultados desde cualquier dispositivo.
        Para guardar en la nube, pega aquí un <b>token personal de GitHub</b> (fine‑grained) con permiso <i>Contents: Read and write</i> sobre el repositorio. Queda guardado solo en este navegador.</p>
        <form id="tkform" style="display:flex;flex-direction:column;gap:12px">
          <label class="f">Token de GitHub<input name="token" type="password" placeholder="${tok ? '•••••••• (configurado)' : 'github_pat_…'}" autocomplete="off"></label>
          <div class="row"><button class="btn primary">Guardar token</button>
          ${tok ? '<button type="button" class="btn" data-act="sync">Sincronizar ahora</button><button type="button" class="btn ghost danger" data-act="untoken">Quitar token</button>' : ''}</div>
        </form>
        <p class="small" style="margin-bottom:0">Estado: <b>${esc(store.statusMsg || store.status)}</b></p></div>
      <div class="card"><h3>Respaldo</h3><p class="small muted">Descarga o restaura toda la base de datos en formato JSON.</p>
        <div class="row"><button class="btn" data-act="backup">Descargar respaldo</button>
        <label class="btn">Restaurar respaldo<input type="file" id="restore" accept="application/json" hidden></label></div></div>
    </div>`;
  on(app, {
    async submit(e) {
      e.preventDefault();
      const f = new FormData(e.target);
      if (e.target.id === 'pwform') {
        if (await sha256(f.get('cur')) !== db().settings.adminHash) return toast('La contraseña actual no es correcta', true);
        if (f.get('n1') !== f.get('n2')) return toast('Las contraseñas nuevas no coinciden', true);
        db().settings.adminHash = await sha256(f.get('n1')); commit(); e.target.reset(); toast('Contraseña actualizada');
      }
      if (e.target.id === 'tkform') {
        const t = f.get('token').trim();
        if (!t) return toast('Pega un token', true);
        setToken(t);
        const ok = await sync();
        toast(ok ? 'Token guardado y datos sincronizados' : 'Token guardado, pero no se pudo escribir en GitHub', !ok);
        rerender();
      }
    },
    async click(e) {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'sync') { const ok = await sync(); toast(ok ? 'Sincronizado' : store.statusMsg, !ok); rerender(); }
      if (act === 'untoken') { setToken(''); rerender(); toast('Token eliminado de este navegador'); }
      if (act === 'backup') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(db(), null, 2)], { type: 'application/json' }));
        a.download = `picklefreak_respaldo_${new Date().toISOString().slice(0, 10)}.json`; a.click();
      }
    },
    async change(e) {
      if (e.target.id !== 'restore' || !e.target.files[0]) return;
      try {
        const data = JSON.parse(await e.target.files[0].text());
        if (!Array.isArray(data.tournaments) || !Array.isArray(data.players)) throw new Error();
        if (confirm('Esto reemplazará todos los datos actuales. ¿Continuar?')) { replaceDB(data); commit(); toast('Respaldo restaurado'); rerender(); }
      } catch { toast('Archivo de respaldo inválido', true); }
    },
  });
}

export const adminViews = { jugadores, niveles, inscritos, grupos, programacion, historico, ajustes };
