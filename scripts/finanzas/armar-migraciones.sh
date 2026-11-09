#!/usr/bin/env sh
# Junta las migraciones del Portal AF4 360° (0900 en adelante) en un solo archivo para pegar en el editor SQL de Supabase.
# Uso: sh scripts/finanzas/armar-migraciones.sh [salida.sql]   (por defecto: migraciones_af4.sql)
# El archivo se puede correr más de una vez: arranca borrando las vistas que las migraciones posteriores redefinen con
# más columnas (con sus dependientes) y el resto del archivo las vuelve a crear.
set -eu
SALIDA="${1:-migraciones_af4.sql}"
DIR="$(dirname "$0")/../../supabase/migrations"
{
  echo "-- Portal AF4 360°: migraciones del portal financiero en orden (necesita Postgres 15 o más)."
  echo "-- Se puede correr más de una vez."
  echo "drop view if exists fin_eerr_mensual, fin_eerr_movimientos, fin_reparto_pendiente, fin_flujo_mensual, del_semanas, conc_delivery_tiendas, fin_cartera_saldos cascade;"
  for f in $(ls "$DIR" | sort); do
    n=$(echo "$f" | cut -c1-4)
    case "$n" in [0-9][0-9][0-9][0-9]) ;; *) continue ;; esac
    if [ "$(echo "$n" | sed 's/^0*//')" -ge 900 ]; then
      echo
      echo "-- ===== $f ====="
      cat "$DIR/$f"
    fi
  done
} > "$SALIDA"
echo "Listo: $SALIDA"
