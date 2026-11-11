# Vista previa local del portal

Para ver las pantallas con datos de verdad sin Supabase ni deploy: una base PGlite con todas las migraciones del repo,
un PostgREST falso delante, los Excel de `datos-privados/` cargados con los importadores reales y `next dev` sin red.
Nada de esto lleva datos: los Excel se leen de `datos-privados/` (ignorada por git) cada vez que se arma la base.

## Requisitos

- `node_modules` del repo (trae `playwright` y `tsx`).
- PGlite, que no es dependencia del repo: `levantar.sh` la instala sola en `~/.cache/preview-pglite` (hace falta acceso al
  registro de npm la primera vez), o se apunta a una copia propia con `PGLITE_DIR=<carpeta>/node_modules/@electric-sql/pglite`.
- Un Chromium para Playwright (`PLAYWRIGHT_BROWSERS_PATH`, por defecto `/opt/pw-browsers`; si su versión no es la que
  espera Playwright, `capturar.mjs` usa el que encuentre, o `CHROMIUM_PATH`).
- Las fuentes Inter del sistema (`/usr/share/fonts/opentype/inter`, o `INTER_DIR`); sin ellas el navegador usa la de
  reserva.

## Levantar

```sh
DATOS_PRIVADOS=/ruta/a/datos-privados scripts/preview/levantar.sh   # la primera vez arma la base y carga los Excel (~3 min) y compila (~4 min)
scripts/preview/levantar.sh --sin-build                            # reusa la base y la compilación anterior (segundos)
scripts/preview/levantar.sh --rehacer                              # vuelve a armar la base desde cero
PREVIEW_MODO=dev scripts/preview/levantar.sh                       # next dev (recarga en caliente y avisos de React)
scripts/preview/levantar.sh --parar                                # detiene los procesos
```

Por defecto compila y sirve la versión de producción (`next build --webpack && next start`): `next dev` llega a unos 5 GB
al compilar todas las páginas y el sistema lo mata por memoria. Con `PREVIEW_MODO=dev` sirve para revisar pocas páginas
(los avisos de hidratación y de `key` solo salen en desarrollo). Queda en `http://127.0.0.1:3100` (`PREVIEW_PORT`) con el PostgREST falso en `http://localhost:54321`
(`PREVIEW_SUPA_PORT`). Todo lo generado va a `.preview/` (`PREVIEW_DIR`, ignorada por git): la base, `.env.preview`,
`next.out`, `postgrest.log` y `carga.log`.

## Capturar

```sh
node scripts/preview/calentar.mjs                       # compila cada página y dice su estado HTTP (rápido, sin navegador)
node scripts/preview/capturar.mjs                       # todo el Portal AF4 (rutas.mjs) en claro, oscuro y celular
node scripts/preview/capturar.mjs /flujo-caja /nomina   # solo esas (se suman al informe anterior)
node scripts/preview/capturar.mjs --salida=/tmp/capturas --variantes=claro
```

Deja `<salida>/<sección>/<página>-<variante>.png` (página completa; en escritorio la ventana se agranda al alto de la
página para que lo fijo —menú, fila de totales— quede donde va; escritorio 1440×900 claro y oscuro, celular
390×844 claro), `informe.json` con el estado, el tiempo y los avisos de la consola de cada una, e `indice.html` con
todas en miniatura. `/presupuesto/:id` usa el último presupuesto o crea uno con «Agregar» (la acción real);
`/cierre-mes/:periodo` toma el último mes cerrado del libro.

La sesión es una cookie de `@supabase/ssr` para la persona «Vista previa» (rol con todos los módulos, ver
`sesion.mjs`); para abrir la vista previa en un navegador propio hay que poner esa cookie a mano.

## Piezas

| Archivo | Qué hace |
| --- | --- |
| `base.mts` | Stubs de `auth` y `storage` de Supabase + todas las migraciones de `supabase/migrations/` en orden. |
| `preparar.mts` | Crea la base en una carpeta, la persona de la vista previa y carga `datos-privados/semilla-socios.sql` si existe. |
| `postgrest.mts` | PostgREST + Auth + Storage falsos (ver el comentario de arriba del archivo para lo que entiende). |
| `cargar-datos.sh` | Corre `scripts/finanzas/importar-*.ts --aplicar` y `recalcular-clientes.ts` contra el falso. |
| `fuentes-mock.cjs` | Respuesta simulada de Google Fonts (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES`, mecanismo oficial de Next). |
| `levantar.sh` | Junta todo lo anterior y arranca Next con webpack (Turbopack no acepta un `node_modules` enlazado fuera del proyecto, como el de un worktree). |
| `calentar.mjs`, `capturar.mjs`, `rutas.mjs` | Revisión rápida y capturas con Playwright. |

## Cómo leer los errores

`postgrest.log` anota cada consulta que no se pudo responder: **`FALSO`** es una limitación del PostgREST falso (una
forma de `select` o de filtro que no entiende: no es un error del portal), **`SQL`** es Postgres rechazando la consulta
(columna o tabla que no existe, tipo equivocado…): casi siempre un error real del código o una migración que falta.
Los errores de las páginas (Server Components) salen en `next.out`, y los del navegador en `informe.json`.

**`TOPE`** avisa que una consulta sin `range` pidió más de 1 000 filas y se cortó, como en Supabase (max-rows): si el
código no pagina, a esa página le faltan datos. El falso no reproduce RLS ni los permisos de PostgREST (la app usa la
clave de servicio) ni Storage (las direcciones firmadas no llevan a ningún archivo).
