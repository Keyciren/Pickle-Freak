import { store, load, sha256, setToken, checkToken, adoptRemote, hasLocalChanges } from './store.js';
import { bindPlayers } from './logic.js';
import { $, toast, on } from './ui.js';
import { adminViews, ADMIN_NAV } from './admin.js';
import { playerView } from './player.js';

const app = $('#app');
const isAdmin = () => sessionStorage.getItem('pf_admin') === '1';

const ICON_ADMIN = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const ICON_PLAYER = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="12" cy="14" r="1"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/></svg>';

function home() {
  app.innerHTML = `<section class="hero">
    <img src="assets/logo.png" alt="PickleFreak">
    <p>Torneos de pickleball: niveles, grupos, programación y resultados en un solo lugar.</p>
    <div class="roles">
      <button class="role" data-go="#/admin"><div class="ico">${ICON_ADMIN}</div><h3>Administrador</h3><p>Crea torneos, niveles, grupos y la programación.</p></button>
      <button class="role" data-go="#/jugador"><div class="ico">${ICON_PLAYER}</div><h3>Jugador</h3><p>Revisa posiciones, horarios y resultados.</p></button>
    </div></section>`;
  on(app, { click: e => { const b = e.target.closest('[data-go]'); if (b) location.hash = b.dataset.go; } });
}

function login() {
  app.innerHTML = `<div class="login card">
    <img src="assets/logo.png" alt="PickleFreak"><h2>Acceso administrador</h2>
    <form id="lf"><label class="f">Contraseña<input type="password" id="pw" autocomplete="current-password" required autofocus></label>
    <button class="btn primary">Ingresar</button></form></div>`;
  on(app, {
    submit: async e => {
      e.preventDefault();
      const h = await sha256($('#pw').value);
      if (h === store.db.settings.adminHash) { sessionStorage.setItem('pf_admin', '1'); location.hash = '#/admin/jugadores'; }
      else { toast('Contraseña incorrecta', true); $('#pw').select(); }
    },
  });
}

// Vincular un dispositivo: el token llega en el enlace del código QR (#/vincular/<token>).
async function link(token) {
  history.replaceState(null, '', location.pathname + '#/vincular');
  app.innerHTML = '<div class="login card"><img src="assets/logo.png" alt="PickleFreak"><h2>Vinculando dispositivo…</h2></div>';
  if (!token) { location.hash = '#/admin'; return; }
  setToken(token);
  const ok = await checkToken();
  if (!ok) {
    setToken('');
    app.innerHTML = `<div class="login card"><img src="assets/logo.png" alt="PickleFreak"><h2>No se pudo vincular</h2>
      <p class="muted">El código no es válido o el token venció. Genera un código nuevo desde Ajustes en el computador.</p>
      <a class="btn" href="#/">Volver al inicio</a></div>`;
    return;
  }
  // Los cambios solo locales de este dispositivo podrían pisar los datos en línea: se usan los de la nube.
  if (!hasLocalChanges() || confirm('Este dispositivo tiene cambios guardados solo aquí. ¿Descartarlos y usar los datos en línea? (Recomendado)')) await adoptRemote();
  else { const { sync } = await import('./store.js'); await sync(); }
  bindPlayers(store.db.players);
  app.innerHTML = `<div class="login card"><img src="assets/logo.png" alt="PickleFreak"><h2>¡Dispositivo vinculado!</h2>
    <p class="muted">Desde ahora, los resultados que ingreses aquí se guardan en línea automáticamente.</p>
    <a class="btn primary" href="#/admin">Ingresar como administrador</a></div>`;
}

function renderNav(area, view) {
  const nav = $('#nav'), sync = $('#sync');
  if (area === 'admin' && isAdmin()) {
    nav.innerHTML = ADMIN_NAV.map(([k, t]) => `<a href="#/admin/${k}" class="${k === view ? 'active' : ''}">${t}</a>`).join('')
      + `<a href="#/jugador">Vista jugador</a><a href="#/salir">Salir</a>`;
    sync.hidden = false;
  } else if (area === 'jugador') {
    nav.innerHTML = `<a href="#/jugador" class="active">Torneos</a><a href="#/admin">Admin</a>`;
    sync.hidden = true;
  } else { nav.innerHTML = ''; sync.hidden = true; }
}

function route() {
  const [area, view] = location.hash.replace(/^#\/?/, '').split('/');
  if (area === 'vincular') { renderNav(); return link(location.hash.split('/').slice(2).join('/')); }
  if (area === 'salir') { sessionStorage.removeItem('pf_admin'); location.hash = '#/'; return; }
  renderNav(area, view);
  window.scrollTo(0, 0);
  if (area === 'admin') {
    if (!isAdmin()) return login();
    const fn = adminViews[view];
    if (!fn) { location.hash = '#/admin/jugadores'; return; }
    return fn(app);
  }
  if (area === 'jugador') return playerView(app);
  home();
}

store.listeners.add((status, msg) => {
  const s = $('#sync');
  s.className = 'sync ' + status;
  s.textContent = { saved: 'Guardado', saving: 'Guardando…', dirty: 'Pendiente', error: 'Error al guardar', local: 'Solo local' }[status] || '';
  s.title = msg;
  if (status === 'error') toast(msg, true);
});

window.addEventListener('hashchange', route);
load().then(db => { bindPlayers(db.players); route(); });
