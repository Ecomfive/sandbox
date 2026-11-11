// Lectura de lo que hace falta para pasar la nómina de un mes al libro (migración 0917). La usan la conciliación de
// nómina (el cuadro y el botón) y la acción que escribe, para que muestren y hagan exactamente lo mismo. Solo lectura;
// los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ajusteActivo } from "../finanzas/config";
import { traerTodasConError } from "../supabase/paginar";
import { estaCerrado, planNominaAlLibro, type LineaAlLibro, type PlanAlLibro, type SueldoLibro } from "./al-libro";
import { TIPO_LIBRO } from "./conciliacion";
import { UNIDAD_REPARTO, type TipoNomina } from "./excel";

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export interface DatosAlLibro {
  activo: boolean;
  cerrado: boolean;
  plan: PlanAlLibro;
}

/** Si `fin_cierres` (de otro módulo) existe y tiene ese mes cerrado. Si la tabla no existe, el mes está abierto. */
export async function mesCerrado(supabase: SupabaseClient, periodo: string): Promise<boolean> {
  const { data, error } = await supabase.from("fin_cierres").select("*").eq("periodo", periodo).limit(1);
  if (error) return false;
  return estaCerrado((data ?? [])[0] as Record<string, unknown> | undefined);
}

/** El plan de un mes (lo que hay en el libro, lo que se crearía y el cuadro por tienda). Error sin la migración 0917. */
export async function cargarAlLibro(supabase: SupabaseClient, periodo: string): Promise<{ error: string } | DatosAlLibro> {
  const [activo, cerrado, tipos, reparto, lineas] = await Promise.all([
    ajusteActivo(supabase, "nomina_al_libro"),
    mesCerrado(supabase, periodo),
    supabase.from("fin_tipos").select("id, nombre").in("nombre", Object.values(TIPO_LIBRO)),
    supabase.from("fin_unidades").select("id").eq("nombre", UNIDAD_REPARTO).maybeSingle(),
    traerTodasConError<{ tipo: TipoNomina; unidad_id: string | null; neto: number | string; fecha_pago: string | null; nom_personas: Uno<{ unidad_id: string | null }> }>((d, h) =>
      supabase.from("nom_lineas").select("tipo, unidad_id, neto, fecha_pago, nom_personas(unidad_id)").eq("periodo", periodo).order("id").range(d, h),
    ),
  ]);
  if (tipos.error || reparto.error || !reparto.data) return { error: "Falta correr la migración 0901 (libro de movimientos) en Supabase." };
  if (lineas.error) return { error: "Falta correr la migración 0906 (Nómina) en Supabase." };
  const tipoDe = new Map<string, TipoNomina>(
    (tipos.data ?? []).map((t) => [t.id as string, String(t.nombre).toUpperCase() === TIPO_LIBRO.formal ? "formal" : "externa"]),
  );
  const ids = [...tipoDe.keys()];
  const libro = ids.length
    ? await traerTodasConError<{ id: string; unidad_id: string; tipo_id: string; en_eerr: boolean; monto: number | string; origen: string; descripcion: string; reemplazado_por: string | null }>((d, h) =>
        supabase
          .from("fin_movimientos")
          .select("id, unidad_id, tipo_id, en_eerr, monto, origen, descripcion, reemplazado_por")
          .eq("periodo", periodo)
          .in("tipo_id", ids)
          .order("id")
          .range(d, h),
      )
    : { data: [], error: null };
  if (libro.error) return { error: "Falta correr la migración 0917 (ajustes de Finanzas) en Supabase." };

  const lineasAlLibro: LineaAlLibro[] = (lineas.data ?? []).map((l) => ({
    tipo: l.tipo,
    unidadId: l.unidad_id ?? uno(l.nom_personas)?.unidad_id ?? null,
    neto: Number(l.neto),
    fechaPago: l.fecha_pago,
  }));
  const sueldos: SueldoLibro[] = (libro.data ?? []).map((m) => ({
    id: m.id,
    unidadId: m.unidad_id,
    tipo: tipoDe.get(m.tipo_id) ?? "formal",
    monto: Number(m.monto),
    enEerr: m.en_eerr,
    origen: m.origen,
    descripcion: m.descripcion ?? "",
    reemplazadoPor: m.reemplazado_por,
  }));
  return { activo, cerrado, plan: planNominaAlLibro(periodo, lineasAlLibro, sueldos, reparto.data.id as string) };
}
