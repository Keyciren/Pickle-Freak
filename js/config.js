// Configuración del repositorio que actúa como base de datos (data/db.json).
// Si la web se publica en <usuario>.github.io/<repo>/ se detecta automáticamente.
const host = location.hostname;
const pathRepo = location.pathname.split('/').filter(Boolean)[0];
const onPages = host.endsWith('.github.io');

export const CONFIG = {
  owner: onPages ? host.replace('.github.io', '') : 'Keyciren',
  repo: onPages && pathRepo ? pathRepo : 'Pickle-Freak',
  branch: 'main',
  dbPath: 'data/db.json',
};
