#!/usr/bin/env bash
# Levanta la vista previa local del portal con los datos de datos-privados/ (ver scripts/preview/README.md):
#   1. base PGlite con todas las migraciones + persona de la vista previa (solo la primera vez o con --rehacer)
#   2. PostgREST/Auth/Storage falsos en PREVIEW_SUPA_PORT (54321)
#   3. los Excel cargados con los importadores reales (solo la primera vez o con --rehacer)
#   4. `next build --webpack && next start` en PREVIEW_PORT (3100) con fuentes simuladas (sin red)
# Uso: scripts/preview/levantar.sh [--rehacer] [--sin-next] [--sin-build]   (PREVIEW_MODO=dev para next dev)
# Deja los procesos en segundo plano; `scripts/preview/levantar.sh --parar` los detiene.
set -euo pipefail
cd "$(dirname "$0")/../.."
RAIZ="$(pwd)"
export PREVIEW_DIR="${PREVIEW_DIR:-$RAIZ/.preview}"
export DATOS_PRIVADOS="${DATOS_PRIVADOS:-$RAIZ/datos-privados}"
SUPA_PORT="${PREVIEW_SUPA_PORT:-54321}"
PORT="${PREVIEW_PORT:-3100}"
DB="$PREVIEW_DIR/db"
mkdir -p "$PREVIEW_DIR"

parar() {
  # npx deja hijos vivos si solo se mata su pid: se buscan por la línea de comandos.
  pkill -f "next dev --webpack -p $PORT" 2>/dev/null || true
  pkill -f "next start -p $PORT" 2>/dev/null || true
  pkill -f "scripts/preview/postgrest.mts $DB" 2>/dev/null || true
  # y lo que siga escuchando en los puertos (next-server cambia su nombre de proceso).
  command -v fuser >/dev/null && { fuser -k -n tcp "$PORT" >/dev/null 2>&1 || true; fuser -k -n tcp "$SUPA_PORT" >/dev/null 2>&1 || true; }
  rm -f "$PREVIEW_DIR"/*.pid
  for _ in $(seq 1 20); do
    curl -s -o /dev/null "http://127.0.0.1:$PORT" || curl -s -o /dev/null "http://localhost:$SUPA_PORT" || break
    sleep 0.5
  done
}
if [[ " $* " == *" --parar "* ]]; then parar; echo "vista previa detenida"; exit 0; fi
parar

esperar() { # url, segundos
  for _ in $(seq 1 "$2"); do curl -s -o /dev/null "$1" && return 0; sleep 1; done
  echo "no responde $1" >&2; return 1
}

if [ -z "${PGLITE_DIR:-}" ] && [ ! -d node_modules/@electric-sql/pglite ] && [ ! -d "$HOME/.cache/preview-pglite/node_modules/@electric-sql/pglite" ]; then
  echo "== Instalando PGlite en ~/.cache/preview-pglite (no toca el package.json del repo)"
  npm i --silent --prefix "$HOME/.cache/preview-pglite" @electric-sql/pglite@0.5.10
fi

cat > "$PREVIEW_DIR/.env.preview" <<EOF
NEXT_PUBLIC_SUPABASE_URL=http://localhost:$SUPA_PORT
NEXT_PUBLIC_SUPABASE_ANON_KEY=preview
SUPABASE_SERVICE_ROLE_KEY=preview
NEXT_FONT_GOOGLE_MOCKED_RESPONSES=$RAIZ/scripts/preview/fuentes-mock.cjs
NEXT_TELEMETRY_DISABLED=1
EOF
set -a; . "$PREVIEW_DIR/.env.preview"; set +a

if [[ " $* " == *" --rehacer "* ]] || [ ! -f "$DB/.listo" ]; then
  echo "== Base: migraciones y persona de la vista previa"
  npx tsx scripts/preview/preparar.mts "$DB"
  REHACER_DATOS=1
fi

echo "== PostgREST falso en :$SUPA_PORT"
PREVIEW_LOG="$PREVIEW_DIR/postgrest.log" nohup npx tsx scripts/preview/postgrest.mts "$DB" "$SUPA_PORT" >"$PREVIEW_DIR/postgrest.out" 2>&1 &
echo $! > "$PREVIEW_DIR/postgrest.pid"
esperar "http://localhost:$SUPA_PORT/rest/v1/paises?select=id&limit=1" 60

if [ "${REHACER_DATOS:-0}" = 1 ]; then
  echo "== Datos de $DATOS_PRIVADOS"
  scripts/preview/cargar-datos.sh
  touch "$DB/.listo"
fi

if [[ " $* " == *" --sin-next "* ]]; then echo "listo (sin Next)"; exit 0; fi
# `next dev` llega a 5 GB al compilar todas las páginas y el sistema lo mata por memoria: por defecto se compila y se
# sirve la versión de producción (PREVIEW_MODO=dev para desarrollar con recarga en caliente).
if [ "${PREVIEW_MODO:-start}" = dev ]; then
  echo "== next dev en :$PORT"
  nohup npx next dev --webpack -p "$PORT" -H 127.0.0.1 >"$PREVIEW_DIR/next.out" 2>&1 &
else
  if [[ " $* " != *" --sin-build "* ]] || [ ! -f .next/BUILD_ID ]; then
    echo "== next build (unos minutos)"
    npx next build --webpack >"$PREVIEW_DIR/build.out" 2>&1 || { echo "falló el build: ver $PREVIEW_DIR/build.out" >&2; exit 1; }
  fi
  echo "== next start en :$PORT"
  nohup npx next start -p "$PORT" -H 127.0.0.1 >"$PREVIEW_DIR/next.out" 2>&1 &
fi
echo $! > "$PREVIEW_DIR/next.pid"
esperar "http://127.0.0.1:$PORT/login" 180
echo "Vista previa en http://127.0.0.1:$PORT (sesión: node scripts/preview/capturar.mjs pone la cookie sola)"
echo "Registros: $PREVIEW_DIR/{next.out,postgrest.log,carga.log}"
