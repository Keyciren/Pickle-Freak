// Capa de datos: la base de datos es el archivo data/db.json del repositorio.
// - Lectura: API de GitHub (siempre fresca) con respaldo en el archivo publicado.
// - Escritura (solo admin): commit vía API de GitHub con un token personal.
// - Copia local en localStorage para trabajar sin conexión.
import { CONFIG } from './config.js';

const LS_DB = 'pf_db';
const LS_TOKEN = 'pf_token';
export const DEFAULT_HASH = 'af96a1c3fb74ec3a021b58721a75cf95e63e7fdfaf6d2b601b9a1f5b5d6fa375';

export function emptyDB() {
  return { version: 1, settings: { adminHash: DEFAULT_HASH }, players: [], tournaments: [], updatedAt: null };
}

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};

export const store = {
  db: emptyDB(),
  sha: null,
  status: 'local', // local | saving | saved | error | dirty
  statusMsg: '',
  listeners: new Set(),
};

function emit() { store.listeners.forEach(fn => fn(store.status, store.statusMsg)); }
function setStatus(s, msg = '') { store.status = s; store.statusMsg = msg; emit(); }

export const getToken = () => ls.get(LS_TOKEN) || '';
export function setToken(t) { t ? ls.set(LS_TOKEN, t.trim()) : ls.del(LS_TOKEN); }

const enc = s => btoa(unescape(encodeURIComponent(s)));
const dec = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
const apiUrl = () => `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.dbPath}`;
const headers = () => {
  const h = { Accept: 'application/vnd.github+json' };
  const t = getToken();
  if (t) h.Authorization = 'Bearer ' + t;
  return h;
};

function normalize(db) {
  const base = emptyDB();
  const out = Object.assign(base, db || {});
  out.settings = Object.assign({ adminHash: DEFAULT_HASH }, out.settings || {});
  out.players ||= [];
  out.tournaments ||= [];
  return out;
}

function readLocal() {
  try { return JSON.parse(ls.get(LS_DB) || 'null'); } catch { return null; }
}
function writeLocal(dirty) { ls.set(LS_DB, JSON.stringify({ db: store.db, dirty })); }

async function fetchRemote() {
  try {
    const r = await fetch(`${apiUrl()}?ref=${CONFIG.branch}`, { headers: headers(), cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      store.sha = j.sha;
      return JSON.parse(dec(j.content));
    }
  } catch { /* sigue con respaldo */ }
  try {
    const r = await fetch(`${CONFIG.dbPath}?t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch { /* sin conexión */ }
  return null;
}

export async function load() {
  const local = readLocal();
  const remote = await fetchRemote();
  if (local?.dirty) {
    store.db = normalize(local.db);
    if (getToken()) sync(); else setStatus('local', 'Cambios guardados solo en este navegador');
  } else if (remote) {
    store.db = normalize(remote);
    writeLocal(false);
    setStatus('saved', 'Sincronizado');
  } else if (local) {
    store.db = normalize(local.db);
    setStatus('local', 'Sin conexión: usando copia local');
  } else {
    store.db = emptyDB();
    setStatus('local', 'Base de datos nueva');
  }
  return store.db;
}

let timer = null;
export function save() {
  store.db.updatedAt = new Date().toISOString();
  writeLocal(true);
  if (!getToken()) { setStatus('local', 'Guardado solo en este navegador (configura el token en Ajustes)'); return; }
  setStatus('dirty', 'Cambios pendientes…');
  clearTimeout(timer);
  timer = setTimeout(sync, 1200);
}

let syncing = false, again = false;
export async function sync() {
  if (!getToken()) return false;
  if (syncing) { again = true; return; }
  syncing = true;
  setStatus('saving', 'Guardando en GitHub…');
  try {
    const cur = await fetch(`${apiUrl()}?ref=${CONFIG.branch}`, { headers: headers(), cache: 'no-store' });
    let sha;
    if (cur.ok) sha = (await cur.json()).sha;
    else if (cur.status !== 404) throw new Error(`GitHub respondió ${cur.status}`);
    const body = {
      message: `Actualizar base de datos (${new Date().toLocaleString('es-CL')})`,
      content: enc(JSON.stringify(store.db, null, 1)),
      branch: CONFIG.branch,
    };
    if (sha) body.sha = sha;
    const r = await fetch(apiUrl(), { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Token inválido o sin permisos de escritura' : `GitHub respondió ${r.status}`);
    store.sha = (await r.json()).content.sha;
    writeLocal(false);
    setStatus('saved', 'Guardado en la nube');
    return true;
  } catch (e) {
    setStatus('error', 'No se pudo guardar: ' + e.message);
    return false;
  } finally {
    syncing = false;
    if (again) { again = false; sync(); }
  }
}

export async function reloadRemote() {
  const remote = await fetchRemote();
  const local = readLocal();
  if (remote && !local?.dirty) { store.db = normalize(remote); writeLocal(false); }
  return store.db;
}

export function replaceDB(db) { store.db = normalize(db); save(); }

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
