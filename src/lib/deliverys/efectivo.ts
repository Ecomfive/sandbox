// Efectivo que cobran los repartidores, sacado de las órdenes de Ventas por tienda (migración 0921). El Excel de deliverys
// no trae lo cobrado contra entrega: son las órdenes ENTREGADAS pagadas en efectivo cuyo transportista es un repartidor.
// `del_transportistas` une cada transportista (como viene en la orden) con su repartidor; aquí se arma esa unión por
// nombre y alias y se lee el detalle de una semana. La vista `del_semanas` ya suma el efectivo; una semana con lo cobrado
// cargado a mano en sus entregas usa lo de las entregas. Prueba en `efectivo.test.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { nombreEnDescripcion, palabrasNombre } from "../conciliacion/nombres";
import { traerTodasConError } from "../supabase/paginar";
import { finSemana, redondear } from "./liquidacion";

export type OrigenEfectivo = "ordenes" | "manual" | "ninguno";

export const ETIQUETA_ORIGEN_EFECTIVO: Record<OrigenEfectivo, string> = {
  ordenes: "De las órdenes entregadas",
  manual: "Cargado en las entregas",
  ninguno: "Sin efectivo",
};

export interface RepartidorNombres {
  id: string;
  nombre: string;
  alias: string[];
}

/**
 * El repartidor de un transportista: aquel cuyo nombre o alias contiene todas las palabras del transportista (o al revés),
 * con la tolerancia de la conciliación (una letra distinta, «JULY» / «JULI»). Las palabras de zona no cuentan («DEMO ZONA
 * 5» es DEMO). Si calzan dos repartidores, o ninguno, null: lo decide una persona.
 */
export function repartidorDeTransportista(transportista: string, repartidores: RepartidorNombres[]): string | null {
  if (!palabrasNombre(transportista).length) return null;
  const candidatos = repartidores.filter((r) =>
    [r.nombre, ...r.alias].some((n) => nombreEnDescripcion(transportista, n) || (palabrasNombre(n).length > 0 && nombreEnDescripcion(n, transportista))),
  );
  return candidatos.length === 1 ? candidatos[0].id : null;
}

export interface TransportistaGuardado {
  transportista: string;
  repartidor_id: string | null;
  a_mano: boolean;
}

/** Lo que hay que guardar en `del_transportistas`: los nuevos y los automáticos que cambian (lo puesto a mano no se toca). */
export function cambiosTransportistas(
  vistos: string[],
  guardados: TransportistaGuardado[],
  repartidores: RepartidorNombres[],
): { transportista: string; repartidor_id: string | null }[] {
  const previo = new Map(guardados.map((g) => [g.transportista, g]));
  const salida: { transportista: string; repartidor_id: string | null }[] = [];
  for (const t of new Set(vistos)) {
    if (!t.trim()) continue;
    const g = previo.get(t);
    if (g?.a_mano) continue;
    const id = repartidorDeTransportista(t, repartidores);
    if (!g || g.repartidor_id !== id) salida.push({ transportista: t, repartidor_id: id });
  }
  return salida;
}

export interface ResultadoSincronizar {
  transportistas: number;
  cambios: number;
  /** Transportistas con órdenes en efectivo que no son de ningún repartidor (sin contar los que no son personas). */
  sinRepartidor: { transportista: string; efectivo: number; ordenes: number }[];
}

export const SIN_MIGRACION_EFECTIVO = "Falta correr la migración 0921 (efectivo de repartidores) en Supabase.";

/** Une los transportistas nuevos con su repartidor. Idempotente: si nada cambió, no escribe. */
export async function sincronizarTransportistas(supabase: SupabaseClient): Promise<{ error: string } | ResultadoSincronizar> {
  const [vistos, guardados, repartidores] = await Promise.all([
    traerTodasConError<{ transportista: string; ordenes: number; efectivo: number | string; repartidor_id: string | null }>((d, h) =>
      supabase.from("del_transportistas_vistos").select("transportista, ordenes, efectivo, repartidor_id").order("transportista").range(d, h),
    ),
    traerTodasConError<TransportistaGuardado>((d, h) => supabase.from("del_transportistas").select("transportista, repartidor_id, a_mano").order("transportista").range(d, h)),
    supabase.from("del_repartidores").select("id, nombre, alias").eq("activo", true),
  ]);
  if (vistos.error || guardados.error || repartidores.error) return { error: SIN_MIGRACION_EFECTIVO };
  const reps = ((repartidores.data ?? []) as RepartidorNombres[]).map((r) => ({ id: r.id, nombre: r.nombre, alias: r.alias ?? [] }));
  const cambios = cambiosTransportistas(
    (vistos.data ?? []).map((v) => v.transportista),
    guardados.data ?? [],
    reps,
  );
  for (let i = 0; i < cambios.length; i += 200) {
    const { error } = await supabase
      .from("del_transportistas")
      .upsert(cambios.slice(i, i + 200).map((c) => ({ ...c, a_mano: false, actualizado_en: new Date().toISOString() })), { onConflict: "transportista" });
    if (error) return { error: `No se pudo guardar la unión de transportistas: ${error.message}` };
  }
  const final = new Map([...(guardados.data ?? []).map((g) => [g.transportista, g.repartidor_id] as const), ...cambios.map((c) => [c.transportista, c.repartidor_id] as const)]);
  return {
    transportistas: (vistos.data ?? []).length,
    cambios: cambios.length,
    sinRepartidor: (vistos.data ?? [])
      .filter((v) => !final.get(v.transportista) && Number(v.efectivo) > 0 && palabrasNombre(v.transportista).length > 0)
      .map((v) => ({ transportista: v.transportista, efectivo: Number(v.efectivo), ordenes: Number(v.ordenes) }))
      .sort((a, b) => b.efectivo - a.efectivo),
  };
}

// ---------------------------------------------------------------------------------------------
// Detalle de una semana
// ---------------------------------------------------------------------------------------------

export interface OrdenEfectivo {
  /** `ven_ordenes.id` (no se guarda en el cierre). */
  id?: string;
  orden: string;
  tienda: string;
  fecha: string;
  monto: number;
}

export interface EfectivoSemana {
  origen: OrigenEfectivo;
  /** Lo que entra al cierre. */
  monto: number;
  /** Lo que dicen las órdenes (aunque mande lo cargado a mano, para comparar). */
  deOrdenes: number;
  ordenes: OrdenEfectivo[];
}

/** Qué efectivo usa el cierre: lo cargado en las entregas si hay alguno; si no, el de las órdenes. */
export function efectivoDelCierre(manual: { hay: boolean; efectivo: number }, ordenes: OrdenEfectivo[]): EfectivoSemana {
  const deOrdenes = redondear(ordenes.reduce((a, o) => a + o.monto, 0));
  if (manual.hay) return { origen: "manual", monto: redondear(manual.efectivo), deOrdenes, ordenes };
  return { origen: ordenes.length ? "ordenes" : "ninguno", monto: deOrdenes, deOrdenes, ordenes };
}

/** Lee del cierre guardado las órdenes del efectivo (jsonb), solo con la forma esperada. */
export function leerOrdenesGuardadas(v: unknown): OrdenEfectivo[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ orden: String(x.orden ?? ""), tienda: String(x.tienda ?? ""), fecha: String(x.fecha ?? "").slice(0, 10), monto: Number(x.monto) || 0 }))
    .filter((x) => x.orden && /^\d{4}-\d{2}-\d{2}$/.test(x.fecha));
}

/** Las órdenes en efectivo de un repartidor en una semana (jueves a miércoles), de la más vieja a la más nueva. */
export async function ordenesEfectivoSemana(supabase: SupabaseClient, repartidorId: string, semana: string): Promise<OrdenEfectivo[] | null> {
  const [r, unidades] = await Promise.all([
    traerTodasConError<{ orden_id: string; numero: string; fecha: string; monto: number | string; unidad_id: string }>((d, h) =>
      supabase
        .from("del_efectivo_ordenes")
        .select("orden_id, numero, fecha, monto, unidad_id")
        .eq("repartidor_id", repartidorId)
        .gte("fecha", semana)
        .lte("fecha", finSemana(semana))
        .order("fecha")
        .order("numero")
        .range(d, h),
    ),
    supabase.from("fin_unidades").select("id, nombre"),
  ]);
  if (r.error) return null;
  const nombre = new Map((unidades.data ?? []).map((u) => [u.id as string, u.nombre as string]));
  return (r.data ?? []).map((x) => ({
    id: x.orden_id,
    orden: String(x.numero),
    tienda: nombre.get(x.unidad_id) ?? "—",
    fecha: String(x.fecha).slice(0, 10),
    monto: Number(x.monto),
  }));
}

/** Cuánto de esas órdenes ya está conciliado con una línea del banco (pareja confirmada). null si no se pudo leer. */
export async function depositadoDeOrdenes(supabase: SupabaseClient, ordenes: OrdenEfectivo[]): Promise<number | null> {
  const monto = new Map(ordenes.filter((o) => o.id).map((o) => [o.id!, o.monto]));
  const ids = [...monto.keys()];
  let total = 0;
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase
      .from("conc_pares")
      .select("orden_id")
      .eq("estado", "confirmado")
      .eq("clase", "orden")
      .eq("orden_fuente", "ven_ordenes")
      .in("orden_id", ids.slice(i, i + 150));
    if (error) return null;
    for (const p of new Set((data ?? []).map((x) => x.orden_id as string))) total += monto.get(p) ?? 0;
  }
  return redondear(total);
}

/**
 * Mejora 60: cuánto de esas órdenes ya se remesó en el Pipeline (`ven_cod_remesa_ordenes`, remesas no anuladas). null si no se
 * puede saber (sin la migración 0956 o sin órdenes con id).
 */
export async function remesadoDeOrdenes(supabase: SupabaseClient, ordenes: OrdenEfectivo[]): Promise<number | null> {
  const ids = [...new Set(ordenes.map((o) => o.id).filter((x): x is string => !!x))];
  if (!ids.length) return null;
  let total = 0;
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from("ven_cod_remesa_ordenes").select("monto, ven_cod_remesas(anulada_en)").in("orden_id", ids.slice(i, i + 150));
    if (error) return null;
    for (const r of (data ?? []) as { monto: number | string; ven_cod_remesas: { anulada_en: string | null } | { anulada_en: string | null }[] | null }[]) {
      const rem = Array.isArray(r.ven_cod_remesas) ? r.ven_cod_remesas[0] : r.ven_cod_remesas;
      if (!rem?.anulada_en) total += Number(r.monto) || 0;
    }
  }
  return redondear(total);
}

/** Las órdenes para guardar en el cierre (sin el id interno). */
export const ordenesParaGuardar = (ordenes: OrdenEfectivo[]) => ordenes.map(({ orden, tienda, fecha, monto }) => ({ orden, tienda, fecha, monto }));

export interface EfectivoRepartidor {
  repartidorId: string;
  nombre: string;
  efectivo: number;
  ordenes: number;
  semanas: number;
}

/** Efectivo de cada repartidor en un rango de semanas (lo usan la tarea diaria y el resumen). */
export async function efectivoPorRepartidor(supabase: SupabaseClient, desde: string, hasta: string): Promise<{ error: string } | EfectivoRepartidor[]> {
  const [sem, reps] = await Promise.all([
    traerTodasConError<{ repartidor_id: string; semana: string; cobrado_efectivo: number | string; ordenes_efectivo: number }>((d, h) =>
      supabase.from("del_semanas").select("repartidor_id, semana, cobrado_efectivo, ordenes_efectivo").gte("semana", desde).lte("semana", hasta).order("semana").order("repartidor_id").range(d, h),
    ),
    supabase.from("del_repartidores").select("id, nombre"),
  ]);
  if (sem.error || reps.error) return { error: SIN_MIGRACION_EFECTIVO };
  const nombre = new Map((reps.data ?? []).map((r) => [r.id as string, r.nombre as string]));
  const m = new Map<string, EfectivoRepartidor>();
  for (const s of sem.data ?? []) {
    const x = m.get(s.repartidor_id) ?? { repartidorId: s.repartidor_id, nombre: nombre.get(s.repartidor_id) ?? "—", efectivo: 0, ordenes: 0, semanas: 0 };
    x.efectivo = redondear(x.efectivo + Number(s.cobrado_efectivo));
    x.ordenes += Number(s.ordenes_efectivo ?? 0);
    x.semanas += Number(s.cobrado_efectivo) > 0 ? 1 : 0;
    m.set(s.repartidor_id, x);
  }
  return [...m.values()].sort((a, b) => b.efectivo - a.efectivo);
}
