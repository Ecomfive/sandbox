// Lectura del Flujo de caja desde Supabase (vista `fin_flujo_mensual` y `fin_saldos_iniciales`, migración 0904). La
// comparten la página /flujo-caja y la descarga en Excel (/api/exportar-flujo). Solo lectura; los permisos los decide
// quien llama. Con la migración 0923 se puede pedir una entidad y su moneda; las cuentas en otra moneda vienen con lo
// necesario para pasar su saldo a la moneda en que se ve (`conversion`).

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { cargarTasasMes } from "./cargar-entidades";
import { MONEDA_BASE } from "./entidades";
import { rangoMeses, type Bloque, type ConversionFlujo, type CuentaFlujo, type FilaFlujo, type SaldoInicial, type Sentido } from "./flujo";

export interface DatosFlujo {
  filas: FilaFlujo[];
  cuentas: CuentaFlujo[];
  saldos: SaldoInicial[];
  /** Todos los meses desde el primero hasta el último con movimientos (sin huecos). */
  disponibles: string[];
  /** Si hay cuentas en otra moneda: cómo convertir sus saldos (pasarlo a `resumirFlujo`). */
  conversion: ConversionFlujo | null;
}

interface FilaVista {
  mes: string;
  cuenta_id: string | null;
  tipo_id: string | null;
  bloque: Bloque;
  sentido: Sentido;
  monto: number | string;
  monto_cuenta?: number | string | null;
  monto_local?: number | string | null;
  moneda_cuenta?: string | null;
}

/** Qué flujo se lee (migración 0923): una entidad, en su moneda (`local`) o en dólares. */
export interface OpcionesFlujo {
  entidadId?: string | null;
  /** La moneda de la entidad, si se ve en ella. */
  monedaLocal?: string | null;
}

const BASICAS = "mes, cuenta_id, tipo_id, bloque, sentido, monto";
const CON_MONEDA = `${BASICAS}, monto_cuenta, monto_local, moneda_cuenta`;

export async function cargarFlujo(supabase: SupabaseClient, opciones: OpcionesFlujo = {}): Promise<{ error: string } | DatosFlujo> {
  const leerVista = (columnas: string, conEntidad: boolean) =>
    traerTodasConError<FilaVista>((desde, hasta) => {
      let q = supabase.from("fin_flujo_mensual").select(columnas).order("mes").order("cuenta_id").order("tipo_id").order("unidad_id").range(desde, hasta);
      if (conEntidad && opciones.entidadId) q = q.eq("entidad_id", opciones.entidadId);
      return q.returns<FilaVista[]>();
    });
  const leerCuentas = async () => {
    const r = await supabase.from("fin_cuentas").select("id, nombre, clase, moneda, entidad_id").order("nombre");
    return r.error ? supabase.from("fin_cuentas").select("id, nombre, clase").order("nombre") : r;
  };
  const [conMoneda, tipos, cuentas, saldos] = await Promise.all([
    leerVista(CON_MONEDA, true),
    supabase.from("fin_tipos").select("id, nombre, orden"),
    leerCuentas(),
    supabase.from("fin_saldos_iniciales").select("cuenta_id, fecha, monto"),
  ]);
  // Sin la migración 0923 la vista no tiene las columnas de moneda: el flujo de siempre (todo, en dólares).
  const multimoneda = !conMoneda.error;
  const vista = multimoneda ? conMoneda : await leerVista(BASICAS, false);
  if (vista.error || saldos.error) return { error: "Falta correr la migración 0904 (flujo de caja) en Supabase." };
  if (tipos.error || cuentas.error) return { error: "No se pudieron leer los catálogos del libro." };
  const local = multimoneda && !!opciones.monedaLocal && opciones.monedaLocal !== MONEDA_BASE;
  const monedaVista = local ? opciones.monedaLocal! : MONEDA_BASE;
  const porId = new Map((tipos.data ?? []).map((t) => [t.id as string, { nombre: t.nombre as string, orden: t.orden as number }]));
  // La vista viene por tienda: aquí se junta por mes, cuenta, tipo, bloque y sentido.
  const juntas = new Map<string, FilaFlujo>();
  const r2 = (v: number) => Math.round(v * 100) / 100;
  for (const f of vista.data ?? []) {
    const mes = String(f.mes).slice(0, 10);
    const monto = Number(local ? (f.monto_local ?? 0) : f.monto);
    const montoCuenta = multimoneda ? Number(f.monto_cuenta ?? f.monto) : monto;
    const clave = `${mes}|${f.cuenta_id ?? ""}|${f.tipo_id ?? ""}|${f.bloque}|${f.sentido}`;
    const previa = juntas.get(clave);
    if (previa) {
      previa.monto = r2(previa.monto + monto);
      previa.monto_cuenta = r2((previa.monto_cuenta ?? 0) + montoCuenta);
    } else
      juntas.set(clave, {
        mes,
        cuenta_id: f.cuenta_id,
        tipo: f.tipo_id ? (porId.get(f.tipo_id)?.nombre ?? "—") : "Sin tipo",
        orden: f.tipo_id ? (porId.get(f.tipo_id)?.orden ?? 999) : 999,
        bloque: f.bloque,
        sentido: f.sentido,
        monto,
        monto_cuenta: montoCuenta,
      });
  }
  const filas = [...juntas.values()];
  const meses = filas.map((f) => f.mes).sort();
  const filasCuentas = (cuentas.data ?? []) as (CuentaFlujo & { moneda?: string; entidad_id?: string | null })[];
  // Los saldos de una entidad son los de sus cuentas.
  const deLaEntidad = (id: string) => !opciones.entidadId || filasCuentas.find((c) => c.id === id)?.entidad_id === opciones.entidadId;
  const monedaCuenta: Record<string, string> = {};
  for (const c of filasCuentas) if (c.moneda && c.moneda !== monedaVista) monedaCuenta[c.id] = c.moneda;
  // Una cuenta en la moneda en que se ve no necesita conversión; si alguna está en otra, se leen las tasas.
  const usadas = new Set([...filas.map((f) => f.cuenta_id), ...(saldos.data ?? []).map((s) => s.cuenta_id as string)]);
  for (const id of Object.keys(monedaCuenta)) if (!usadas.has(id)) delete monedaCuenta[id];
  const monedas = [...new Set([...Object.values(monedaCuenta), monedaVista])].filter((m) => m !== MONEDA_BASE);
  const conversion: ConversionFlujo | null = Object.keys(monedaCuenta).length
    ? { moneda: monedaVista, monedaCuenta, tasas: await cargarTasasMes(supabase, monedas) }
    : null;
  return {
    filas,
    cuentas: filasCuentas.map((c) => ({ id: c.id, nombre: c.nombre, clase: c.clase })),
    saldos: (saldos.data ?? [])
      .filter((s) => deLaEntidad(s.cuenta_id as string))
      .map((s) => ({ cuenta_id: s.cuenta_id as string, fecha: String(s.fecha).slice(0, 10), monto: Number(s.monto) })),
    disponibles: meses.length ? rangoMeses(meses[0], meses[meses.length - 1]) : [],
    conversion,
  };
}
