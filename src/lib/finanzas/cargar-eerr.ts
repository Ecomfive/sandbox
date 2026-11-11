// Lectura del Estado de resultados desde Supabase (vista `fin_eerr_mensual`, migración 0901). La comparten la página
// /estado-resultados y la descarga en Excel (/api/exportar-eerr). Solo lectura; los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { armarEerr, recortarInicio, type Eerr, type FilaEerr, type Seccion } from "./eerr";
import { UNIDAD_SIN_ASIGNAR } from "./libro-excel";

export interface UnidadEerr {
  id: string;
  nombre: string;
  clase: string;
  orden: number;
  /** La entidad (migración 0923); sin la migración, null. */
  entidad_id?: string | null;
}

/** «SIN ASIGNAR» y su par de otra entidad («SIN ASIGNAR CR»). */
const esSinAsignar = (nombre: string) => nombre === UNIDAD_SIN_ASIGNAR || nombre.startsWith(`${UNIDAD_SIN_ASIGNAR} `);

/**
 * Las unidades que se pueden elegir en el EERR: las tiendas y CORPORATIVO (A DISTRIBUIR ya está repartido). Con
 * `entidadId`, solo las de esa entidad.
 */
export async function unidadesEerr(
  supabase: SupabaseClient,
  entidadId: string | null = null,
): Promise<{ error: string } | { unidades: UnidadEerr[] }> {
  const leer = (columnas: string) => supabase.from("fin_unidades").select(columnas).eq("activo", true).order("orden");
  let r = await leer("id, nombre, clase, orden, entidad_id");
  // Sin la migración 0923 no hay entidad_id.
  if (r.error) r = await leer("id, nombre, clase, orden");
  if (r.error) return { error: r.error.message };
  const unidades = ((r.data ?? []) as unknown as UnidadEerr[]).filter(
    (u) => u.clase !== "reparto" && !esSinAsignar(u.nombre) && u.nombre !== "INFORMACIÓN" && (!entidadId || u.entidad_id === entidadId),
  );
  return { unidades };
}

interface FilaVista {
  periodo: string;
  unidad_id: string;
  tipo_id: string;
  seccion: Seccion;
  signo: number;
  monto: number | string;
  monto_local?: number | string | null;
}

/** Qué parte del EERR se lee (migración 0923): una entidad y, si se pide, en su moneda (`monto_local`). */
export interface OpcionesEerr {
  entidadId?: string | null;
  local?: boolean;
  /** Solo estas unidades (permisos por tienda, mejora 99); vacío = ninguna. */
  unidades?: string[] | null;
}

/**
 * El EERR de una unidad (o de todas, con `null`) en los meses de la ventana, sin los meses iniciales vacíos. Con
 * `opciones.entidadId`, solo esa entidad; con `opciones.local`, en la moneda de la entidad.
 */
export async function cargarEerr(
  supabase: SupabaseClient,
  unidadId: string | null,
  ventana: string[],
  opciones: OpcionesEerr = {},
): Promise<{ error: string } | { eerr: Eerr; conDatos: Set<string>; filas: FilaEerr[] }> {
  const columnas: string = opciones.local
    ? "periodo, unidad_id, tipo_id, seccion, signo, monto, monto_local"
    : "periodo, unidad_id, tipo_id, seccion, signo, monto";
  const [tipos, vista] = await Promise.all([
    supabase.from("fin_tipos").select("id, nombre, orden"),
    traerTodasConError<FilaVista>((desde, hasta) => {
      let q = supabase
        .from("fin_eerr_mensual")
        .select(columnas)
        .gte("periodo", ventana[0])
        .lte("periodo", ventana[ventana.length - 1])
        .order("periodo")
        .order("unidad_id")
        .order("tipo_id")
        .range(desde, hasta);
      if (unidadId) q = q.eq("unidad_id", unidadId);
      if (opciones.entidadId) q = q.eq("entidad_id", opciones.entidadId);
      if (opciones.unidades) q = q.in("unidad_id", opciones.unidades.length ? opciones.unidades : ["00000000-0000-0000-0000-000000000000"]);
      return q.returns<FilaVista[]>();
    }),
  ]);
  if (tipos.error) return { error: tipos.error.message };
  if (vista.error) return { error: "No se pudo leer el EERR." };
  const porId = new Map((tipos.data ?? []).map((t) => [t.id as string, { nombre: t.nombre as string, orden: t.orden as number }]));
  const filas: FilaEerr[] = (vista.data ?? []).map((f) => ({
    periodo: String(f.periodo).slice(0, 10),
    unidad_id: f.unidad_id,
    tipo: porId.get(f.tipo_id)?.nombre ?? "—",
    orden: porId.get(f.tipo_id)?.orden ?? 999,
    seccion: f.seccion,
    signo: Number(f.signo),
    monto: Number(opciones.local ? (f.monto_local ?? 0) : f.monto),
  }));
  const conDatos = new Set(filas.map((f) => f.periodo));
  // `filas` va también para quien arma el EERR de otro período dentro de la misma ventana (el Portal AF4).
  return { eerr: armarEerr(filas, recortarInicio(ventana, conDatos)), conDatos, filas };
}
