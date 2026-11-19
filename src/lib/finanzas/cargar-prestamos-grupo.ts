// Lectura de Tesorería › Préstamos del grupo (migración 0983). La usan la página, sus acciones y la alerta de vencimientos.
// Solo lectura con el cliente de servicio; los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import type { ClaseParte, Confirmacion, MovGrupo, ParteGrupo, TipoMovGrupo } from "./prestamos-grupo";

export const SIN_MIGRACION_GRUPO = "Falta correr la migración 0983 (préstamos del grupo) en Supabase.";

export interface MovGrupoVista extends MovGrupo {
  medio: string | null;
  nota: string | null;
  origen: "manual" | "clickup" | "libro" | "sistema";
  soporte: string | null;
  origenClave: string | null;
}

export interface DatosGrupo {
  partes: (ParteGrupo & { activo: boolean })[];
  movs: MovGrupoVista[];
}

const COLUMNAS = "id, acreedor_id, deudor_id, tipo, fecha, vence, monto, concepto, ordenes, medio, nota, origen, origen_clave";

export async function cargarPrestamosGrupo(supabase: SupabaseClient): Promise<DatosGrupo | null> {
  const leer = (columnas: string) =>
    traerTodasConError<Record<string, unknown>>(
      (desde, hasta) =>
        supabase.from("fin_grupo_movimientos").select(columnas).order("fecha").order("id").range(desde, hasta) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>,
    );
  const [partes, conNaturaleza] = await Promise.all([
    supabase.from("fin_grupo_partes").select("id, nombre, clase, activo, orden").order("orden").order("nombre"),
    leer(`${COLUMNAS}, naturaleza, soporte`),
  ]);
  // Sin la migración 0989, sin naturaleza ni soporte (todo es deuda).
  const movs = conNaturaleza.error ? await leer(COLUMNAS) : conNaturaleza;
  if (partes.error || movs.error) return null;
  return {
    partes: (partes.data ?? []).map((p) => ({ id: p.id as string, nombre: p.nombre as string, clase: p.clase as ClaseParte, activo: p.activo !== false })),
    movs: (movs.data ?? []).map((m) => ({
      id: m.id as string,
      acreedorId: m.acreedor_id as string,
      deudorId: m.deudor_id as string,
      tipo: m.tipo as TipoMovGrupo,
      fecha: String(m.fecha).slice(0, 10),
      vence: m.vence ? String(m.vence).slice(0, 10) : null,
      monto: Number(m.monto),
      concepto: m.concepto as string,
      ordenes: (m.ordenes as string[] | null) ?? [],
      medio: (m.medio as string | null) ?? null,
      nota: (m.nota as string | null) ?? null,
      origen: m.origen as MovGrupoVista["origen"],
      naturaleza: m.naturaleza === "aporte" ? ("aporte" as const) : ("deuda" as const),
      soporte: (m.soporte as string | null) ?? null,
      origenClave: (m.origen_clave as string | null) ?? null,
    })),
  };
}

export interface TasaParte {
  id: string;
  nombre: string;
  tasaCiclo: number | null;
  diasCiclo: number | null;
}

/** La tasa por ciclo de cada financista (migración 0985). Sin la migración, null. */
export async function cargarTasasFinancistas(supabase: SupabaseClient): Promise<TasaParte[] | null> {
  const { data, error } = await supabase.from("fin_grupo_partes").select("id, nombre, tasa_ciclo, dias_ciclo").eq("clase", "financista").order("orden").order("nombre");
  if (error) return null;
  return (data ?? []).map((p) => ({
    id: p.id as string,
    nombre: p.nombre as string,
    tasaCiclo: p.tasa_ciclo === null || p.tasa_ciclo === undefined ? null : Number(p.tasa_ciclo),
    diasCiclo: p.dias_ciclo === null || p.dias_ciclo === undefined ? null : Number(p.dias_ciclo),
  }));
}

export interface TasaPar {
  acreedorId: string;
  deudorId: string;
  tasaAnual: number;
}

/** Tasas entre empresas y saldos confirmados (migración 0989). Sin la migración, null. */
export async function cargarExtrasGrupo(supabase: SupabaseClient): Promise<{ tasas: TasaPar[]; confirmaciones: Confirmacion[] } | null> {
  const [t, c] = await Promise.all([
    supabase.from("fin_grupo_pares").select("acreedor_id, deudor_id, tasa_anual"),
    supabase.from("fin_grupo_confirmaciones").select("id, acreedor_id, deudor_id, fecha_corte, saldo_acreedor, saldo_deudor, nota").order("fecha_corte", { ascending: false }).limit(200),
  ]);
  if (t.error || c.error) return null;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    tasas: (t.data ?? []).map((x) => ({ acreedorId: x.acreedor_id as string, deudorId: x.deudor_id as string, tasaAnual: Number(x.tasa_anual) })),
    confirmaciones: (c.data ?? []).map((x) => ({
      id: x.id as string,
      acreedorId: x.acreedor_id as string,
      deudorId: x.deudor_id as string,
      fechaCorte: String(x.fecha_corte).slice(0, 10),
      saldoAcreedor: num(x.saldo_acreedor),
      saldoDeudor: num(x.saldo_deudor),
      nota: (x.nota as string | null) ?? null,
    })),
  };
}
