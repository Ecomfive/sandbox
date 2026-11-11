// Lectura de las partes del EERR (vista `fin_eerr_partes`, migración 0929) con lo que hace falta para repartir A
// DISTRIBUIR con cualquier base: los envíos del mes, las unidades (con su canal) y la base guardada. Solo lectura; los
// permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import type { Seccion } from "./eerr";
import { leerBaseReparto, type BaseReparto, type EnvioMes, type ParteEerr } from "./reparto";

export const SIN_MIGRACION_PARTES = "Falta correr la migración 0929 (estados financieros) en Supabase.";

export interface UnidadPartes {
  id: string;
  nombre: string;
  clase: string;
  orden: number;
  entidad_id: string | null;
  recibe_reparto: boolean;
  /** null = sin canal. */
  canal: string | null;
}

export interface DatosPartes {
  partes: ParteEerr[];
  envios: EnvioMes[];
  unidades: UnidadPartes[];
  basePredeterminada: BaseReparto;
}

interface FilaVista {
  periodo: string;
  unidad_id: string;
  clase: string;
  entidad_id: string | null;
  tipo_id: string;
  seccion: Seccion;
  signo: number | string;
  monto: number | string;
  monto_local: number | string | null;
  monto_ic: number | string | null;
  monto_ic_local: number | string | null;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Las partes de los meses de `ventana` (y de una entidad, si se pide). Sin la migración 0929, `{ error }`. */
export async function cargarPartes(supabase: SupabaseClient, ventana: string[], entidadId: string | null = null): Promise<DatosPartes | { error: string }> {
  if (!ventana.length) return { partes: [], envios: [], unidades: [], basePredeterminada: "envios" };
  const desde = ventana[0];
  const hasta = ventana[ventana.length - 1];
  const [vista, tipos, unidades, envios, base] = await Promise.all([
    traerTodasConError<FilaVista>((a, b) => {
      let q = supabase
        .from("fin_eerr_partes")
        .select("periodo, unidad_id, clase, entidad_id, tipo_id, seccion, signo, monto, monto_local, monto_ic, monto_ic_local")
        .gte("periodo", desde)
        .lte("periodo", hasta)
        .order("periodo")
        .order("unidad_id")
        .order("tipo_id")
        .range(a, b);
      if (entidadId) q = q.eq("entidad_id", entidadId);
      return q.returns<FilaVista[]>();
    }),
    supabase.from("fin_tipos").select("id, nombre, orden"),
    supabase.from("fin_unidades").select("id, nombre, clase, orden, entidad_id, recibe_reparto, canal").order("orden"),
    traerTodasConError<{ periodo: string; unidad_id: string; envios: number }>((a, b) =>
      supabase.from("fin_base_distribucion").select("periodo, unidad_id, envios").gte("periodo", desde).lte("periodo", hasta).order("periodo").order("unidad_id").range(a, b),
    ),
    supabase.from("fin_config").select("valor").eq("clave", "base_reparto").maybeSingle(),
  ]);
  if (vista.error || unidades.error) return { error: SIN_MIGRACION_PARTES };
  if (tipos.error) return { error: "No se pudieron leer los tipos del libro." };
  const porId = new Map((tipos.data ?? []).map((t) => [t.id as string, { nombre: t.nombre as string, orden: t.orden as number }]));
  return {
    partes: (vista.data ?? []).map((f) => ({
      periodo: String(f.periodo).slice(0, 10),
      unidad_id: f.unidad_id,
      clase: f.clase,
      entidad_id: f.entidad_id ?? null,
      tipo: porId.get(f.tipo_id)?.nombre ?? "—",
      orden: porId.get(f.tipo_id)?.orden ?? 999,
      seccion: f.seccion,
      signo: num(f.signo),
      monto: num(f.monto),
      monto_local: num(f.monto_local),
      monto_ic: num(f.monto_ic),
      monto_ic_local: num(f.monto_ic_local),
    })),
    envios: (envios.data ?? []).map((e) => ({ periodo: String(e.periodo).slice(0, 10), unidad_id: e.unidad_id, envios: num(e.envios) })),
    unidades: ((unidades.data ?? []) as Record<string, unknown>[]).map((u) => ({
      id: String(u.id),
      nombre: String(u.nombre ?? ""),
      clase: String(u.clase ?? ""),
      orden: num(u.orden),
      entidad_id: (u.entidad_id as string | null) ?? null,
      recibe_reparto: u.recibe_reparto === true,
      canal: (u.canal as string | null) ?? null,
    })),
    basePredeterminada: base.error ? "envios" : leerBaseReparto(base.data?.valor),
  };
}
