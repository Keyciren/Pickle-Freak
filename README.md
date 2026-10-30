# PickleFreak 🥒
\nClub PickleFreak.

Web para gestionar torneos de pickleball: jugadores, niveles (Singles, Dobles, All Around), grupos, fases finales, programación de canchas, podio, histórico y exportación a Excel/imagen.

## Perfiles

- **Administrador** (con contraseña): Jugadores · Niveles · Parejas/Jugadores · Grupos · Programación · Histórico · Ajustes.
- **Jugador** (acceso libre): selecciona un torneo y ve posiciones, programación y puntajes; puede buscar a un jugador para destacar sus partidos.

Contraseña inicial de admin: `PickleFreak2026` (cámbiala en **Ajustes**).

## Base de datos

Los datos se guardan en [`data/db.json`](data/db.json) dentro de este repositorio:

- Los jugadores leen el archivo directamente desde GitHub, así ven los cambios desde cualquier dispositivo.
- El administrador guarda los cambios con un **token personal de GitHub** (fine‑grained, permiso *Contents: Read and write* solo sobre este repo), que se configura en **Ajustes** y queda guardado solo en su navegador.
- Sin token, los cambios quedan solo en el navegador del administrador.

Estructura: `players[]` (nombre, correo, RUT), `tournaments[]` → `levels[]` (modalidad, formatos, `entries[]`, `matches[]`) y `schedule` (canchas, horario, minutos por fase).

## Formatos de juego

- **Singles / Dobles**: todos contra todos dentro del grupo. Con 4 o más inscritos se juegan semifinales (1° vs 4°, 2° vs 3°, evitando cruces del mismo grupo), final y 3er lugar.
- **All Around**: los jugadores rotan de pareja; cada uno hace pareja con todos los demás del grupo. Ranking individual. Con 8 o más jugadores, los 8 mejores forman parejas (1°+8°, 2°+7°, 3°+6°, 4°+5°) para semifinales y finales.
- Desempate: partidos ganados → diferencia de puntos → puntos a favor.

## Desarrollo local

Sitio estático sin compilación:

```bash
python3 -m http.server 8000
```
