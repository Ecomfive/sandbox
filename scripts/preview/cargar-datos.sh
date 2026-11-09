#!/usr/bin/env bash
# Carga los Excel de datos-privados/ en la base de la vista previa con los importadores reales del repo
# (scripts/finanzas/*.ts --aplicar), contra el PostgREST falso que ya debe estar arriba.
# Uso: scripts/preview/cargar-datos.sh   (lee NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y DATOS_PRIVADOS del entorno)
set -uo pipefail
cd "$(dirname "$0")/../.."
DP="${DATOS_PRIVADOS:-datos-privados}"
LOG="${PREVIEW_DIR:-.preview}/carga.log"
: > "$LOG"
fallas=0

correr() {
  local nombre="$1"; local script="$2"; shift 2
  local archivo="$DP/$nombre"
  if [ ! -f "$archivo" ]; then echo "  (falta $archivo: se salta)"; return; fi
  echo "· $script $nombre"
  if ! npx tsx "$script" "$archivo" "$@" --aplicar >>"$LOG" 2>&1; then
    echo "  ✗ falló (ver $LOG)"; fallas=$((fallas + 1))
  fi
}

# El orden importa: el libro crea tiendas, tipos y formas de pago que usan los demás.
correr GASTOS_PANAMA_2026.xlsx scripts/finanzas/importar-libro.ts
correr GASTOS_PANAMA_2026.xlsx scripts/finanzas/importar-cartera.ts
correr GASTOS_PANAMA_2026.xlsx scripts/finanzas/importar-bienes-uso.ts
correr PRECIOS_DE_COSTE_MERCANCIA.xlsx scripts/finanzas/importar-costos.ts
correr GESTION_OCEANS_PANAMA.xlsx scripts/finanzas/importar-ventas.ts
correr PLANILLA_FORMAL_PANAMA.xlsx scripts/finanzas/importar-nomina.ts --libro="$DP/GASTOS_PANAMA_2026.xlsx"
correr NOMINA_EXTRANJERA.xlsx scripts/finanzas/importar-nomina.ts --libro="$DP/GASTOS_PANAMA_2026.xlsx"
correr GESTION_DELIVERYS_SEPTIEMBRE_2026.xlsx scripts/finanzas/importar-deliverys.ts --libro="$DP/GASTOS_PANAMA_2026.xlsx"
correr CONCILIACIONES_DE_BANCO_PRUEBA.xlsx scripts/finanzas/importar-conciliacion.ts --libro="$DP/GASTOS_PANAMA_2026.xlsx"
echo "· scripts/finanzas/recalcular-clientes.ts"
npx tsx scripts/finanzas/recalcular-clientes.ts --aplicar >>"$LOG" 2>&1 || { echo "  ✗ falló (ver $LOG)"; fallas=$((fallas + 1)); }
echo "carga terminada: $fallas importadores con error"
