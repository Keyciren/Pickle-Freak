// Utilidades de interfaz y estado compartido.
import { store, save } from './store.js';
import { bindPlayers, uid } from './logic.js';

export const db = () => store.db;
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const pref = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

let toastTimer;
export function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast' + (err ? ' err' : ''); }, 3200);
}

export function commit() { bindPlayers(store.db.players); save(); }

export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function findOrCreatePlayer(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (!n) return null;
  let p = db().players.find(x => norm(x.name) === norm(n));
  if (!p) { p = { id: uid(), name: n, email: '', rut: '' }; db().players.push(p); bindPlayers(db().players); }
  return p.id;
}

export const activeTournaments = () => db().tournaments.filter(t => t.status !== 'finished').sort((a, b) => b.date.localeCompare(a.date));
export function currentTournament() {
  const list = activeTournaments();
  return list.find(t => t.id === pref.get('pf_cur')) || list[0] || null;
}
export function setCurrentTournament(id) { pref.set('pf_cur', id); }

// Asigna manejadores al contenedor de la vista (reemplaza los anteriores).
export function on(el, handlers) {
  for (const ev of ['click', 'change', 'input', 'submit', 'keydown']) el['on' + ev] = handlers[ev] || null;
}

// Re-renderiza conservando el foco en el elemento con id.
export function keepFocus(fn) {
  setTimeout(() => {
    const id = document.activeElement?.id;
    fn();
    if (id) { const el = document.getElementById(id); if (el) { el.focus(); el.select?.(); } }
  }, 0);
}
