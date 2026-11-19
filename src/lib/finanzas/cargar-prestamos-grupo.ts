// Lectura de Tesorería › Préstamos del grupo (migración 0983). La usan la página, sus acciones y la alerta de vencimientos.
// Solo lectura con el cliente de servicio; los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import type { ClaseParte, MovGrupo, ParteGrupo, TipoMovGrupo } from "./prestamos-grupo";

export const SIN_MIGRACION_GRUPO = "Falta correr la migración 0983 (préstamos del grupo) en Supabase.";

export interface MovGrupoVista extends MovGrupo {
  medio: string | null;
  nota: string | null;
  origen: "manual" | "clickup";
}

export interface DatosGrupo {
  partes: (ParteGrupo & { activo: boolean })[];
  movs: MovGrupoVista[];
}

export async function cargarPrestamosGrupo(supabase: SupabaseClient): Promise<DatosGrupo | null> {
  const [partes, movs] = await Promise.all([
    supabase.from("fin_grupo_partes").select("id, nombre, clase, activo, orden").order("orden").order("nombre"),
    traerTodasConError<Record<string, unknown>>((desde, hasta) =>
      supabase
        .from("fin_grupo_movimientos")
        .select("id, acreedor_id, deudor_id, tipo, fecha, vence, monto, concepto, ordenes, medio, nota, origen")
        .order("fecha")
        .order("id")
        .range(desde, hasta),
    ),
  ]);
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
      origen: m.origen as "manual" | "clickup",
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
